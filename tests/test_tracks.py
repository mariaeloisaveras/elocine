import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend.bootstrap import create_app
from backend.infrastructure.demo import DemoRepository
from backend.infrastructure.media.session import RelaySession
from backend.infrastructure.media.tracks import conversion_failure, read_tracks, subtitle_cues
from backend.infrastructure.media.transcoder import conversion_chunks, conversion_command
from backend.infrastructure.settings import Settings


class TrackTests(unittest.TestCase):
    def test_live_conversion_reconnects_input_with_bounded_retries(self):
        playback = RelaySession("http://provider.invalid/live.ts", {}, transcode=True)
        command = conversion_command(playback)
        self.assertEqual(command[command.index("-reconnect") + 1], "1")
        self.assertEqual(command[command.index("-reconnect_max_retries") + 1], "3")
        self.assertLess(command.index("-reconnect"), command.index("-i"))
        self.assertNotIn("-reconnect_at_eof", command)
        self.assertEqual(
            command[command.index("-reconnect_on_http_error") + 1],
            "429,500,502,503,504",
        )
        # VOD conversions use their persistent buffer and must retain EOF behavior.
        playback.buffer = object()
        self.assertNotIn("-reconnect", conversion_command(playback))

    def test_reads_input_languages_and_ignores_output_and_private_logs(self):
        playback = RelaySession("http://provider.invalid/private", {})
        log = b"Input #0, matroska, from 'private':\n  Stream #0:1(por): Audio: aac, 48000 Hz\n  Stream #0:2(eng): Subtitle: subrip (default)\n  Stream #0:3: Subtitle: hdmv_pgs_subtitle\nStream mapping:\nOutput #0, mp4, to 'pipe:1':\n  Stream #0:0: Audio: aac\n"
        read_tracks(playback, io.BytesIO(log))
        self.assertTrue(playback.tracks_ready)
        self.assertEqual([track["index"] for track in playback.tracks], [1, 2, 3])
        self.assertTrue(playback.tracks[1]["supported"])
        self.assertFalse(playback.tracks[2]["supported"])
        self.assertNotIn("private", str(playback.tracks))

    def test_reads_last_complete_cue_without_blank_line_and_skips_partial_cues(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "captions.vtt"
            path.write_text("WEBVTT\n\n00:01.000 --> 00:02.000\nOlá\n")
            first = subtitle_cues(path, 0)
            self.assertEqual(first["cues"], [{"start": 1, "end": 2, "text": "Olá"}])
            with path.open("a") as stream:
                stream.write("\n00:03.000 --> 00:04.000\nParcial")
            self.assertEqual(subtitle_cues(path, first["cursor"])["cues"], [])
            with path.open("a") as stream:
                stream.write("\n")
            self.assertEqual(subtitle_cues(path, first["cursor"])["cues"][0]["text"], "Parcial")

    def test_conversion_errors_are_classified_without_copying_private_urls(self):
        message = conversion_failure(
            "Server returned 403 Forbidden: http://private.invalid/user/password/file.mkv"
        )
        self.assertIn("HTTP 403", message)
        self.assertNotIn("private", message)
        self.assertNotIn("password", message)
        self.assertIn("codificação", conversion_failure("Invalid UTF-8 in decoded subtitles text"))
        self.assertIsNone(conversion_failure("Input #0, matroska, from private"))

    def test_authorization_errors_explain_access_and_connection_limits(self):
        for status in (401, 403):
            with self.subTest(status=status):
                message = conversion_failure(
                    f"Server returned {status}: http://private.invalid/user/password/live.ts"
                )
                self.assertIn(f"HTTP {status}", message)
                self.assertIn("limite de conexões", message)
                self.assertIn("feche outros players", message)
                self.assertNotIn("Aguarde", message)
                self.assertNotIn("private", message)
                self.assertNotIn("password", message)

    def test_does_not_retry_after_video_bytes_have_already_been_sent(self):
        playback = RelaySession("http://provider.invalid/video", {}, transcode=True)
        process = MagicMock()
        process.stdout = io.BytesIO(b"video-header")
        process.stderr = io.BytesIO(b"Server returned 503 Service Unavailable\n")
        process.wait.return_value = 1
        process.poll.return_value = 1
        with patch(
            "backend.infrastructure.media.transcoder.subprocess.Popen", return_value=process
        ) as start:
            chunks = conversion_chunks(playback)
            self.assertEqual(next(chunks), b"video-header")
            with self.assertRaisesRegex(ValueError, "HTTP 503"):
                next(chunks)
        self.assertEqual(start.call_count, 1)
        self.assertTrue(playback.conversion_failed)

    def test_api_validates_before_restarting_and_preserves_tracks_when_seeking(self):
        app = create_app(repository=DemoRepository(), settings=Settings("", "", "", "test", True))
        tracks = [
            {"index": 1, "kind": "audio", "supported": True},
            {"index": 2, "kind": "subtitle", "supported": True},
            {"index": 3, "kind": "subtitle", "supported": False},
        ]
        with TestClient(app) as client:
            app.state.playback.converter_available = lambda: True
            session = client.post("/api/playbacks", json={"kind": "movie", "id": "1"}).json()
            route = f"/api/playbacks/{session['id']}"
            with patch.object(app.state.relay, "progress", return_value={"media_tracks": tracks}):
                for audio, subtitle in ((999, None), (2, None), (None, 3)):
                    self.assertEqual(
                        client.post(
                            route + "/tracks",
                            json={"audio_index": audio, "subtitle_index": subtitle},
                        ).status_code,
                        400,
                    )
                    self.assertEqual(app.state.playback.active.media_url, session["media_url"])
                self.assertEqual(
                    client.post(route + "/tracks", json={"seconds": -1}).status_code, 422
                )
                changed = client.post(
                    route + "/tracks", json={"audio_index": 1, "subtitle_index": 2, "seconds": 4}
                ).json()
            self.assertEqual(
                (changed["audio_index"], changed["subtitle_index"], changed["offset"]), (1, 2, 4)
            )
            self.assertNotEqual(changed["media_url"], session["media_url"])
            seek = client.post(route + "/seek", json={"seconds": 8}).json()
            self.assertEqual((seek["audio_index"], seek["subtitle_index"]), (1, 2))
            self.assertEqual(
                client.get(route + "/subtitles?after=0").json(), {"cues": [], "cursor": 0}
            )
            client.post(route + "/stop")
            self.assertEqual(client.get(route + "/subtitles").status_code, 404)
            session = client.post(
                "/api/playbacks", json={"kind": "movie", "id": "1", "compatibility": False}
            ).json()
            self.assertEqual(
                client.post(f"/api/playbacks/{session['id']}/tracks", json={}).status_code, 400
            )
