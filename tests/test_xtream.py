import unittest

from backend.domain.models import MediaItem
from backend.infrastructure.settings import Settings
from backend.infrastructure.xtream import XtreamRepository


class StreamSourceTests(unittest.TestCase):
    def setUp(self):
        self.repository = XtreamRepository(
            Settings("http://provider.invalid", "test-user", "test-pass", "test")
        )

    def test_live_conversion_uses_ts_and_direct_browser_playback_keeps_hls(self):
        channel = MediaItem("42", "live", "Canal")
        self.assertTrue(self.repository.stream_url(channel, compatibility=True).endswith("/42.ts"))
        self.assertTrue(self.repository.stream_url(channel).endswith("/42.m3u8"))

    def test_conversion_preserves_movie_and_episode_extensions(self):
        for kind in ("movie", "episode"):
            item = MediaItem("42", kind, "Título", extension="mkv")
            self.assertEqual(
                self.repository.stream_url(item, compatibility=True),
                self.repository.stream_url(item),
            )
            self.assertTrue(self.repository.stream_url(item).endswith("/42.mkv"))
