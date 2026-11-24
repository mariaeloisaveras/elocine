import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.bootstrap import create_app
from backend.infrastructure.demo import DemoRepository
from backend.infrastructure.media.transcoder import ffmpeg_path
from backend.infrastructure.settings import Settings
from backend.infrastructure.xtream import seconds


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(
            repository=DemoRepository(), settings=Settings("", "", "", "test", True)
        )
        self.context = TestClient(self.app)
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)

    def test_catalog_search_ignores_accents_and_has_real_pagination(self):
        response = self.client.get("/api/catalog", params={"kind": "movie", "q": "ultima orbita"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 1)
        self.assertEqual(response.json()["items"][0]["title"], "A última órbita")
        page = self.client.get(
            "/api/catalog", params={"kind": "movie", "limit": 2, "page": 2}
        ).json()
        self.assertEqual(page["pages"], 3)
        self.assertEqual(page["page"], 2)
        self.assertEqual(len(page["items"]), 2)

    def test_series_details_offer_ordered_seasons_and_episodes(self):
        data = self.client.get("/api/items/series/1").json()
        self.assertEqual(len(data["episodes"]), 6)
        self.assertEqual([e["season"] for e in data["episodes"]], ["1", "1", "1", "2", "2", "2"])
        self.assertEqual(data["episodes"][0]["parent_id"], "1")

    def test_platform_rails_and_view_all_filter(self):
        response = self.client.get("/api/platforms", params={"limit": 1})
        self.assertEqual(response.status_code, 200)
        netflix = next(rail for rail in response.json() if rail["id"] == "netflix")
        self.assertEqual(netflix["total"], 2)
        self.assertEqual(len(netflix["items"]), 1)
        filtered = self.client.get(
            "/api/catalog", params={"kind": "movie", "platform": "netflix"}
        ).json()
        self.assertEqual(filtered["total"], 1)
        self.assertEqual(filtered["items"][0]["category_id"], "1")

    def test_platform_catalog_endpoint_paginates_and_validates_filters(self):
        first = self.client.get("/api/platforms/netflix?limit=1").json()
        second = self.client.get("/api/platforms/netflix?limit=1&page=2").json()
        self.assertEqual(first["total"], 2)
        self.assertEqual(first["pages"], 2)
        self.assertEqual(first["items"][0]["kind"], "movie")
        self.assertEqual(second["items"][0]["kind"], "series")
        only_series = self.client.get("/api/platforms/netflix?kind=series").json()
        self.assertEqual(only_series["total"], 1)
        self.assertEqual(self.client.get("/api/platforms/unknown").status_code, 404)
        for params in ("limit=0", "page=0", "kind=live"):
            self.assertEqual(self.client.get("/api/platforms/netflix?" + params).status_code, 422)

    def test_account_exposes_no_credentials(self):
        data = self.client.get("/api/account").json()
        self.assertTrue(data["demo"])
        self.assertFalse({"username", "password", "base_url", "server_info"} & data.keys())

    def test_demo_video_route_serves_the_file_or_reports_that_it_is_missing(self):
        response = self.client.get("/api/demo-video")
        self.assertIn(response.status_code, (200, 404))
        if response.status_code == 200:
            self.assertEqual(response.headers["content-type"], "video/mp4")
            self.assertIn(b"ftyp", response.content[:32])

    def test_new_playback_releases_previous_and_old_stop_does_not_stop_new(self):
        first = self.client.post("/api/playbacks", json={"kind": "movie", "id": "1"}).json()
        self.assertEqual(first["compatibility"], bool(ffmpeg_path()))
        self.assertNotIn("token", first)
        old_file = Path(
            self.app.state.relay.resolve(self.app.state.playback.active.token)[1].buffer.path
        )
        second = self.client.post("/api/playbacks", json={"kind": "movie", "id": "2"}).json()
        self.assertFalse(old_file.exists())
        self.assertEqual(self.client.get(f"/api/playbacks/{first['id']}/progress").status_code, 404)
        self.client.post(f"/api/playbacks/{first['id']}/stop")
        self.assertEqual(
            self.client.get(f"/api/playbacks/{second['id']}/progress").status_code, 200
        )
        self.assertEqual(self.client.post(f"/api/playbacks/{second['id']}/stop").status_code, 204)
        self.assertIsNone(self.app.state.playback.active)

    def test_live_playback_requests_conversion_source_only_when_converter_is_enabled(self):
        for available, requested, expected in (
            (True, True, True),
            (True, False, False),
            (False, True, False),
        ):
            with self.subTest(available=available, requested=requested):
                self.app.state.playback.converter_available = lambda: available
                repository = self.app.state.playback.repository
                with patch.object(repository, "stream_url", wraps=repository.stream_url) as source:
                    response = self.client.post(
                        "/api/playbacks",
                        json={"kind": "live", "id": "1", "compatibility": requested},
                    )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(source.call_args.kwargs["compatibility"], expected)
                self.assertEqual(data["compatibility"], expected)
                self.assertEqual(data["is_hls"], not expected)
                self.assertFalse(data["prefetch"])
                self.assertFalse(data["can_seek"])

    def test_seek_uses_absolute_time_and_rejects_time_after_episode_end(self):
        if not ffmpeg_path():
            self.skipTest("Converter unavailable")
        session = self.client.post(
            "/api/playbacks", json={"kind": "episode", "id": "101", "parent_id": "1"}
        ).json()
        response = self.client.post(f"/api/playbacks/{session['id']}/seek", json={"seconds": 8})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["offset"], 8)
        self.assertNotEqual(response.json()["media_url"], session["media_url"])
        self.assertEqual(
            self.client.post(
                f"/api/playbacks/{session['id']}/seek", json={"seconds": 60}
            ).status_code,
            400,
        )

    def test_invalid_episode_and_arbitrary_urls_are_rejected(self):
        self.assertEqual(
            self.client.post(
                "/api/playbacks", json={"kind": "episode", "id": "999", "parent_id": "1"}
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                "/api/playbacks", json={"kind": "movie", "id": "http://example.test"}
            ).status_code,
            422,
        )

    def test_deep_link_returns_angular_not_a_backend_404(self):
        if not (Path("dist/elocine/browser/index.html")).exists():
            self.skipTest("Angular build not generated")
        for route in ("/watch/series/1", "/platform/netflix", "/browse/movie"):
            response = self.client.get(route)
            self.assertEqual(response.status_code, 200)
            self.assertIn("<app-root>", response.text)
        self.assertEqual(self.client.get("/api/unknown").status_code, 404)


class DurationTests(unittest.TestCase):
    def test_metadata_duration_formats(self):
        self.assertEqual(seconds("01:30:20"), 5420)
        self.assertEqual(seconds("1800"), 1800)
        self.assertEqual(seconds(None), 0)
        self.assertEqual(seconds("nan"), 0)
