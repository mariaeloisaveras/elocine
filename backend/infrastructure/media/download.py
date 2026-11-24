import requests

from .transcoder import conversion_chunks, ffmpeg_path


def download_to_buffer(playback):
    buffer = playback.buffer
    response = chunks = None
    error = None
    try:
        if playback.transcode:
            if not ffmpeg_path():
                raise ValueError("Conversor indisponível")
            chunks = conversion_chunks(playback)
        else:
            response = requests.get(
                playback.url,
                headers={**playback.headers, "Accept-Encoding": "identity"},
                stream=True,
                timeout=(10, 20),
            )
            with playback.lock:
                if playback.stopped:
                    return
                playback.responses.add(response)
            if response.status_code != 200:
                raise ValueError(f"Provedor retornou HTTP {response.status_code}")
            kind = response.headers.get("Content-Type", "application/octet-stream")
            if any(part in kind.lower() for part in ("html", "json", "mpegurl")):
                raise ValueError("Provedor não enviou um arquivo de vídeo")
            buffer.content_type = kind
            length = response.headers.get("Content-Length")
            if length and length.isdigit() and not response.headers.get("Content-Encoding"):
                buffer.total = int(length)
            chunks = response.iter_content(chunk_size=256 * 1024)
        for chunk in chunks:
            if playback.stopped or not buffer.append(chunk):
                break
        if not playback.stopped:
            if not buffer.size or (buffer.total is not None and buffer.size != buffer.total):
                raise ValueError("Download do episódio incompleto")
    except (requests.RequestException, OSError):
        error = "Falha de conexão ou de gravação do episódio"
    except ValueError as exc:
        error = str(exc)
    finally:
        if playback.transcode and chunks is not None:
            chunks.close()
        if response is not None:
            response.close()
        with playback.lock:
            playback.responses.discard(response)
        buffer.finish(error)
