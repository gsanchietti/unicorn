#!/usr/bin/env python3
"""Turn a character photo into a transparent PNG with a soft light outline.

Only needed when you swap in new photos. The game itself has no build step.

Setup (once):
    python3 -m venv .venv && .venv/bin/pip install "rembg[cpu]" pillow numpy

Usage:
    .venv/bin/python tools/cutout.py assets/photos/bella.jpg assets/bella.png --turn transverse
    .venv/bin/python tools/cutout.py assets/photos/bongo.jpg  assets/bongo.png

--turn fixes the pose so the character faces right, standing up:
    none, left, right, flip, transverse, transpose
"""
import argparse

from PIL import Image, ImageFilter, ImageOps
from rembg import new_session, remove

TURNS = {
    "none": None,
    "left": Image.Transpose.ROTATE_90,
    "right": Image.Transpose.ROTATE_270,
    "flip": Image.Transpose.FLIP_LEFT_RIGHT,
    "transverse": Image.Transpose.TRANSVERSE,
    "transpose": Image.Transpose.TRANSPOSE,
}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("src")
    p.add_argument("dst")
    p.add_argument("--turn", default="none", choices=TURNS)
    p.add_argument("--size", type=int, default=640, help="longest side of the result")
    p.add_argument("--model", default="birefnet-general", help="rembg model, e.g. birefnet-general, isnet-general-use, u2net")
    p.add_argument("--outline", type=int, default=10, help="outline width in pixels")
    a = p.parse_args()

    img = ImageOps.exif_transpose(Image.open(a.src)).convert("RGB")
    img.thumbnail((1600, 1600))
    if TURNS[a.turn] is not None:
        img = img.transpose(TURNS[a.turn])

    cut = remove(img, session=new_session(a.model), post_process_mask=True)
    cut = cut.crop(cut.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox())
    cut.thumbnail((a.size, a.size), Image.LANCZOS)

    pad = a.outline * 3
    canvas = Image.new("RGBA", (cut.width + 2 * pad, cut.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(cut, (pad, pad), cut)

    # Soft outline: grow the shape, blur it, fill it with warm white, put the cut-out on top.
    alpha = canvas.getchannel("A").point(lambda v: 255 if v > 90 else 0)
    grown = alpha.filter(ImageFilter.MaxFilter(a.outline * 2 + 1))
    soft = grown.filter(ImageFilter.GaussianBlur(a.outline / 2.5)).point(lambda v: min(255, int(v * 1.15)))
    glow = Image.new("RGBA", canvas.size, (255, 252, 248, 0))
    glow.putalpha(soft)
    out = Image.alpha_composite(glow, canvas)
    out.save(a.dst, optimize=True)
    print(f"{a.dst}: {out.width}x{out.height}")


if __name__ == "__main__":
    main()
