"""Public programme metadata, independent of provider encoding and HTTP."""

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Programme:
    title: str
    description: str
    start: int
    end: int

    def public(self):
        return asdict(self)
