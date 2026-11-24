"""Catalog use cases; no HTTP framework or provider-specific fields."""

import math

from backend.domain.errors import ContentNotFoundError
from backend.domain.models import CatalogRepository
from backend.domain.platforms import STREAMING_PLATFORMS, normalized


class CatalogService:
    def __init__(self, repository: CatalogRepository):
        self.repository = repository

    def search(self, kind, query="", category="", page=1, limit=24, platform=""):
        items = self._platform_items(kind, platform) if platform else self.repository.items(kind)
        if category:
            items = [i for i in items if i.category_id == category]
        if query.strip():
            term = normalized(query.strip())
            items = [i for i in items if term in normalized(i.title)]
        return self._paginate(items, page, limit)

    @staticmethod
    def _paginate(items, page, limit):
        total = len(items)
        pages = max(1, math.ceil(total / limit))
        page = min(page, pages)
        return {
            "items": [item.public() for item in items[(page - 1) * limit : page * limit]],
            "total": total,
            "page": page,
            "pages": pages,
        }

    def _platform_items(self, kind, platform_id):
        allowed_categories = self.platform_category_ids(kind, platform_id)
        if not allowed_categories:
            return []
        unique_items = {}
        for item in self.repository.items(kind):
            if item.category_id in allowed_categories:
                unique_items.setdefault(item.id, item)
        return list(unique_items.values())

    def platform_catalog(self, platform_id, query="", kind="all", page=1, limit=30):
        platform = next((item for item in STREAMING_PLATFORMS if item.id == platform_id), None)
        if platform is None:
            raise ContentNotFoundError("Esta plataforma não está disponível no catálogo.")
        kinds = ("movie", "series") if kind == "all" else (kind,)
        selections = [self._platform_items(selection, platform_id) for selection in kinds]
        # Interleave kinds consistently so a large movie catalog does not hide series.
        items = []
        for index in range(max((len(selection) for selection in selections), default=0)):
            for selection in selections:
                if index < len(selection):
                    items.append(selection[index])
        if query.strip():
            term = normalized(query.strip())
            items = [item for item in items if term in normalized(item.title)]
        return {"id": platform.id, "name": platform.name, **self._paginate(items, page, limit)}

    def schedule(self, identifier):
        self.repository.details("live", identifier)
        return {
            "programmes": [programme.public() for programme in self.repository.schedule(identifier)]
        }

    def details(self, kind, identifier):
        return self.repository.details(kind, identifier)

    def account(self):
        return self.repository.account()

    def categories(self, kind):
        return self.repository.categories(kind)

    def platform_category_ids(self, kind, platform_id):
        if kind == "live":
            return set()
        platform = next((item for item in STREAMING_PLATFORMS if item.id == platform_id), None)
        if platform is None:
            return set()
        return {
            category["id"]
            for category in self.repository.categories(kind)
            if platform.matches(category["name"])
        }

    def platforms(self, limit=12):
        """Match category metadata once per kind; no video connections are opened."""
        grouped = {platform.id: {"movie": [], "series": []} for platform in STREAMING_PLATFORMS}
        for kind in ("movie", "series"):
            category_platforms = {}
            for category in self.repository.categories(kind):
                matches = [
                    platform.id
                    for platform in STREAMING_PLATFORMS
                    if platform.matches(category["name"])
                ]
                if matches:
                    category_platforms[category["id"]] = matches
            if not category_platforms:
                continue
            seen = set()
            for item in self.repository.items(kind):
                for platform_id in category_platforms.get(item.category_id, ()):
                    identity = (platform_id, item.id)
                    if identity not in seen:
                        grouped[platform_id][kind].append(item)
                        seen.add(identity)
        rails = []
        for platform in STREAMING_PLATFORMS:
            movies = grouped[platform.id]["movie"]
            series = grouped[platform.id]["series"]
            total = len(movies) + len(series)
            if not total:
                continue
            items = []
            for index in range(min(max(len(movies), len(series)), limit)):
                for selection in (movies, series):
                    if index < len(selection) and len(items) < limit:
                        items.append(selection[index].public())
            rails.append({"id": platform.id, "name": platform.name, "items": items, "total": total})
        return rails
