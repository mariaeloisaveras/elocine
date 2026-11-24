import subprocess
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import requests

from backend.infrastructure.media.proxy import MediaProxy
from backend.infrastructure.media.transcoder import conversion_command, ffmpeg_path


class RelayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.seen = []
        cls.fixture = b""

        class Upstream(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                cls.seen.append((self.path, dict(self.headers)))
                if self.path == "/redirect.m3u8":
                    self.send_response(302)
                    self.send_header("Location", "/hls/master.m3u8")
                    self.end_headers()
                    return
                status, kind = 200, "application/octet-stream"
                if self.path == "/hls/master.m3u8":
                    body = (
                        b'#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n'
                        b"#EXT-X-STREAM-INF:BANDWIDTH=100000\nvideo.m3u8?ticket=secret\n"
                    )
                    kind = "application/vnd.apple.mpegurl"
                elif self.path == "/hls/video.m3u8?ticket=secret":
                    body = (
                        b'#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n'
                        b'#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\nsegment.ts\n'
                    )
                elif self.path == "/hls/segment.ts":
                    body, kind = b"video-segment", "video/mp2t"
                elif self.path == "/movie.mp4":
                    body, kind = b"0123456789", "video/mp4"
                    if self.headers.get("Range") == "bytes=2-5":
                        status, body = 206, body[2:6]
                elif self.path == "/slow.mp4":
                    size = 4 * 1024 * 1024
                    self.send_response(200)
                    self.send_header("Content-Type", "video/mp4")
                    self.send_header("Content-Length", str(size))
                    self.end_headers()
                    try:
                        for _ in range(size // 65536):
                            self.wfile.write(b"x" * 65536)
                            self.wfile.flush()
                            time.sleep(0.01)
                    except OSError:
                        pass
                    return
                elif self.path == "/fixture.ts":
                    body, kind = cls.fixture, "video/mp2t"
                elif self.path == "/refused":
                    status, body = 403, b"secret provider credentials"
                else:
                    body, kind = b"<html>Not a video</html>", "text/html"
                self.send_response(status)
                self.send_header("Content-Type", kind)
                self.send_header("Content-Length", str(len(body)))
                if status == 206:
                    self.send_header("Content-Range", "bytes 2-5/10")
                    self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                self.wfile.write(body)

        cls.upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        threading.Thread(target=cls.upstream.serve_forever, daemon=True).start()
        cls.origin = f"http://127.0.0.1:{cls.upstream.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.upstream.shutdown()
        cls.upstream.server_close()

    def setUp(self):
        self.proxy = MediaProxy()

    def tearDown(self):
        self.proxy.close()

    def register(self, path, transcode=False, prefetch=False):
        return self.proxy.register(
            self.origin + path, {"User-Agent": "VLC/test"}, transcode, prefetch
        )

    def test_episode_download_is_shared_across_ranges_and_removed_on_stop(self):
        before = sum(path == "/movie.mp4" for path, _ in self.seen)
        token, url = self.register("/movie.mp4", prefetch=True)
        first = requests.get(url, headers={"Range": "bytes=0-1"}, timeout=5)
        self.assertEqual(first.status_code, 206)
        self.assertEqual(first.content, b"01")
        second = requests.get(url, headers={"Range": "bytes=5-9"}, timeout=5)
        self.assertEqual(second.content, b"56789")
        suffix = requests.get(url, headers={"Range": "bytes=-3"}, timeout=5)
        self.assertEqual(suffix.content, b"789")
        progress = self.proxy.progress(token)
        self.assertEqual(progress["size"], 10)
        self.assertEqual(progress["total"], 10)
        after = sum(path == "/movie.mp4" for path, _ in self.seen)
        self.assertEqual(after - before, 1)
        path = Path(self.proxy.playbacks[token].buffer.path)
        self.assertTrue(path.exists())
        self.proxy.revoke(token)
        self.assertFalse(path.exists())

    def test_prefetch_errors_finish_instead_of_hanging(self):
        token, url = self.register("/refused", prefetch=True)
        response = requests.get(url, timeout=5)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("secret", response.text)
        self.assertTrue(self.proxy.playbacks[token].buffer.done)

    def test_download_continues_after_browser_stops_reading(self):
        token, url = self.register("/slow.mp4", prefetch=True)
        response = requests.get(url, headers={"Range": "bytes=0-1"}, timeout=5)
        self.assertEqual(response.content, b"xx")
        buffer = self.proxy.playbacks[token].buffer
        deadline = time.monotonic() + 5
        with buffer.condition:
            while not buffer.done and time.monotonic() < deadline:
                buffer.condition.wait(timeout=0.1)
        self.assertTrue(buffer.done)
        self.assertEqual(buffer.size, 4 * 1024 * 1024)
        self.assertIsNone(buffer.error)

    def test_conversion_downloads_to_disk_and_reuses_the_converted_file(self):
        if not ffmpeg_path():
            self.skipTest("FFmpeg not installed")
        exe = ffmpeg_path()
        generated = subprocess.run(
            [
                exe,
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=size=160x120:rate=25",
                "-t",
                "1",
                "-c:v",
                "mpeg2video",
                "-f",
                "mpegts",
                "pipe:1",
            ],
            capture_output=True,
            timeout=20,
            check=True,
        )
        type(self).fixture = generated.stdout
        token, url = self.register("/fixture.ts", transcode=True, prefetch=True)
        response = requests.get(url, timeout=30)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"ftyp", response.content[:32])
        buffer = self.proxy.playbacks[token].buffer
        self.assertTrue(buffer.done)
        self.assertIsNone(buffer.error)
        self.assertEqual(buffer.total, len(response.content))
        seek = requests.get(url, headers={"Range": "bytes=0-31"}, timeout=5)
        self.assertEqual(seek.status_code, 206)
        self.assertEqual(seek.content, response.content[:32])

    def test_redirect_and_nested_playlist_routes_keys_and_segments(self):
        _, url = self.register("/redirect.m3u8")
        master = requests.get(url, timeout=5)
        self.assertEqual(master.status_code, 200)
        self.assertEqual(master.headers["Access-Control-Allow-Origin"], "*")
        self.assertNotIn("secret", master.text)
        child_url = [line for line in master.text.splitlines() if not line.startswith("#")][0]
        child = requests.get(child_url, timeout=5)
        self.assertEqual(child.text.count(self.proxy.origin), 3)
        segment_url = child.text.splitlines()[-1]
        segment = requests.get(segment_url, timeout=5)
        self.assertEqual(segment.content, b"video-segment")
        self.assertEqual(self.seen[-1][1]["User-Agent"], "VLC/test")

    def test_byte_ranges_for_movie_seeking(self):
        _, url = self.register("/movie.mp4")
        r = requests.get(url, headers={"Range": "bytes=2-5"}, timeout=5)
        self.assertEqual(r.status_code, 206)
        self.assertEqual(r.content, b"2345")
        self.assertEqual(r.headers["Content-Range"], "bytes 2-5/10")

    def test_no_upstream_error_body_leaks(self):
        _, url = self.register("/refused")
        r = requests.get(url, timeout=5)
        self.assertEqual(r.status_code, 403)
        self.assertNotIn("secret", r.text)

    def test_html_is_rejected_as_invalid_video(self):
        _, url = self.register("/invalid")
        self.assertEqual(requests.get(url, timeout=5).status_code, 502)

    def test_stop_revokes_all_playback_resources(self):
        token, url = self.register("/movie.mp4")
        self.proxy.revoke(token)
        self.assertEqual(requests.get(url, timeout=5).status_code, 410)

    def test_unknown_resource_cannot_request_arbitrary_url(self):
        _, url = self.register("/movie.mp4")
        unknown = url.rsplit("/", 1)[0] + "/http://example.test"
        self.assertEqual(requests.get(unknown, timeout=5).status_code, 404)

    def test_cors_preflight_accepts_range_header(self):
        _, url = self.register("/movie.mp4")
        r = requests.options(url, timeout=5)
        self.assertEqual(r.status_code, 204)
        self.assertIn("Range", r.headers["Access-Control-Allow-Headers"])

    def test_seek_restarts_conversion_at_target_and_original_stop_revokes_it(self):
        token, url = self.register("/fixture.ts", transcode=True, prefetch=True)
        previous = self.proxy.playbacks[token]
        old_file = Path(previous.buffer.path)
        result = self.proxy.seek(token, 1800)
        self.assertEqual(result["offset"], 1800)
        new_token, current = self.proxy.resolve(token)
        self.assertNotEqual(token, new_token)
        self.assertTrue(previous.stopped)
        self.assertFalse(old_file.exists())
        self.assertEqual(current.seek_offset, 1800)
        command = conversion_command(current)
        self.assertLess(command.index("-ss"), command.index("-i"))
        self.assertEqual(command[command.index("-ss") + 1], "1800.0")
        new_file = Path(current.buffer.path)
        self.proxy.revoke(token)
        self.assertFalse(new_file.exists())
        self.assertNotIn(new_token, self.proxy.playbacks)

    def test_seek_validates_position(self):
        token, _ = self.register("/fixture.ts", transcode=True, prefetch=True)
        for seconds in (-1, "nan", "infinity", 604800):
            with self.assertRaises(ValueError):
                self.proxy.seek(token, seconds)

    @unittest.skipUnless(ffmpeg_path(), "FFmpeg not installed")
    def test_server_seek_changes_the_actual_video_frames(self):
        exe = ffmpeg_path()
        generated = subprocess.run(
            [
                exe,
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=red:size=64x64:rate=10:d=2",
                "-f",
                "lavfi",
                "-i",
                "color=blue:size=64x64:rate=10:d=2",
                "-filter_complex",
                "[0:v][1:v]concat=n=2:v=1:a=0[v]",
                "-map",
                "[v]",
                "-c:v",
                "mpeg2video",
                "-f",
                "mpegts",
                "pipe:1",
            ],
            capture_output=True,
            timeout=20,
            check=True,
        )
        type(self).fixture = generated.stdout
        token, url = self.register("/fixture.ts", transcode=True, prefetch=True)
        result = self.proxy.seek(token, 2.5)
        converted = requests.get(result["url"], timeout=30)
        self.assertEqual(converted.status_code, 200)
        frame = subprocess.run(
            [
                exe,
                "-loglevel",
                "error",
                "-i",
                "pipe:0",
                "-frames:v",
                "1",
                "-pix_fmt",
                "rgb24",
                "-f",
                "rawvideo",
                "pipe:1",
            ],
            input=converted.content,
            capture_output=True,
            timeout=20,
            check=True,
        ).stdout
        self.assertGreater(len(frame), 3)
        # The original starts red. A real seek past two seconds must start blue.
        self.assertGreater(frame[2], frame[0] + 100)
        self.proxy.revoke(token)

    def test_unavailable_converter_returns_readable_error(self):
        _, url = self.register("/fixture.ts", transcode=True)
        with patch("backend.infrastructure.media.http.ffmpeg_path", return_value=None):
            self.assertEqual(requests.get(url, timeout=5).status_code, 503)

    @unittest.skipUnless(ffmpeg_path(), "FFmpeg not installed")
    def test_real_conversion_from_mpeg2_mp2_to_browser_mp4(self):
        exe = ffmpeg_path()
        generated = subprocess.run(
            [
                exe,
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=160x120:rate=25",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440",
                "-t",
                "1",
                "-c:v",
                "mpeg2video",
                "-c:a",
                "mp2",
                "-f",
                "mpegts",
                "pipe:1",
            ],
            capture_output=True,
            timeout=20,
            check=True,
        )
        type(self).fixture = generated.stdout
        token, url = self.register("/fixture.ts", transcode=True)
        response = requests.get(url, timeout=30)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"ftyp", response.content[:32])
        decoded = subprocess.run(
            [exe, "-loglevel", "info", "-i", "pipe:0", "-f", "null", "-"],
            input=response.content,
            capture_output=True,
            timeout=20,
        )
        self.assertEqual(decoded.returncode, 0, decoded.stderr.decode())
        self.assertIn(b"Video: h264", decoded.stderr)
        self.assertIn(b"Audio: aac", decoded.stderr)
        self.assertFalse(self.proxy.playbacks[token].processes)


if __name__ == "__main__":
    unittest.main()
