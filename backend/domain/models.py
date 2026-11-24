"""Framework-free catalog entities and repository contract."""

from dataclasses import asdict, dataclass, field
from typing import Literal, Protocol

from .schedule import Programme

Kind = Literal["movie", "series", "live", "episode"]


@dataclass
class MediaItem:
    id: str
    kind: Kind
    title: str
    artwork: str = ""
    backdrop: str = ""
    category_id: str = ""
    rating: str = ""
    year: str = ""
    synopsis: str = ""
    duration: float = 0
    extension: str = "mp4"
    parent_id: str = ""
    season: str = ""
    episode: str = ""
    cast: str = ""
    director: str = ""
    genre: str = ""
    country: str = ""
    trailer: str = ""

    def public(self):
        result = asdict(self)
        result.pop("extension")
        return result


@dataclass
class Details:
    item: MediaItem
    episodes: list[MediaItem] = field(default_factory=list)

    def public(self):
        return {"item": self.item.public(), "episodes": [e.public() for e in self.episodes]}


class CatalogRepository(Protocol):
    def schedule(self, identifier: str) -> list[Programme]: ...
    def account(self) -> dict: ...
    def categories(self, kind: str) -> list[dict]: ...
    def items(self, kind: str) -> list[MediaItem]: ...
    def details(self, kind: str, identifier: str) -> Details: ...
    def stream_url(self, item: MediaItem, *, compatibility: bool = False) -> str: ...
    @property
    def headers(self) -> dict: ...
