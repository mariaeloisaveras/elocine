"""Manage token-scoped media sessions and their local HTTP server."""

import atexit
import re
import secrets
import tempfile
import threading
import time
from urllib.parse import urljoin

from .buffer import EpisodeBuffer
from .http import MediaHTTPServer
from .session import RelaySession
from .tracks import subtitle_cues


class MediaProxy:
    def __init__(self):
        self.lock = threading.RLock()
        self.closed = False
        self.seek_lock = threading.Lock()
        self.playbacks = {}
        self.server = MediaHTTPServer(self)
        self.origin = f"http://127.0.0.1:{self.server.server_port}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        atexit.register(self.close)

    def register(
        self,
        url,
        headers,
        transcode=False,
        prefetch=False,
        seek_offset=0,
        audio_index=None,
        subtitle_index=None,
    ):
        playback = RelaySession(
            url,
            dict(headers),
            transcode,
            seek_offset=seek_offset,
            audio_index=audio_index,
            subtitle_index=subtitle_index,
        )
        if subtitle_index is not None:
            with tempfile.NamedTemporaryFile(
                prefix="elocine-sub-", suffix=".vtt", delete=False
            ) as stream:
                playback.subtitle_path = stream.name
        if prefetch:
            playback.buffer = EpisodeBuffer()
        key = playback.resource(url)
        token = secrets.token_urlsafe(24)
        with self.lock:
            expired = [k for k, p in self.playbacks.items() if time.monotonic() - p.touched > 7200]
        for old in expired:
            self.revoke(old)
        with self.lock:
            self.playbacks[token] = playback
        suffix = "compat.mp4" if transcode else key
        return token, f"{self.origin}/media/{token}/{suffix}"

    def resolve(self, token):
        with self.lock:
            playback = self.playbacks.get(token)
            while playback and playback.successor:
                token = playback.successor
                playback = self.playbacks.get(token)
            return token, playback

    def progress(self, token):
        _, playback = self.resolve(token)
        progress = (
            playback.buffer.snapshot()
            if playback and playback.buffer
            else {"size": 0, "total": None, "done": False, "error": None}
        )
        if playback:
            if not playback.buffer:
                with playback.lock:
                    progress["size"] = playback.output_bytes
                    progress["done"] = playback.conversion_done
                    progress["error"] = (
                        playback.conversion_error if playback.conversion_failed else None
                    )
                    last_output = playback.last_output_at or playback.conversion_started_at
                    if (
                        playback.transcode
                        and not playback.stopped
                        and playback.last_output_at is None
                        and last_output is not None
                        and time.monotonic() - last_output >= 25
                        and not progress["error"]
                    ):
                        progress["error"] = (
                            "O canal não iniciou o envio de vídeo em 25 segundos. Tente novamente."
                        )
            with playback.lock:
                progress.update(
                    media_tracks=list(playback.tracks), tracks_ready=playback.tracks_ready
                )
        return progress

    def subtitles(self, token, after=0):
        _, playback = self.resolve(token)
        return subtitle_cues(playback.subtitle_path if playback else None, after)

    def seek(self, token, seconds):
        return self._restart(token, seconds)

    def select_tracks(self, token, seconds, audio_index, subtitle_index):
        return self._restart(
            token, seconds, {"audio_index": audio_index, "subtitle_index": subtitle_index}
        )

    def _restart(self, token, seconds, selection=None):
        seconds = float(seconds)
        if not 0 <= seconds < 604800:
            raise ValueError("Invalid position")
        with self.seek_lock:
            token, previous = self.resolve(token)
            if not previous or previous.stopped:
                raise ValueError("Reprodução encerrada")
            if not previous.transcode or (selection is None and not previous.buffer):
                raise ValueError("Este modo não permite alterar a reprodução no servidor")
            tracks = list(previous.tracks)
            ready = previous.tracks_ready
            selection = selection or {
                "audio_index": previous.audio_index,
                "subtitle_index": previous.subtitle_index,
            }
            previous.stop()
            new_token, url = self.register(
                previous.url,
                previous.headers,
                transcode=True,
                prefetch=previous.buffer is not None,
                seek_offset=seconds,
                **selection,
            )
            _, current = self.resolve(new_token)
            current.tracks = tracks
            current.tracks_ready = ready
            previous.successor = new_token
            return dict(url=url, offset=seconds)

    def revoke(self, token):
        while token:
            with self.lock:
                playback = self.playbacks.pop(token, None)
            if not playback:
                return
            token = playback.successor
            playback.stop()

    def close(self):
        with self.lock:
            if self.closed:
                return
            self.closed = True
            tokens = list(self.playbacks)
        for token in tokens:
            self.revoke(token)
        self.server.shutdown()
        self.server.server_close()
        atexit.unregister(self.close)

    def rewrite_playlist(self, text, base_url, token, playback):
        def local(uri):
            key = playback.resource(urljoin(base_url, uri))
            return f"{self.origin}/media/{token}/{key}"

        lines = []
        for line in text.splitlines():
            if line.startswith("#"):
                # Covers encryption keys, init segments and alternate audio/video.
                line = re.sub(r'URI="([^"\n]+)"', lambda m: 'URI="' + local(m[1]) + '"', line)
            elif line.strip():
                line = local(line.strip())
            lines.append(line)
        return "\n".join(lines) + "\n"
