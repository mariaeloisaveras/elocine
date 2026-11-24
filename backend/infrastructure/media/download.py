import subprocess

import requests

from .transcoder import conversion_command, ffmpeg_path, terminate


def download_to_buffer(playback):
    buffer = playback.buffer
    process = response = None
    error = None
    try:
        if playback.transcode:
            if not ffmpeg_path():
                raise ValueError("Conversor indisponível")
            with playback.lock:
                if playback.stopped:
                    return
                process = subprocess.Popen(
                    conversion_command(playback), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
                )
                playback.processes.add(process)
            chunks = iter(lambda: process.stdout.read1(256 * 1024), b"")
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
            if process and process.wait() != 0:
                raise ValueError("Falha ao converter o episódio")
            if not buffer.size or (buffer.total is not None and buffer.size != buffer.total):
                raise ValueError("Download do episódio incompleto")
    except (requests.RequestException, OSError):
        error = "Falha de conexão ou de gravação do episódio"
    except ValueError as exc:
        error = str(exc)
    finally:
        if process:
            terminate(process)
            process.stdout.close()
        if response is not None:
            response.close()
        with playback.lock:
            playback.processes.discard(process)
            playback.responses.discard(response)
        buffer.finish(error)
