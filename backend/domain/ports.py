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
