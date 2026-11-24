"""Failures that application adapters may translate into transport responses."""


class ProviderError(Exception):
    pass


class ContentNotFoundError(Exception):
    pass


class PlaybackNotFoundError(Exception):
    pass


class InvalidPlaybackError(Exception):
    pass
