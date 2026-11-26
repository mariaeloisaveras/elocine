import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

from backend.application.playback import PlaybackService
from backend.domain.errors import InvalidPlaybackError
from backend.domain.models import Details, MediaItem


class PlaybackOwnershipTests(unittest.TestCase):
    def service(self):
        repository = MagicMock()
        repository.headers = {}
        repository.details.side_effect = lambda kind, identifier: Details(
            MediaItem(identifier, kind, identifier)
        )
        repository.stream_url.side_effect = lambda item, **kwargs: item.id
        relay = MagicMock()
        relay.register.side_effect = lambda url, *args, **kwargs: (url, "/media/" + url)
        return PlaybackService(repository, relay, lambda: False)

    def test_new_playback_revokes_previous_and_late_old_stop_cannot_stop_new(self):
        service = self.service()
        first = service.start("movie", "1")
        second = service.start("live", "2")
        service.relay.revoke.assert_called_once_with("1")
        service.stop(first["id"])
        self.assertEqual(service.active.id, second["id"])

    def test_slow_older_request_cannot_replace_the_latest_opened_title(self):
        service = self.service()
        entered = threading.Event()
        proceed = threading.Event()

        def details(kind, identifier):
            if identifier == "1":
                entered.set()
                if not proceed.wait(3):
                    raise TimeoutError("Test synchronization timed out")
            return Details(MediaItem(identifier, kind, identifier))

        service.repository.details.side_effect = details
        with ThreadPoolExecutor(max_workers=1) as executor:
            first = executor.submit(service.start, "movie", "1")
            try:
                self.assertTrue(entered.wait(3))
                latest = service.start("live", "2")
            finally:
                proceed.set()
            with self.assertRaises(InvalidPlaybackError):
                first.result(timeout=3)
        self.assertEqual(service.active.id, latest["id"])
        service.relay.register.assert_called_once()
