from __future__ import annotations

import hashlib
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from .buffer import EpisodeBuffer
from .transcoder import terminate


@dataclass
class RelaySession:
    url: str
    headers: dict
    transcode: bool = False
    touched: float = field(default_factory=time.monotonic)
    resources: OrderedDict = field(default_factory=OrderedDict)
    responses: set = field(default_factory=set)
    processes: set = field(default_factory=set)
    stopped: bool = False
    buffer: EpisodeBuffer | None = None
    buffer_started: bool = False
    seek_offset: float = 0
    successor: str | None = None
    lock: threading.RLock = field(default_factory=threading.RLock)

    def resource(self, url):
        if urlsplit(url).scheme not in ("http", "https"):
            raise ValueError("Unsupported media URL")
        key = hashlib.sha256(url.encode()).hexdigest()
        with self.lock:
            self.resources[key] = url
            self.resources.move_to_end(key)
            while len(self.resources) > 4096:
                self.resources.popitem(last=False)
        return key

    def stop(self):
        with self.lock:
            self.stopped = True
            responses = list(self.responses)
            processes = list(self.processes)
        for process in processes:
            terminate(process)
        for response in responses:
            response.close()
        if self.buffer:
            self.buffer.stop()
