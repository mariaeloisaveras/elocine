import unittest
from unittest.mock import patch

from backend.infrastructure.settings import Settings
from backend.infrastructure.xtream import XtreamRepository


class TitleMetadataTests(unittest.TestCase):
    def setUp(self):
        self.repository = XtreamRepository(
            Settings("http://provider.invalid", "user", "pass", "test")
        )

    def test_movie_details_normalize_metadata_and_fall_back_to_actors(self):
        rows = [{"stream_id": 1, "name": "Filme"}]
        info = {
            "cast": "N/A",
            "actors": ["  Atriz A  ", "Ator B"],
            "director": "Diretor A",
            "genre": ["Drama", "Aventura"],
            "country": "  Brasil  ",
        }
        with patch.object(self.repository, "get", side_effect=[rows, {"info": info}]):
            item = self.repository.details("movie", "1").public()["item"]
        self.assertEqual(item["cast"], "Atriz A, Ator B")
        self.assertEqual(item["director"], "Diretor A")
        self.assertEqual(item["genre"], "Drama, Aventura")
        self.assertEqual(item["country"], "Brasil")
        self.assertNotIn("extension", item)

    def test_series_keep_list_metadata_when_details_have_empty_fields(self):
        rows = [
            {
                "series_id": 1,
                "name": "Série",
                "cast": "Atriz",
                "director": "Diretora",
                "genre": "Drama",
                "country": "Brasil",
            }
        ]
        with patch.object(
            self.repository,
            "get",
            side_effect=[
                rows,
                {"info": {"cast": None, "director": "", "genre": [], "country": "null"}},
            ],
        ):
            item = self.repository.details("series", "1").item
        self.assertEqual(
            (item.cast, item.director, item.genre, item.country),
            ("Atriz", "Diretora", "Drama", "Brasil"),
        )

    def test_missing_metadata_never_becomes_literal_none_or_object_text(self):
        with patch.object(
            self.repository,
            "get",
            side_effect=[
                [{"stream_id": 1}],
                {"info": {"cast": {}, "director": None, "genre": 0, "country": "N/A"}},
            ],
        ):
            item = self.repository.details("movie", "1").item
        self.assertEqual((item.cast, item.director, item.genre, item.country), ("", "", "", ""))
