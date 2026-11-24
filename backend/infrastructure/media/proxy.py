"""Manage token-scoped media sessions and their local HTTP server."""

import atexit
import re
import secrets
import threading
import time
from urllib.parse import urljoin

from .buffer import EpisodeBuffer
from .http import MediaHTTPServer
from .session import RelaySession


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

    def register(self, url, headers, transcode=False, prefetch=False, seek_offset=0):
        playback = RelaySession(url, dict(headers), transcode, seek_offset=seek_offset)
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
        if playback and playback.buffer:
            return playback.buffer.snapshot()
        return {"size": 0, "total": None, "done": False, "error": None}

    def seek(self, token, seconds):
        seconds = float(seconds)
        if not 0 <= seconds < 604800:
            raise ValueError("Invalid position")
        # Serialize changes so rapid seeks never leave two provider inputs open.
        with self.seek_lock:
            token, previous = self.resolve(token)
            if not previous or previous.stopped:
                raise ValueError("Reprodução encerrada")
            if not previous.transcode or not previous.buffer:
                raise ValueError("Busca no servidor disponível apenas na conversão de episódios")
            previous.stop()
            new_token, url = self.register(
                previous.url, previous.headers, transcode=True, prefetch=True, seek_offset=seconds
            )
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
