"""Known platform labels used to organize provider-defined catalog categories."""

import re
import unicodedata
from dataclasses import dataclass


def normalized(value: str) -> str:
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(character)
    )


@dataclass(frozen=True)
class StreamingPlatform:
    id: str
    name: str
    pattern: str

    def matches(self, category_name: str) -> bool:
        label = re.sub(r"[^a-z0-9]+", " ", normalized(category_name))
        return re.search(self.pattern, label) is not None


STREAMING_PLATFORMS = (
    StreamingPlatform("netflix", "Netflix", r"\bnetflix\b"),
    StreamingPlatform("prime-video", "Prime Video", r"\b(?:amazon|prime(?:\s+video)?)\b"),
    StreamingPlatform("hbo-max", "HBO / Max", r"\b(?:hbo|max)\b"),
    StreamingPlatform("disney-plus", "Disney+", r"\bdisney\b"),
    StreamingPlatform("globoplay", "Globoplay", r"\bglobo\s*play\b"),
    StreamingPlatform("apple-tv", "Apple TV+", r"\bapple\s*tv\b"),
    StreamingPlatform("paramount-plus", "Paramount+", r"\bparamount\b"),
)
