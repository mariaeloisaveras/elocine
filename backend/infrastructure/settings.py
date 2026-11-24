import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    base_url: str
    username: str
    password: str
    user_agent: str
    demo: bool = False

    @property
    def configured(self):
        return bool(self.base_url and self.username and self.password)

    @classmethod
    def load(cls):
        load_dotenv(ROOT / ".env")
        return cls(
            os.getenv("IPTV_URL", "").strip().rstrip("/"),
            os.getenv("IPTV_USER", "").strip(),
            os.getenv("IPTV_PASS", "").strip(),
            os.getenv("IPTV_USER_AGENT") or "VLC/3.0.20 LibVLC/3.0.20",
            os.getenv("IPTV_DEMO") == "1",
        )
