from __future__ import annotations

import shutil
import subprocess


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
        "error",
        "-rw_timeout",
        "15000000",
        "-user_agent",
        playback.headers.get("User-Agent", "VLC/3.0.20"),
    ]
    if playback.seek_offset:
        command.extend(["-ss", str(playback.seek_offset)])
    return command + [
        "-i",
        playback.url,
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
