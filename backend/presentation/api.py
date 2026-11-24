from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi import Path as ApiPath
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from backend.domain.errors import (
    ContentNotFoundError,
    InvalidPlaybackError,
    PlaybackNotFoundError,
    ProviderError,
)

CatalogKind = Literal["movie", "series", "live"]


class StartRequest(BaseModel):
    kind: Literal["movie", "series", "live", "episode"]
    id: str = Field(pattern=r"^\d+$", max_length=30)
    parent_id: str = Field(default="", pattern=r"^\d*$", max_length=30)
    compatibility: bool = True
    offset: float = Field(default=0, ge=0, lt=604800, allow_inf_nan=False)


class SeekRequest(BaseModel):
    seconds: float = Field(ge=0, lt=604800, allow_inf_nan=False)


def create_api(catalog, lifespan, converter_available, demo, frontend_dir, demo_video_path):
    app = FastAPI(title="Elocine API", lifespan=lifespan, docs_url="/api/docs", redoc_url=None)

    @app.exception_handler(ProviderError)
    async def provider_error(request, exc):
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    @app.exception_handler(ContentNotFoundError)
    @app.exception_handler(PlaybackNotFoundError)
    async def missing(request, exc):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InvalidPlaybackError)
    async def invalid(request, exc):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.get("/api/health")
    def health():
        return {"ok": True, "demo": demo, "compatibility_available": bool(converter_available())}

    @app.get("/api/account")
    def account():
        return {
            **catalog.account(),
            "compatibility_available": bool(converter_available()),
            "demo": demo,
        }

    @app.get("/api/categories")
    def categories(kind: CatalogKind):
        return catalog.categories(kind)

    @app.get("/api/catalog")
    def search(
        kind: CatalogKind,
        q: str = Query(default="", max_length=200),
        category: str = "",
        page: int = Query(default=1, ge=1),
        limit: int = Query(default=24, ge=1, le=60),
        platform: str = Query(default="", max_length=40),
    ):
        return catalog.search(kind, q, category, page, limit, platform)

    @app.get("/api/platforms")
    def platforms(limit: int = Query(default=12, ge=1, le=30)):
        return catalog.platforms(limit)

    @app.get("/api/platforms/{platform_id}")
    def platform_catalog(
        platform_id: str,
        q: str = Query(default="", max_length=200),
        kind: Literal["all", "movie", "series"] = "all",
        page: int = Query(default=1, ge=1),
        limit: int = Query(default=30, ge=1, le=60),
    ):
        return catalog.platform_catalog(platform_id, q, kind, page, limit)

    @app.get("/api/channels/{identifier}/schedule")
    def schedule(identifier: str = ApiPath(pattern=r"^\d+$", max_length=30)):
        return catalog.schedule(identifier)

    @app.get("/api/items/{kind}/{identifier}")
    def details(kind: CatalogKind, identifier: str):
        return catalog.details(kind, identifier).public()

    @app.post("/api/playbacks")
    def start(body: StartRequest, request: Request):
        if body.kind == "series":
            raise HTTPException(400, "Escolha um episódio para começar.")
        return request.app.state.playback.start(
            body.kind, body.id, body.parent_id, body.compatibility, body.offset
        )

    @app.get("/api/playbacks/{identifier}/progress")
    def progress(identifier: str, request: Request):
        return request.app.state.playback.progress(identifier)

    @app.post("/api/playbacks/{identifier}/seek")
    def seek(identifier: str, body: SeekRequest, request: Request):
        return request.app.state.playback.seek(identifier, body.seconds)

    @app.post("/api/playbacks/{identifier}/stop", status_code=204)
    def stop(identifier: str, request: Request):
        request.app.state.playback.stop(identifier)

    if demo:

        @app.get("/api/demo-video")
        def demo_video():
            path = demo_video_path
            if not path.exists():
                raise HTTPException(
                    404,
                    "Execute python -m backend.infrastructure.demo_video para gerar o vídeo de teste.",
                )
            return FileResponse(path, media_type="video/mp4")

    static = frontend_dir
    if static.exists():

        @app.get("/{path:path}", include_in_schema=False)
        def frontend(path: str):
            if path.startswith("api/"):
                raise HTTPException(404)
            target = (static / path).resolve()
            if target.is_relative_to(static.resolve()) and target.is_file():
                return FileResponse(
                    target,
                    headers={
                        "Cache-Control": "no-cache"
                        if target.name == "index.html"
                        else "public, max-age=3600"
                    },
                )
            return FileResponse(static / "index.html", headers={"Cache-Control": "no-cache"})

    return app
