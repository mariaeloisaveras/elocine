"""Media infrastructure ports consumed by application use cases."""

from typing import Protocol


class MediaRelay(Protocol):
    def register(
        self,
        url: str,
        headers: dict,
        transcode: bool = False,
        prefetch: bool = False,
        seek_offset: float = 0,
    ) -> tuple[str, str]: ...
    def revoke(self, token: str) -> None: ...
    def progress(self, token: str) -> dict: ...
    def seek(self, token: str, seconds: float) -> dict: ...
    def select_tracks(
        self, token: str, seconds: float, audio_index: int | None, subtitle_index: int | None
    ) -> dict: ...
    def subtitles(self, token: str, after: int = 0) -> dict: ...
