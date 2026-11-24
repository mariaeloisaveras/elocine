"""Install the official portable Node runtime inside this project (never globally)."""

import hashlib
import platform
import tarfile
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "24.22.1"


def main():
    target = ROOT / ".tools" / "node"
    if (target / "bin" / "node").exists():
        print("Node local já está instalado.")
        return
    system = {"Linux": "linux", "Darwin": "darwin"}.get(platform.system())
    architecture = {"x86_64": "x64", "AMD64": "x64", "aarch64": "arm64", "arm64": "arm64"}.get(
        platform.machine()
    )
    if not system or not architecture:
        raise SystemExit("Instale Node 24 LTS pelo site oficial para este sistema.")
    filename = f"node-v{VERSION}-{system}-{architecture}.tar.xz"
    base = f"https://nodejs.org/dist/v{VERSION}/"
    with urllib.request.urlopen(base + "SHASUMS256.txt", timeout=30) as response:
        hashes = response.read().decode()
    expected = next(
        line.split()[0] for line in hashes.splitlines() if line.endswith("  " + filename)
    )
    target.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as directory:
        archive = Path(directory) / filename
        urllib.request.urlretrieve(base + filename, archive)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
            raise SystemExit("O arquivo Node não passou na verificação SHA256.")
        with tarfile.open(archive) as bundle:
            bundle.extractall(directory, filter="data")
        (Path(directory) / filename.removesuffix(".tar.xz")).rename(target)
    print("Node e npm instalados em .tools/node, somente neste projeto.")


if __name__ == "__main__":
    main()
