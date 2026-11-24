"""Explicit demo mode for UI verification; never mixed with the user's catalog."""

import os
from dataclasses import replace

from backend.domain.errors import ContentNotFoundError
from backend.domain.models import Details, MediaItem


class DemoRepository:
    headers = {"User-Agent": "Elocine-demo"}

    def __init__(self):
        pictures = [
            "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1000&q=80",
            "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=80",
            "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1000&q=80",
            "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1000&q=80",
            "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=80",
            "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1000&q=80",
        ]
        titles = [
            "Além do horizonte",
            "A última órbita",
            "Marés do amanhã",
            "Depois da meia-noite",
            "Onde o vento mora",
            "O lado de dentro",
        ]
        self.data = {
            kind: [
                MediaItem(
                    str(index + 1),
                    kind,
                    title
                    if kind != "live"
                    else ["Cinema", "Natureza", "Cultura", "Mundo", "Documentários", "Música"][
                        index
                    ],
                    artwork=pictures[index],
                    backdrop=pictures[index],
                    category_id=str(index + 1),
                    rating="8.4",
                    year="2026",
                    duration=12 if kind != "live" else 0,
                    synopsis="Há histórias que começam quando você decide ir mais longe. Uma nova perspectiva, um encontro inesperado e tudo o que ainda está por vir.",
                )
                for index, title in enumerate(titles)
            ]
            for kind in ("movie", "series", "live")
        }

    def account(self):
        return {"status": "Active", "connections": 0, "max_connections": 1}

    def categories(self, kind):
        labels = ("Netflix", "Amazon Prime Video", "HBO Max", "Disney+", "Globoplay", "Apple TV+")
        return [{"id": str(index + 1), "name": label} for index, label in enumerate(labels)]

    def items(self, kind):
        return self.data[kind]

    def details(self, kind, identifier):
        item = next((i for i in self.items(kind) if i.id == identifier), None)
        if item is None:
            raise ContentNotFoundError("Título não encontrado.")
        episodes = (
            [
                replace(
                    item,
                    id=str(int(identifier) * 100 + n),
                    kind="episode",
                    title=f"Episódio {n} · Um novo começo",
                    parent_id=identifier,
                    season=str((n - 1) // 3 + 1),
                    episode=str((n - 1) % 3 + 1),
                )
                for n in range(1, 7)
            ]
            if kind == "series"
            else []
        )
        return Details(item, episodes)

    def schedule(self, identifier):
        # Demo mode must never fetch the user's provider.
        return []

    def stream_url(self, item, *, compatibility=False):
        return os.getenv("IPTV_DEMO_MEDIA_URL", "http://127.0.0.1:8000/api/demo-video")
