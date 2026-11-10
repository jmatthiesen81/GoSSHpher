#!/usr/bin/env python3
"""Derive all icon sizes from build/appicon.png (1024x1024, RGBA).

    python3 scripts/icons.py

Writes build/windows/icon.ico and build/linux/icons/hicolor/<size>/apps/gosshpher.png
and copies build/appicon.svg as the scalable Linux icon. Requires Pillow.
"""
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "build" / "appicon.png"
LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    if img.size != (1024, 1024):
        raise SystemExit(f"{SRC} must be 1024x1024, is {img.size}")

    ico = ROOT / "build" / "windows" / "icon.ico"
    img.save(ico, sizes=[(s, s) for s in ICO_SIZES])
    print("wrote", ico.relative_to(ROOT))

    hicolor = ROOT / "build" / "linux" / "icons" / "hicolor"
    for s in LINUX_SIZES:
        out = hicolor / f"{s}x{s}" / "apps" / "gosshpher.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        img.resize((s, s), Image.LANCZOS).save(out, optimize=True)
        print("wrote", out.relative_to(ROOT))

    svg = ROOT / "build" / "appicon.svg"
    if svg.exists():
        out = hicolor / "scalable" / "apps" / "gosshpher.svg"
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(svg, out)
        print("wrote", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
