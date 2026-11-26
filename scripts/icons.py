#!/usr/bin/env python3
"""Derive all application icons from assets/brand/icon-source.png.

    python3 scripts/icons.py [--preview out.png]

Steps: clean the alpha channel (the source has a faint semi-transparent haze
left from background removal), crop to the visible artwork, centre it on a
square 1024x1024 canvas with a small margin and write
  build/appicon.png                                   (1024, Wails v3 source)
  build/windows/icon.ico                              (16-256)
  build/darwin/icons.icns                             (macOS app bundle)
  build/linux/icons/hicolor/<n>x<n>/apps/gosshpher.png
  frontend/public/logo.png                            (128, toolbar and info card)
--preview writes a contact sheet (raw vs. cleaned, small sizes on Breeze light
and dark) instead. Requires Pillow.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "brand" / "icon-source.png"
LINUX_SIZES = [16, 22, 24, 32, 48, 64, 128, 256, 512]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
LOGO_SIZE = 128     # frontend/public/logo.png
ALPHA_FLOOR = 48     # alpha below this is haze, not artwork
MARGIN = 0.04        # free border per side of the square canvas


def clean(img: Image.Image) -> Image.Image:
    r, g, b, a = img.split()
    # drop the haze, then stretch the remaining edge alpha back to 0..255 so
    # anti-aliased edges stay smooth
    a = a.point(lambda v: 0 if v < ALPHA_FLOOR else min(255, (v - ALPHA_FLOOR) * 255 // (255 - ALPHA_FLOOR)))
    out = Image.merge("RGBA", (r, g, b, a))
    # fully transparent pixels get black RGB so resampling cannot bleed colour
    black = Image.new("RGBA", out.size, (0, 0, 0, 0))
    return Image.composite(out, black, a.point(lambda v: 255 if v else 0))


def square(img: Image.Image, size: int = 1024) -> Image.Image:
    box = img.getchannel("A").getbbox()
    art = img.crop(box)
    inner = int(size * (1 - 2 * MARGIN))
    scale = inner / max(art.size)
    art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def preview(variants, out: Path) -> None:
    sizes = [16, 22, 32, 48, 64, 128]
    cell = 140
    sheet = Image.new("RGB", (cell * len(sizes), cell * 2 * len(variants)), "white")
    for vi, img in enumerate(variants):
        for row, bg in enumerate([(239, 240, 241), (35, 38, 41)]):  # Breeze light / dark
            y0 = (vi * 2 + row) * cell
            for i, s in enumerate(sizes):
                tile = Image.new("RGBA", (cell, cell), bg + (255,))
                icon = img.resize((s, s), Image.LANCZOS)
                tile.alpha_composite(icon, ((cell - s) // 2, (cell - s) // 2))
                sheet.paste(tile.convert("RGB"), (i * cell, y0))
    sheet.save(out)
    print("wrote", out)


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    icon = square(clean(src))
    if "--preview" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--preview") + 1])
        preview([square(src), icon], out)
        return

    app = ROOT / "build" / "appicon.png"
    icon.save(app, optimize=True)
    print("wrote", app.relative_to(ROOT))

    ico = ROOT / "build" / "windows" / "icon.ico"
    ico.parent.mkdir(parents=True, exist_ok=True)
    icon.save(ico, sizes=[(s, s) for s in ICO_SIZES])
    print("wrote", ico.relative_to(ROOT))

    # Pillow derives all ICNS sizes (16 to 1024 incl. @2x) from the source
    icns = ROOT / "build" / "darwin" / "icons.icns"
    icon.save(icns)
    print("wrote", icns.relative_to(ROOT))

    hicolor = ROOT / "build" / "linux" / "icons" / "hicolor"
    for s in LINUX_SIZES:
        out = hicolor / f"{s}x{s}" / "apps" / "gosshpher.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        icon.resize((s, s), Image.LANCZOS).save(out, optimize=True)
        print("wrote", out.relative_to(ROOT))

    # toolbar (26 px) and info card (56 px), sharp up to about 2x scaling
    logo = ROOT / "frontend" / "public" / "logo.png"
    logo.parent.mkdir(parents=True, exist_ok=True)
    icon.resize((LOGO_SIZE, LOGO_SIZE), Image.LANCZOS).save(logo, optimize=True)
    print("wrote", logo.relative_to(ROOT))


if __name__ == "__main__":
    main()
