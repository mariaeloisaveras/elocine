"""Download once to a temporary disk file, independently of browser backpressure."""

import os
import tempfile
import threading


class EpisodeBuffer:
    def __init__(self):
        handle = tempfile.NamedTemporaryFile(prefix="iptv-episode-", suffix=".cache", delete=False)
        self.path = handle.name
        handle.close()
        self.condition = threading.Condition()
        self.size = 0
        self.total = None
        self.content_type = "video/mp4"
        self.done = False
        self.error = None
        self.stopped = False

    def append(self, chunk):
        with self.condition:
            if self.stopped:
                return False
            with open(self.path, "ab") as target:
                target.write(chunk)
            self.size += len(chunk)
            self.condition.notify_all()
            return True

    def finish(self, error=None):
        with self.condition:
            self.done = True
            self.error = error
            if not error:
                self.total = self.size
            self.condition.notify_all()

    def stop(self):
        with self.condition:
            self.stopped = True
            self.condition.notify_all()
            try:
                os.unlink(self.path)
            except FileNotFoundError:
                pass

    def snapshot(self):
        with self.condition:
            return dict(size=self.size, total=self.total, done=self.done, error=self.error)

    def wait(self, offset):
        with self.condition:
            self.condition.wait_for(lambda: self.size > offset or self.done or self.stopped)
            return self.size > offset and not self.stopped

    def read(self, offset, length):
        with self.condition:
            if self.stopped:
                return b""
            with open(self.path, "rb") as source:
                source.seek(offset)
                return source.read(length)
