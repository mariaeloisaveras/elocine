import unittest

from backend.application.catalog import CatalogService
from backend.domain.errors import ContentNotFoundError
from backend.domain.models import MediaItem
from backend.domain.platforms import STREAMING_PLATFORMS


class PlatformMatchingTests(unittest.TestCase):
    def test_known_aliases_match_provider_labels(self):
        examples = {
            "netflix": ("FILMES | NETFLIX 4K", "Séries Netflix"),
            "prime-video": ("AMAZON PRIME VIDEO", "Filmes Amazon", "Prime_Video"),
            "hbo-max": ("SÉRIES - HBO MAX", "HBO", "Filmes Max"),
            "disney-plus": ("Disney+", "Disney Plus"),
            "globoplay": ("GLOBO PLAY", "Globoplay"),
            "apple-tv": ("APPLE TV+", "AppleTV"),
            "paramount-plus": ("PARAMOUNT+", "Paramount Plus"),
        }
        for platform in STREAMING_PLATFORMS:
            for label in examples[platform.id]:
                with self.subTest(platform=platform.id, label=label):
                    self.assertTrue(platform.matches(label))

    def test_similar_words_do_not_misclassify_platforms(self):
        platforms = {platform.id: platform for platform in STREAMING_PLATFORMS}
        for label in ("IMAX", "CINEMAX", "MAXIMUM"):
            self.assertFalse(platforms["hbo-max"].matches(label))
        self.assertFalse(platforms["prime-video"].matches("Amazonas"))
        self.assertFalse(platforms["disney-plus"].matches("Disneyland"))


class CategorizedRepository:
    def __init__(self):
        self.requested_kinds = []

    def categories(self, kind):
        self.requested_kinds.append(kind)
        if kind == "movie":
            return [
                {"id": "general", "name": "Filmes gerais"},
                {"id": "n1", "name": "Filmes Netflix"},
                {"id": "n2", "name": "Netflix 4K"},
                {"id": "prime", "name": "Amazon Prime Video"},
                {"id": "other", "name": "IMAX"},
            ]
        return [
            {"id": "n1", "name": "Séries Netflix"},
            {"id": "hbo", "name": "HBO Max"},
            {"id": "other", "name": "Cinemax"},
        ]

    def items(self, kind):
        if kind == "movie":
            return [
                MediaItem("g", kind, "Geral", category_id="general"),
                MediaItem("1", kind, "Título A", category_id="n1"),
                MediaItem("1", kind, "Título A HD", category_id="n2"),
                MediaItem("2", kind, "Título B", category_id="n2"),
                MediaItem("3", kind, "Título Prime", category_id="prime"),
                MediaItem("4", kind, "Título IMAX", category_id="other"),
            ]
        return [
            MediaItem("1", kind, "Série Netflix", category_id="n1"),
            MediaItem("2", kind, "Série HBO", category_id="hbo"),
            MediaItem("3", kind, "Série Cinemax", category_id="other"),
        ]


class PlatformCatalogTests(unittest.TestCase):
    def setUp(self):
        self.repository = CategorizedRepository()
        self.catalog = CatalogService(self.repository)

    def test_rails_mix_movies_and_series_deduplicate_and_hide_empty_platforms(self):
        rails = self.catalog.platforms(limit=3)
        self.assertEqual([rail["id"] for rail in rails], ["netflix", "prime-video", "hbo-max"])
        netflix = rails[0]
        self.assertEqual(netflix["total"], 3)
        self.assertEqual([item["kind"] for item in netflix["items"]], ["movie", "series", "movie"])
        self.assertEqual(self.repository.requested_kinds, ["movie", "series"])

    def test_platform_filter_supports_search_and_pagination(self):
        page = self.catalog.search("movie", platform="netflix", page=2, limit=1)
        self.assertEqual(page["total"], 2)
        self.assertEqual(page["items"][0]["title"], "Título B")
        search = self.catalog.search("series", query="netflix", platform="netflix")
        self.assertEqual(search["total"], 1)
        self.assertEqual(search["items"][0]["kind"], "series")

    def test_unknown_platform_and_live_channels_are_not_included(self):
        self.assertEqual(self.catalog.search("movie", platform="unknown")["total"], 0)
        self.assertEqual(self.catalog.search("live", platform="netflix")["total"], 0)

    def test_combined_catalog_paginates_without_duplicates_or_missing_kinds(self):
        pages = [self.catalog.platform_catalog("netflix", page=p, limit=1) for p in (1, 2, 3)]
        self.assertEqual(
            [(p["items"][0]["kind"], p["items"][0]["id"]) for p in pages],
            [("movie", "1"), ("series", "1"), ("movie", "2")],
        )
        self.assertTrue(all(p["total"] == 3 and p["pages"] == 3 for p in pages))
        self.assertEqual(pages[0]["name"], "Netflix")

    def test_combined_catalog_filters_kind_and_accent_insensitive_query(self):
        result = self.catalog.platform_catalog("netflix", query="titulo", kind="movie")
        self.assertEqual(result["total"], 2)
        self.assertTrue(all(item["kind"] == "movie" for item in result["items"]))
        self.assertEqual(self.catalog.platform_catalog("netflix", query="absent")["items"], [])
        with self.assertRaises(ContentNotFoundError):
            self.catalog.platform_catalog("unknown")
