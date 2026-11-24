import base64
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.bootstrap import create_app
from backend.domain.errors import ProviderError
from backend.domain.schedule import Programme
from backend.infrastructure.demo import DemoRepository
from backend.infrastructure.epg import programmes
from backend.infrastructure.settings import Settings
from backend.infrastructure.xtream import XtreamRepository


def encoded(text):
    return base64.b64encode(text.encode()).decode()


class EpgTests(unittest.TestCase):
    def test_decodes_text_orders_deduplicates_and_rejects_invalid_times(self):
        row = {
            "title": encoded("Notícias"),
            "description": encoded("Hoje & amanhã"),
            "start_timestamp": "1700000000",
            "stop_timestamp": "1700003600",
        }
        later = {
            **row,
            "title": "Filme da noite",
            "start_timestamp": "1700003600",
            "stop_timestamp": "1700007200",
        }
        result = programmes(
            [
                later,
                row,
                row,
                None,
                {**row, "start_timestamp": "nan"},
                {**row, "stop_timestamp": "0"},
            ]
        )
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0].title, "Notícias")
        self.assertEqual(result[0].description, "Hoje & amanhã")
        self.assertEqual(result[1].title, "Filme da noite")

    def test_adapter_requests_epg_and_discards_provider_fields(self):
        repository = XtreamRepository(Settings("http://provider.invalid", "u", "p", "test"))
        with patch.object(
            repository,
            "get",
            return_value={
                "epg_listings": [
                    {
                        "title": encoded("Programa"),
                        "start_timestamp": 100,
                        "stop_timestamp": 200,
                        "secret": "private",
                    }
                ]
            },
        ) as get:
            result = repository.schedule("42")
        get.assert_called_once_with("get_short_epg", stream_id="42", limit=30)
        self.assertEqual(
            result[0].public(), {"title": "Programa", "description": "", "start": 100, "end": 200}
        )

    def test_api_handles_valid_missing_empty_and_failed_schedules(self):
        repository = DemoRepository()
        app = create_app(repository=repository, settings=Settings("", "", "", "test", True))
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/channels/1/schedule").json(), {"programmes": []})
            with patch.object(
                repository, "schedule", return_value=[Programme("Agora", "Descrição", 100, 200)]
            ):
                response = client.get("/api/channels/1/schedule")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["programmes"][0]["title"], "Agora")
            self.assertEqual(client.get("/api/channels/999/schedule").status_code, 404)
            self.assertEqual(client.get("/api/channels/not-a-channel/schedule").status_code, 422)
            with patch.object(
                repository,
                "schedule",
                side_effect=ProviderError("Programação temporariamente indisponível"),
            ):
                self.assertEqual(client.get("/api/channels/1/schedule").status_code, 502)
