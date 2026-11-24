"""Xtream adapter: credentials and upstream response shapes stay on the server."""

import threading
import time
from urllib.parse import quote, urlsplit

import requests

from backend.domain.errors import ContentNotFoundError, ProviderError
from backend.domain.models import Details, MediaItem

from .epg import programmes


def seconds(value):
    try:
        result = 0.0
        for part in str(value).split(":"):
            result = result * 60 + float(part)
        return result if 0 < result < 604800 else 0
    except (TypeError, ValueError):
        return 0


def metadata_text(value):
    if isinstance(value, list):
        return ", ".join(filter(None, (metadata_text(part) for part in value)))
    if not isinstance(value, str):
        return ""
    text = " ".join(value.split())
    return "" if text.casefold() in {"null", "none", "n/a", "0", "-"} else text


def image(value):
    if isinstance(value, list):
        value = next(iter(value), "")
    return (
        value if isinstance(value, str) and urlsplit(value).scheme in ("http", "https", "") else ""
    )


class XtreamRepository:
    def __init__(self, settings):
        self.settings = settings
        self.cache = {}
        self.lock = threading.RLock()

    @property
    def headers(self):
        return {"User-Agent": self.settings.user_agent, "Accept": "*/*"}

    def get(self, action=None, **params):
        key = (action, tuple(sorted(params.items())))
        with self.lock:
            cached = self.cache.get(key)
            if action and cached and cached[0] > time.monotonic():
                return cached[1]
        if not self.settings.configured:
            raise ProviderError(
                "Configure IPTV_URL, IPTV_USER e IPTV_PASS no arquivo .env e reinicie o servidor."
            )
        try:
            response = requests.get(
                self.settings.base_url + "/player_api.php",
                params={
                    "username": self.settings.username,
                    "password": self.settings.password,
                    **({"action": action} if action else {}),
                    **params,
                },
                headers=self.headers,
                timeout=(8, 25),
            )
            response.raise_for_status()
            data = response.json()
        except requests.RequestException as exc:
            status = getattr(exc.response, "status_code", None)
            raise ProviderError(
                f"O provedor recusou a solicitação (HTTP {status})."
                if status
                else "Não foi possível conectar ao provedor. Tente novamente."
            ) from None
        except ValueError:
            raise ProviderError("O provedor retornou uma resposta inválida.") from None
        if action:
            with self.lock:
                self.cache[key] = (
                    time.monotonic() + (60 if action == "get_short_epg" else 600),
                    data,
                )
        return data

    def account(self):
        user = self.get().get("user_info", {})
        if str(user.get("auth")) != "1":
            raise ProviderError("O provedor recusou o login. Confira as credenciais no .env.")
        return {
            "status": user.get("status", ""),
            "connections": int(user.get("active_cons") or 0),
            "max_connections": int(user.get("max_connections") or 1),
        }

    def categories(self, kind):
        action = {
            "movie": "get_vod_categories",
            "series": "get_series_categories",
            "live": "get_live_categories",
        }[kind]
        data = self.get(action)
        if not isinstance(data, list):
            raise ProviderError("Não foi possível carregar as categorias.")
        return [
            {
                "id": str(c.get("category_id", "")),
                "name": str(c.get("category_name", "Sem categoria")),
            }
            for c in data
        ]

    def items(self, kind):
        action = {"movie": "get_vod_streams", "series": "get_series", "live": "get_live_streams"}[
            kind
        ]
        data = self.get(action)
        if not isinstance(data, list):
            raise ProviderError("Não foi possível carregar o catálogo.")
        return [
            MediaItem(
                id=str(row.get("series_id" if kind == "series" else "stream_id", "")),
                kind=kind,
                title=str(row.get("name") or "Sem título"),
                artwork=image(row.get("cover") or row.get("stream_icon")),
                backdrop=image(row.get("backdrop_path")),
                category_id=str(row.get("category_id", "")),
                rating=str(row.get("rating") or ""),
                year=str(
                    row.get("year")
                    or str(row.get("releaseDate") or row.get("release_date") or "")[:4]
                ),
                synopsis=str(row.get("plot") or ""),
                extension=row.get("container_extension") or "mp4",
                cast=metadata_text(row.get("cast")) or metadata_text(row.get("actors")),
                director=metadata_text(row.get("director")),
                genre=metadata_text(row.get("genre")),
                country=metadata_text(row.get("country")),
            )
            for row in data
            if row.get("series_id" if kind == "series" else "stream_id") is not None
        ]

    def details(self, kind, identifier):
        item = next((item for item in self.items(kind) if item.id == identifier), None)
        if not item:
            raise ContentNotFoundError("Este título não está mais disponível no catálogo.")
        if kind == "live":
            return Details(item)
        data = self.get(
            "get_series_info" if kind == "series" else "get_vod_info",
            **({"series_id": identifier} if kind == "series" else {"vod_id": identifier}),
        )
        info = data.get("info") or {}
        item.synopsis = str(info.get("plot") or info.get("description") or item.synopsis)
        item.backdrop = image(info.get("backdrop_path")) or item.backdrop
        item.artwork = image(info.get("cover") or info.get("movie_image")) or item.artwork
        item.cast = (
            metadata_text(info.get("cast")) or metadata_text(info.get("actors")) or item.cast
        )
        for field in ("director", "genre", "country"):
            setattr(item, field, metadata_text(info.get(field)) or getattr(item, field))
        item.duration = seconds(info.get("duration_secs") or info.get("duration"))
        item.extension = (data.get("movie_data") or {}).get("container_extension") or item.extension
        episodes = []
        for season, rows in (data.get("episodes") or {}).items():
            for ep in rows or []:
                detail = ep.get("info") or {}
                episodes.append(
                    MediaItem(
                        id=str(ep["id"]),
                        kind="episode",
                        title=str(ep.get("title") or "Episódio"),
                        parent_id=identifier,
                        season=str(season),
                        episode=str(ep.get("episode_num") or ""),
                        duration=seconds(detail.get("duration_secs") or detail.get("duration")),
                        artwork=image(detail.get("movie_image")) or item.artwork,
                        synopsis=str(detail.get("plot") or ""),
                        extension=ep.get("container_extension") or "mp4",
                    )
                )
        episodes.sort(
            key=lambda e: (
                int(e.season) if e.season.isdigit() else 0,
                int(e.episode) if e.episode.isdigit() else 0,
            )
        )
        return Details(item, episodes)

    def schedule(self, identifier):
        data = self.get("get_short_epg", stream_id=identifier, limit=30)
        rows = data.get("epg_listings", []) if isinstance(data, dict) else []
        return programmes(rows if isinstance(rows, list) else [])

    def stream_url(self, item, *, compatibility=False):
        section = {"movie": "movie", "episode": "series", "live": "live"}[item.kind]
        # Live conversion reads MPEG-TS directly. Some providers refuse HLS
        # playlists even though the same channel is available as a TS stream.
        extension = ("ts" if compatibility else "m3u8") if item.kind == "live" else item.extension
        return (
            f"{self.settings.base_url}/{section}/{quote(self.settings.username, safe='')}/"
            f"{quote(self.settings.password, safe='')}/{quote(item.id, safe='')}.{quote(extension, safe='')}"
        )
