"""Normalize Xtream EPG text and timestamps without exposing upstream fields."""

import base64
import binascii
import math

from backend.domain.schedule import Programme


def text(value):
    value = str(value or "").strip()
    try:
        decoded = base64.b64decode(value, validate=True).decode("utf-8")
        if decoded and all(
            character.isprintable() or character in "\n\r\t" for character in decoded
        ):
            return decoded.strip()
    except (ValueError, binascii.Error, UnicodeError):
        pass
    return value


def programmes(rows):
    result = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            start = float(row.get("start_timestamp", 0))
            end = float(row.get("stop_timestamp", 0))
            if not (math.isfinite(start) and math.isfinite(end) and 0 < start < end):
                continue
            programme = Programme(
                text(row.get("title")) or "Sem título",
                text(row.get("description")),
                int(start),
                int(end),
            )
            result[(programme.start, programme.end, programme.title)] = programme
        except (TypeError, ValueError, OverflowError):
            continue
    return sorted(result.values(), key=lambda programme: programme.start)
