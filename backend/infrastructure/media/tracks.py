"""Discover input tracks from the running converter; never retain raw provider logs."""

import re
import threading
from pathlib import Path

HTTP_STATUS = re.compile(r"(?:server returned|http error|http error code)\s*(\d{3})", re.I)
TEXT_SUBTITLES = {"subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text", "microdvd"}
STREAM = re.compile(
    r"Stream #0:(\d+)(?:\[[^\]]*\])?(?:\(([^)]+)\))?[^:]*: (Audio|Subtitle): ([\w]+)"
)
TIMING = re.compile(
    r"^(\d+:\d{2}(?::\d{2})?\.\d{3}) --> (\d+:\d{2}(?::\d{2})?\.\d{3})(?: .*)?$", re.M
)


def conversion_failure(line):
    lowered = line.casefold()
    status = HTTP_STATUS.search(line)
    if status:
        if status[1] in {"401", "403"}:
            return (
                f"O provedor recusou a reprodução (HTTP {status[1]}). "
                "Confira o acesso da conta ao canal e feche outros players ou aparelhos; "
                "o limite de conexões pode estar em uso."
            )
        return f"O provedor recusou a reprodução (HTTP {status[1]}). Aguarde alguns segundos e tente novamente."
    if "invalid utf-8" in lowered or "unable to recode subtitle" in lowered:
        return "A legenda contém texto com codificação inválida."
    if "subtitle encoding currently only possible" in lowered:
        return "Esta faixa de legenda não pode ser convertida para texto."
    if "matches no streams" in lowered:
        return "A faixa selecionada não está mais disponível neste vídeo."
    if "no space left on device" in lowered:
        return "Não há espaço no disco para continuar a reprodução."
    if "connection timed out" in lowered or "connection refused" in lowered:
        return "O provedor não respondeu à reprodução. Tente novamente."
    if "invalid data found when processing input" in lowered:
        return "O provedor enviou dados de vídeo ou legenda inválidos."
    if "subtitle" in lowered and ("encoder not found" in lowered or "unknown encoder" in lowered):
        return "O conversor instalado não oferece suporte a esta legenda."
    return None


def read_tracks(playback, stream):
    reading = False
    try:
        for raw in stream:
            line = raw.decode("utf-8", errors="replace")
            status = HTTP_STATUS.search(line)
            if status:
                with playback.lock:
                    playback.upstream_status = int(status[1])
            failure = conversion_failure(line)
            if failure:
                with playback.lock:
                    playback.conversion_error = failure
            if line.startswith("Input #0,"):
                reading = True
            if line.startswith(("Stream mapping:", "Output #")):
                with playback.lock:
                    playback.tracks_ready = True
                reading = False
            match = STREAM.search(line) if reading else None
            if match:
                index, language, kind, codec = match.groups()
                track = {
                    "index": int(index),
                    "language": (language or "und")[:20],
                    "kind": "audio" if kind == "Audio" else "subtitle",
                    "codec": codec,
                    "supported": kind == "Audio" or codec in TEXT_SUBTITLES,
                }
                with playback.lock:
                    if not any(item["index"] == track["index"] for item in playback.tracks):
                        playback.tracks.append(track)
    finally:
        with playback.lock:
            playback.tracks_ready = True
        stream.close()


def monitor_tracks(playback, process):
    thread = threading.Thread(target=read_tracks, args=(playback, process.stderr), daemon=True)
    thread.start()
    return thread


def cue_seconds(value):
    result = 0.0
    for part in value.split(":"):
        result = result * 60 + float(part)
    return result


def subtitle_cues(path, after):
    if not path or not Path(path).exists():
        return {"cues": [], "cursor": after}
    try:
        with open(path, encoding="utf-8", errors="replace") as stream:
            text = stream.read(8 * 1024 * 1024).replace("\r\n", "\n")
    except OSError:
        return {"cues": [], "cursor": after}
    cues = []
    blocks = text.split("\n\n")
    if not text.endswith("\n"):
        blocks = blocks[:-1]
    for block in blocks:
        timing = TIMING.search(block)
        if timing:
            start, end = map(cue_seconds, timing.groups())
            if end > start:
                cues.append({"start": start, "end": end, "text": block[timing.end() :].strip()})
    batch = cues[after : after + 300]
    return {"cues": batch, "cursor": after + len(batch)}
