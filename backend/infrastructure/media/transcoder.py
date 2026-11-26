from __future__ import annotations

import shutil
import subprocess
import time

from .tracks import monitor_tracks


def ffmpeg_path():
    import os

    explicit = os.getenv("IPTV_FFMPEG")
    if explicit:
        return shutil.which(explicit)
    system = shutil.which("ffmpeg")
    if system:
        return system
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError):
        return None


def terminate(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def conversion_command(playback):
    command = [
        ffmpeg_path(),
        "-nostdin",
        "-loglevel",
        "info",
        "-nostats",
        "-rw_timeout",
        "15000000",
        "-user_agent",
        playback.headers.get("User-Agent", "VLC/3.0.20"),
    ]
    # Only live conversion has no persistent VOD buffer. Reconnect the input,
    # keeping the same encoder/output alive instead of splicing new MP4 headers.
    if playback.transcode and playback.buffer is None:
        command.extend(
            [
                "-reconnect",
                "1",
                "-reconnect_streamed",
                "1",
                "-reconnect_on_network_error",
                "1",
                "-reconnect_on_http_error",
                "429,500,502,503,504",
                "-reconnect_delay_max",
                "5",
                "-reconnect_max_retries",
                "3",
                "-reconnect_delay_total_max",
                "15",
            ]
        )
    if playback.seek_offset:
        command.extend(["-ss", str(playback.seek_offset)])
    command += [
        "-i",
        playback.url,
        "-map",
        "0:v:0?",
        "-map",
        f"0:{playback.audio_index}" if playback.audio_index is not None else "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-g",
        "50",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-movflags",
        "frag_keyframe+empty_moov+default_base_moof",
        "-f",
        "mp4",
        "pipe:1",
    ]

    if playback.subtitle_index is not None and playback.subtitle_path:
        command += [
            "-map",
            f"0:{playback.subtitle_index}",
            "-c:s",
            "webvtt",
            "-f",
            "webvtt",
            "-flush_packets",
            "1",
            "-y",
            playback.subtitle_path,
        ]
    return command


def conversion_chunks(playback, chunk_size=256 * 1024):
    """Retry temporary upstream refusals only before any MP4 bytes have been sent."""
    for attempt in range(3):
        process = monitor = None
        delivered = False
        try:
            with playback.lock:
                if playback.stopped:
                    return
                if playback.processes:
                    raise ValueError("Uma conversão já está em reprodução.")
                playback.conversion_started_at = time.monotonic()
                playback.last_output_at = None
                playback.output_bytes = 0
                playback.conversion_done = False
                playback.conversion_failed = False
                playback.conversion_error = None
                playback.upstream_status = None
                process = subprocess.Popen(
                    conversion_command(playback), stdout=subprocess.PIPE, stderr=subprocess.PIPE
                )
                playback.processes.add(process)
                monitor = monitor_tracks(playback, process)
            for chunk in iter(lambda: process.stdout.read1(chunk_size), b""):
                if playback.stopped:
                    return
                with playback.lock:
                    playback.last_output_at = time.monotonic()
                    playback.output_bytes += len(chunk)
                delivered = True
                yield chunk
            return_code = process.wait()
            monitor.join(timeout=2)
            if playback.stopped:
                return
            if return_code == 0:
                playback.conversion_done = True
                if playback.transcode and playback.buffer is None:
                    playback.conversion_failed = True
                    playback.conversion_error = (
                        "A transmissão ao vivo foi encerrada pelo provedor. Tente novamente."
                    )
                else:
                    playback.conversion_error = None
                return
            retry = (
                not delivered
                and attempt < 2
                and playback.upstream_status in {429, 500, 502, 503, 504}
            )
            if not retry:
                playback.conversion_failed = True
                raise ValueError(
                    playback.conversion_error
                    or "Não foi possível converter o vídeo. Tente novamente."
                )
        finally:
            if process:
                terminate(process)
                process.stdout.close()
                if monitor:
                    monitor.join(timeout=2)
                with playback.lock:
                    playback.processes.discard(process)
        if playback.stopped_event.wait(attempt + 1):
            return
