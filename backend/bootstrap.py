"""Composition root: connect application ports to their infrastructure adapters."""

import asyncio
from contextlib import asynccontextmanager, suppress

from backend.application.catalog import CatalogService
from backend.application.playback import PlaybackService
from backend.infrastructure.demo import DemoRepository
from backend.infrastructure.media.proxy import MediaProxy
from backend.infrastructure.media.transcoder import ffmpeg_path
from backend.infrastructure.settings import ROOT, Settings
from backend.infrastructure.xtream import XtreamRepository
from backend.presentation.api import create_api


def create_app(repository=None, relay=None, settings=None):
    settings = settings or Settings.load()
    repository = repository or (DemoRepository() if settings.demo else XtreamRepository(settings))

    @asynccontextmanager
    async def lifespan(app):
        media_relay = relay or MediaProxy()
        playback = PlaybackService(repository, media_relay, ffmpeg_path)
        app.state.relay = media_relay
        app.state.playback = playback

        async def expire_abandoned_sessions():
            while True:
                await asyncio.sleep(30)
                await asyncio.to_thread(playback.expire_idle)

        cleanup_task = asyncio.create_task(expire_abandoned_sessions())
        try:
            yield
        finally:
            cleanup_task.cancel()
            with suppress(asyncio.CancelledError):
                await cleanup_task
            if playback.active:
                await asyncio.to_thread(playback.stop, playback.active.id)
            if relay is None:
                await asyncio.to_thread(media_relay.close)

    return create_api(
        catalog=CatalogService(repository),
        lifespan=lifespan,
        converter_available=ffmpeg_path,
        demo=settings.demo,
        frontend_dir=ROOT / "dist" / "elocine" / "browser",
        demo_video_path=ROOT / ".tools" / "demo.mp4",
    )
