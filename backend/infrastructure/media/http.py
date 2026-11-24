import re
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import requests

from .download import download_to_buffer
from .transcoder import conversion_command, ffmpeg_path, terminate


class MediaRequestHandler(BaseHTTPRequestHandler):
    @property
    def proxy(self):
        return self.server.proxy

    # Provider URLs and credentials must never enter HTTP access logs.
    def log_message(self, *args):
        pass

    def headers_for(self, status, content_type, length=None):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", content_type)
        if length is not None:
            self.send_header("Content-Length", str(length))

    def fail(self, status, message):
        body = message.encode()
        self.headers_for(status, "text/plain; charset=utf-8", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.headers_for(204, "text/plain", 0)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range")
        self.end_headers()

    def do_GET(self):
        parts = urlsplit(self.path).path.split("/")
        if len(parts) != 4 or parts[1] != "media":
            self.fail(404, "Media not found")
            return
        _, _, token, key = parts
        token, playback = self.proxy.resolve(token)
        if not playback or playback.stopped:
            self.fail(410, "Playback ended")
            return
        playback.touched = time.monotonic()
        if playback.buffer and (key == "compat.mp4" or key in playback.resources):
            self.buffered(playback)
            return
        if key == "compat.mp4" and playback.transcode:
            self.transcode(playback)
            return
        with playback.lock:
            url = playback.resources.get(key)
        if not url:
            self.fail(404, "Media not found")
            return
        self.relay(url, token, playback)

    def buffered(self, playback):
        buffer = playback.buffer
        with playback.lock:
            if not playback.buffer_started:
                playback.buffer_started = True
                threading.Thread(target=download_to_buffer, args=(playback,), daemon=True).start()
        if not buffer.wait(0):
            self.fail(502, buffer.error or "Playback ended")
            return
        start, end, status = 0, None, 200
        requested = self.headers.get("Range")
        if requested:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested)
            if not match or not any(match.groups()):
                self.fail(416, "Invalid range")
                return
            low, high = match.groups()
            # Unknown-length conversion can start immediately. Suffix seeks
            # and open-ended seeks beyond zero need the final file size.
            if buffer.total is None and (not low or (not high and int(low) > 0)):
                with buffer.condition:
                    buffer.condition.wait_for(lambda: buffer.done or buffer.stopped)
            if buffer.stopped:
                return
            if not low:
                if buffer.total is None:
                    self.fail(502, buffer.error or "Unknown media length")
                    return
                start = max(0, buffer.total - int(high))
            else:
                start = int(low)
                end = int(high) if high else None
            if buffer.total is not None:
                end = min(end, buffer.total - 1) if end is not None else buffer.total - 1
            if (end is not None and start > end) or (
                buffer.total is not None and start >= buffer.total
            ):
                self.headers_for(416, "text/plain", 0)
                self.send_header(
                    "Content-Range", f"bytes */{buffer.total if buffer.total is not None else '*'}"
                )
                self.end_headers()
                return
            status = 206 if end is not None else 200
        elif buffer.total is not None:
            end = buffer.total - 1
        length = end - start + 1 if end is not None else None
        self.headers_for(status, buffer.content_type, length)
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header(
                "Content-Range",
                f"bytes {start}-{end}/{buffer.total if buffer.total is not None else '*'}",
            )
        self.end_headers()
        try:
            offset = start
            while (end is None or offset <= end) and buffer.wait(offset):
                amount = min(256 * 1024, end - offset + 1) if end is not None else 256 * 1024
                chunk = buffer.read(offset, amount)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
                offset += len(chunk)
        except OSError:
            # Download continues even when the browser pauses or seeks.
            pass

    def relay(self, url, token, playback):
        headers = {**playback.headers, "Accept-Encoding": "identity"}
        if self.headers.get("Range"):
            headers["Range"] = self.headers["Range"]
        response = None
        started = False
        try:
            response = requests.get(url, headers=headers, stream=True, timeout=(10, 20))
            with playback.lock:
                if playback.stopped:
                    return
                playback.responses.add(response)
            if not response.ok:
                # Discard upstream bodies: they can contain credentials.
                self.fail(response.status_code, "Media server refused the request")
                return
            kind = response.headers.get("Content-Type", "application/octet-stream")
            chunks = response.iter_content(chunk_size=64 * 1024)
            first = next(chunks, b"")
            playlist = first.lstrip(b"\xef\xbb\xbf\r\n ").startswith(b"#EXTM3U")
            if playlist:
                data = bytearray(first)
                for chunk in chunks:
                    data.extend(chunk)
                    if len(data) > 2 * 1024 * 1024:
                        raise ValueError("Playlist too large")
                body = self.proxy.rewrite_playlist(
                    data.decode("utf-8-sig"), response.url, token, playback
                ).encode()
                self.headers_for(200, "application/vnd.apple.mpegurl", len(body))
                self.end_headers()
                started = True
                self.wfile.write(body)
                return
            if "mpegurl" in kind.lower() or "text/html" in kind.lower() or "json" in kind.lower():
                self.fail(502, "Media server did not return valid video")
                return
            length = response.headers.get("Content-Length")
            if response.headers.get("Content-Encoding"):
                length = None
            self.headers_for(response.status_code, kind, length)
            for name in ("Content-Range", "Accept-Ranges"):
                if name in response.headers:
                    self.send_header(name, response.headers[name])
            self.end_headers()
            started = True
            if not playback.stopped:
                self.wfile.write(first)
            for chunk in chunks:
                if playback.stopped:
                    break
                self.wfile.write(chunk)
        except (requests.RequestException, ValueError, OSError):
            if not started and not playback.stopped:
                self.fail(502, "Unable to load media from server")
        finally:
            if response is not None:
                with playback.lock:
                    playback.responses.discard(response)
                response.close()

    def transcode(self, playback):
        executable = ffmpeg_path()
        if not executable:
            self.fail(503, "FFmpeg is not available")
            return
        # One input only. Decode unsupported codecs into browser H.264/AAC.
        command = conversion_command(playback)
        process = None
        started = False
        try:
            with playback.lock:
                if playback.stopped:
                    return
                if playback.processes:
                    self.fail(409, "A conversion is already playing")
                    return
                process = subprocess.Popen(
                    command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
                )
                playback.processes.add(process)
            first = process.stdout.read1(64 * 1024)
            if not first:
                self.fail(502, "Unable to convert media")
                return
            self.headers_for(200, "video/mp4")
            self.end_headers()
            started = True
            self.wfile.write(first)
            self.wfile.flush()
            while not playback.stopped:
                chunk = process.stdout.read1(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except OSError:
            if not started and not playback.stopped:
                self.fail(502, "Unable to convert media")
        finally:
            if process:
                terminate(process)
                process.stdout.close()
                with playback.lock:
                    playback.processes.discard(process)


class MediaHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, proxy):
        self.proxy = proxy
        super().__init__(("127.0.0.1", 0), MediaRequestHandler)
