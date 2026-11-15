"""The logo's head from the designer's clean drawing: cut off its black background, keep its own outline.

Usage: python3 scripts/logo-clean.py scripts/art/dwoggle-logo-clean.jpg
Needs Python 3 with pillow, numpy and scipy. Writes public/brand/dwoggle-head.png (used by the header, the map's
chat button, the PDF report and the browser tab).

The drawing comes on solid black, the same black as its outline, so the two cannot be told apart by colour. The
background is the black that reaches the picture's edge; what it leaves is the head without its outer line, and
that line is drawn back on, as heavy as the drawing's inner lines, with a smooth edge.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

OUT = Path(__file__).resolve().parent.parent / 'public' / 'brand' / 'dwoggle-head.png'
SIZE = (396, 348)        # the size the app shows it at, twice over (198 x 174 CSS pixels)
DARK = 48                # background black, JPEG noise included; the brim's dark grey is lighter than this
OUTLINE = 0.0115         # the outer line's weight, as a share of the drawing's width (its inner lines are about that)

def cut(path: str) -> Image.Image:
    """The head at the drawing's own size, on a transparent background."""
    art = Image.open(path).convert('RGB')
    img = np.asarray(art).astype(np.float64)
    H, W = img.shape[:2]
    dark = img.max(axis=2) < DARK
    labels, _ = ndimage.label(dark)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, edge[edge > 0])
    line = OUTLINE * W
    # What is left falls apart where an inner line meets the outer one (the helmet's brim, say): keep every real
    # piece (not specks of JPEG noise), then close the gaps the width of a line and fill what they enclose.
    pieces, n = ndimage.label(~background)
    sizes = ndimage.sum(~background, pieces, range(1, n + 1))
    kept = np.isin(pieces, 1 + np.nonzero(sizes > 0.002 * H * W)[0])
    r = int(np.ceil(line * 1.6))
    disk = np.hypot(*np.mgrid[-r:r + 1, -r:r + 1]) <= r
    head = ndimage.binary_fill_holes(ndimage.binary_closing(np.pad(kept, r), structure=disk)[r:-r, r:-r])

    distance = ndimage.distance_transform_edt(~head)
    alpha = np.clip(line + 0.5 - distance, 0, 1)

    rgb = img.copy()
    rgb[~head] = 0                       # the outer line: plain black
    rgba = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    out = Image.fromarray(rgba, 'RGBA')
    return out


def main(src: str) -> None:
    out = cut(src)
    W, H = out.size
    # Crop to the head, then pad to the app's proportions, centred, and scale down.
    left, top, right, bottom = out.getbbox()
    w, h = right - left, bottom - top
    target = SIZE[0] / SIZE[1]
    if w / h < target:
        w2, h2 = round(h * target), h
    else:
        w2, h2 = w, round(w / target)
    canvas = Image.new('RGBA', (w2, h2), (0, 0, 0, 0))
    canvas.alpha_composite(out.crop((left, top, right, bottom)), ((w2 - w) // 2, (h2 - h) // 2))
    canvas.resize(SIZE, Image.LANCZOS).save(OUT, optimize=True)
    print('written', OUT, SIZE, 'from', (W, H), 'head box', (left, top, right, bottom))


if __name__ == '__main__':
    main(sys.argv[1])
