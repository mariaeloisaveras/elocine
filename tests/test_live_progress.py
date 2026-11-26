import io
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.infrastructure.media.proxy import MediaProxy
from backend.infrastructure.media.session import RelaySession
from backend.infrastructure.media.transcoder import conversion_chunks


class LiveProgressTests(unittest.TestCase):
    def progress(self, session, now):
        relay = SimpleNamespace(resolve=lambda token: (token, session))
        with patch("backend.infrastructure.media.proxy.time.monotonic", return_value=now):
            return MediaProxy.progress(relay, "test")

    def test_does_not_report_buffer_backpressure_as_a_stream_failure(self):
        session = RelaySession("http://example.invalid/live.ts", {}, transcode=True)
        session.conversion_started_at = 100
        session.last_output_at = 110
        session.output_bytes = 4096
        healthy = self.progress(session, 120)
        self.assertEqual(healthy["size"], 4096)
        self.assertIsNone(healthy["error"])
        stalled = self.progress(session, 136)
        self.assertIsNone(stalled["error"])
        session.last_output_at = 137
        self.assertIsNone(self.progress(session, 138)["error"])

    def test_reports_startup_stall_but_not_an_unstarted_request(self):
        session = RelaySession("http://example.invalid/live.ts", {}, transcode=True)
        self.assertIsNone(self.progress(session, 130)["error"])
        session.conversion_started_at = 100
        self.assertIn("25 segundos", self.progress(session, 130)["error"])

    def test_unauthorized_and_forbidden_requests_are_not_retried(self):
        for status in (401, 403):
            with self.subTest(status=status):
                session = RelaySession("http://example.invalid/live.ts", {}, transcode=True)
                process = MagicMock()
                process.stdout = io.BytesIO(b"")
                process.stderr = io.BytesIO(f"Server returned {status}\n".encode())
                process.wait.return_value = 1
                process.poll.return_value = 1
                with (
                    patch(
                        "backend.infrastructure.media.transcoder.subprocess.Popen",
                        return_value=process,
                    ) as start,
                    patch(
                        "backend.infrastructure.media.transcoder.ffmpeg_path", return_value="ffmpeg"
                    ),
                ):
                    with self.assertRaisesRegex(ValueError, f"HTTP {status}"):
                        list(conversion_chunks(session))
                self.assertEqual(start.call_count, 1)
                self.assertTrue(session.conversion_failed)

    def test_live_eof_and_output_activity_are_recorded(self):
        session = RelaySession("http://example.invalid/live.ts", {}, transcode=True)
        process = MagicMock()
        process.stdout = io.BytesIO(b"video-header")
        process.stderr = io.BytesIO(b"")
        process.wait.return_value = 0
        process.poll.return_value = 0
        with patch(
            "backend.infrastructure.media.transcoder.subprocess.Popen", return_value=process
        ):
            self.assertEqual(list(conversion_chunks(session)), [b"video-header"])
        self.assertEqual(session.output_bytes, 12)
        self.assertIsNotNone(session.last_output_at)
        progress = self.progress(session, session.last_output_at + 1)
        self.assertTrue(progress["done"])
        self.assertIn("encerrada", progress["error"])


if __name__ == "__main__":
    unittest.main()
