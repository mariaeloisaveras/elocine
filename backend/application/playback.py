"""Own exactly one provider playback. Proxy details are an infrastructure port."""

import secrets
import threading
import time
from typing import Callable

from backend.domain.errors import ContentNotFoundError, InvalidPlaybackError, PlaybackNotFoundError
from backend.domain.models import CatalogRepository
from backend.domain.playback import PlaybackSession
from backend.domain.ports import MediaRelay

IDLE_TIMEOUT_SECONDS = 90


class PlaybackService:
    def __init__(
        self,
        repository: CatalogRepository,
        relay: MediaRelay,
        converter_available: Callable[[], object],
    ):
        self.repository = repository
        self.relay = relay
        self.converter_available = converter_available
        self.lock = threading.RLock()
        self.active: PlaybackSession | None = None

    def start(self, kind, identifier, parent_id="", compatibility=True, offset=0):
        if kind == "episode":
            details = self.repository.details("series", parent_id)
            item = next((e for e in details.episodes if e.id == identifier), None)
            if not item:
                raise ContentNotFoundError("Este episódio não está mais disponível.")
        else:
            item = self.repository.details(kind, identifier).item
        if item.duration and offset >= item.duration:
            offset = 0
        with self.lock:
            if self.active:
                self.stop(self.active.id)
            compatible = bool(compatibility and self.converter_available())
            vod = kind != "live"
            prefetch = vod and (compatible or item.extension != "m3u8")
            token, url = self.relay.register(
                self.repository.stream_url(item, compatibility=compatible),
                self.repository.headers,
                transcode=compatible,
                prefetch=prefetch,
                seek_offset=offset if compatible and vod else 0,
            )
            self.active = PlaybackSession(
                id=secrets.token_urlsafe(24),
                token=token,
                media_url=url,
                item=item,
                compatibility=compatible,
                prefetch=prefetch,
                is_hls=(kind == "live" or item.extension == "m3u8") and not compatible,
                can_seek=compatible and vod,
                offset=offset if compatible and vod else 0,
                initial_position=offset if vod else 0,
            )
            return self.active.public()

    def require(self, identifier):
        if not self.active or self.active.id != identifier:
            raise PlaybackNotFoundError("A reprodução foi encerrada. Escolha o título novamente.")
        self.active.touched = time.monotonic()
        return self.active

    def seek(self, identifier, seconds):
        with self.lock:
            active = self.require(identifier)
            if not active.can_seek:
                raise InvalidPlaybackError("Este modo não permite busca no servidor.")
            if active.item.duration and seconds >= active.item.duration:
                raise InvalidPlaybackError("A posição está além do final do vídeo.")
            result = self.relay.seek(active.token, seconds)
            active.media_url = result["url"]
            active.offset = result["offset"]
            return active.public()

    def select_tracks(self, identifier, audio_index, subtitle_index, seconds):
        with self.lock:
            active = self.require(identifier)
            if not active.compatibility:
                raise InvalidPlaybackError(
                    "Ative a compatibilidade máxima para selecionar áudio e legendas."
                )
            if active.item.kind == "live":
                seconds = 0
            elif active.item.duration and seconds >= active.item.duration:
                raise InvalidPlaybackError("A posição está além do final do vídeo.")
            tracks = self.relay.progress(active.token).get("media_tracks", [])
            for kind, index in (("audio", audio_index), ("subtitle", subtitle_index)):
                if index is not None and not any(
                    track["kind"] == kind and track["index"] == index and track["supported"]
                    for track in tracks
                ):
                    raise InvalidPlaybackError(
                        "Esta faixa não está disponível ou não é compatível com o navegador."
                    )
            result = self.relay.select_tracks(active.token, seconds, audio_index, subtitle_index)
            active.media_url = result["url"]
            active.offset = result["offset"]
            active.audio_index = audio_index
            active.subtitle_index = subtitle_index
            return active.public()

    def subtitles(self, identifier, after=0):
        with self.lock:
            active = self.require(identifier)
            return self.relay.subtitles(active.token, after)

    def progress(self, identifier):
        with self.lock:
            active = self.require(identifier)
            return {**self.relay.progress(active.token), "offset": active.offset}

    def stop(self, identifier):
        with self.lock:
            if self.active and self.active.id == identifier:
                self.relay.revoke(self.active.token)
                self.active = None

    def expire_idle(self):
        with self.lock:
            if self.active and time.monotonic() - self.active.touched > IDLE_TIMEOUT_SECONDS:
                self.stop(self.active.id)
