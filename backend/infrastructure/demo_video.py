"""Generate a local synthetic video for explicit demo mode."""

import subprocess

from backend.infrastructure.media.transcoder import ffmpeg_path
from backend.infrastructure.settings import ROOT


def main():
    target = ROOT / ".tools" / "demo.mp4"
    target.parent.mkdir(exist_ok=True)
    subprocess.run(
        [
            ffmpeg_path(),
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=640x360:rate=24",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=220:sample_rate=44100",
            "-t",
            "12",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(target),
        ],
        check=True,
    )
    print("Vídeo sintético gerado em .tools/demo.mp4")


if __name__ == "__main__":
    main()
