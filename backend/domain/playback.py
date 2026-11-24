"""Application playback state; provider URLs and transport details stay private."""

import time
from dataclasses import dataclass, field

from backend.domain.models import MediaItem


@dataclass
class PlaybackSession:
    id: str
    token: str
    media_url: str
    item: MediaItem
    compatibility: bool
    prefetch: bool
    is_hls: bool
    can_seek: bool
    offset: float
    initial_position: float
    touched: float = field(default_factory=time.monotonic)

    def public(self) -> dict:
        return {
            "id": self.id,
            "media_url": self.media_url,
            "item": self.item.public(),
            "compatibility": self.compatibility,
            "prefetch": self.prefetch,
            "is_hls": self.is_hls,
            "can_seek": self.can_seek,
            "offset": self.offset,
            "initial_position": self.initial_position,
        }
