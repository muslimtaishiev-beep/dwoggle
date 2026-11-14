"""Draw the logo's head: the mascot's helmet over a clean, symmetric face, in one even, heavy line.

Usage: python3 scripts/logo-head.py "Dwoggle mascot v3 helmet.png"
Needs Python 3 with pillow, numpy and scipy. Writes public/brand/dwoggle-head.png.

The helmet is the artwork's own, mirrored, placed where the designer's logo has it (fitted to the Canva logo:
scale and position below, no rotation). The face is drawn fresh inside the logo's circle, symmetric about its
middle: fur above, cheeks below, eyes, nose and smile. Every line, the helmet's included, has the same weight,
heavier than in the artwork, so the head reads at logo size. Colours are the artwork's own.

Positions are in the pixels of the mirrored artwork (1584 wide).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

SRC = sys.argv[1]
OUT = Path(__file__).resolve().parent.parent / 'public' / 'brand' / 'dwoggle-head.png'

# The face's circle and the helmet's place, from the designer's logo.
CX, CY, RADIUS = 755.6, 653.6, 482.5
LINE = 34                                   # every line's weight; the artwork's own lines are about 20
OUT_WIDTH = 198 * 2                         # the logo is shown about 50 px wide; this is 8 times that
FUR, CHEEK, INK = (155, 104, 75), (255, 234, 205), (0, 0, 0)

# The face, measured from its middle (CX) and the level of the nose: the artwork's own sizes, made symmetric.
NOSE_Y = 732
EYE = {'dx': 215.5, 'dy': -47, 'rx': 48, 'ry': 55}
NOSE = [(-92, -52), (92, -52), (56, 22), (0, 62), (-56, 22)]   # wide on top, narrowing to the lip; corners rounded off
# Half of the smile, as a Bezier curve from its outer end to the middle; the other half mirrors it.
SMILE_HALF = [(-185, 100), (-172, 196), (-52, 214), (0, 128)]
PHILTRUM = [(0, 40), (0, 128)]
# Where the fur gives way to the cheeks: a dome whose top is above the nose and which passes through the eyes.
CHEEK_TOP, CHEEK_CURVE = 625, 0.0013

src = Image.open(SRC).convert('RGBA')
W, H = src.size
a = np.array(src).astype(int)
r, g, b, al = (a[..., i] for i in range(4))

# ---- The helmet, cut out of the artwork: from its top down to the first fur under the brim, with its outline ----
yellow = (al > 200) & (r > 190) & (g > 130) & (g < 215) & (b < 90)
fur = (al < 128) | ((((r > 70) & (r - b > 40) & (r >= g)) | ((r > 215) & (g > 185) & (b > 140) & (r - b > 20))) & ~yellow)
mask = np.zeros((H, W), bool)
for x in range(W):
    rows = np.nonzero(yellow[:760, x])[0]
    if len(rows) == 0:
        continue
    below = np.nonzero(fur[rows[-1]:, x])[0]
    mask[: rows[-1] + (below[0] if len(below) else H - rows[-1]), x] = True
ink = (al > 0) & (np.maximum(np.maximum(r, g), b) < 70)
ink[800:] = False
near = np.array(Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.MaxFilter(31))) > 0
mask |= near & ink
helmet = a.copy()
helmet[..., 3] = np.where(mask, al, 0)
# Mirrored, as in the logo: goggles right of the middle, the strap round the left.
helmet = helmet[:, ::-1]
# Only the drawn lines are grown, which are pure black: not the dark glass of the goggles or the helmet's inside.
helmet_ink = ((al > 0) & (np.maximum(np.maximum(r, g), b) < 32) & mask)[:, ::-1]

# ---- The canvas: the head with room for the heavier line ----
PAD = LINE
ys, xs = np.nonzero(helmet[..., 3] > 0)
x0, y0 = min(xs.min(), int(CX - RADIUS)) - PAD, ys.min() - PAD
x1, y1 = max(xs.max(), int(CX + RADIUS)) + PAD, int(CY + RADIUS) + PAD
SS = 2                                       # drawn at twice the size, for smooth edges
size = ((x1 - x0) * SS, (y1 - y0) * SS)


def at(x, y):
    return ((x - x0) * SS, (y - y0) * SS)


def face_point(dx, dy):
    return at(CX + dx, NOSE_Y + dy)


# ---- The face ----
face = Image.new('RGBA', size, (0, 0, 0, 0))
d = ImageDraw.Draw(face)
circle = [at(CX - RADIUS, CY - RADIUS), at(CX + RADIUS, CY + RADIUS)]
d.ellipse(circle, fill=FUR + (255,))
# The cheeks: everything in the circle below the dome.
cheeks = Image.new('L', size, 0)
dome = [at(CX + dx, CHEEK_TOP + CHEEK_CURVE * dx * dx) for dx in range(-int(RADIUS) - 40, int(RADIUS) + 41, 8)]
ImageDraw.Draw(cheeks).polygon(dome + [at(CX + RADIUS + 40, CY + RADIUS + 40), at(CX - RADIUS - 40, CY + RADIUS + 40)], fill=255)
inside = Image.new('L', size, 0)
ImageDraw.Draw(inside).ellipse(circle, fill=255)
face.paste(Image.new('RGBA', size, CHEEK + (255,)), mask=Image.fromarray(np.minimum(np.array(cheeks), np.array(inside))))
d = ImageDraw.Draw(face)
weight = LINE * SS
# The circle's outline, half inside and half outside its edge.
d.ellipse([at(CX - RADIUS - LINE / 2, CY - RADIUS - LINE / 2), at(CX + RADIUS + LINE / 2, CY + RADIUS + LINE / 2)], outline=INK + (255,), width=weight)
for side in (-1, 1):
    ex, ey = face_point(side * EYE['dx'], EYE['dy'])
    d.ellipse([ex - EYE['rx'] * SS, ey - EYE['ry'] * SS, ex + EYE['rx'] * SS, ey + EYE['ry'] * SS], fill=INK + (255,))


def pen(points):
    """A pen line through the points: one weight, round ends and joins."""
    d.line(points, fill=INK + (255,), width=weight, joint='curve')
    for x, y in (points[0], points[-1]):
        d.ellipse([x - weight / 2, y - weight / 2, x + weight / 2, y + weight / 2], fill=INK + (255,))


def bezier(p0, p1, p2, p3, steps=60):
    t = np.linspace(0, 1, steps)[:, None]
    curve = (1 - t) ** 3 * np.array(p0) + 3 * (1 - t) ** 2 * t * np.array(p1) + 3 * (1 - t) * t ** 2 * np.array(p2) + t ** 3 * np.array(p3)
    return [tuple(point) for point in curve]


for side in (-1, 1):
    pen([face_point(side * dx, dy) for dx, dy in bezier(*SMILE_HALF)])
pen([face_point(*p) for p in PHILTRUM])
# The nose, its corners rounded off by blurring its shape and cutting it sharp again.
nose = Image.new('L', size, 0)
ImageDraw.Draw(nose).polygon([face_point(dx, dy) for dx, dy in NOSE], fill=255)
nose = nose.filter(ImageFilter.GaussianBlur(11 * SS)).point(lambda v: 255 if v > 118 else 0).filter(ImageFilter.GaussianBlur(SS)).point(lambda v: 255 if v > 127 else 0)
face.paste(Image.new('RGBA', size, INK + (255,)), mask=nose)

# ---- The helmet over it, its lines grown to the same weight ----
def window(layer):
    """The part of an artwork-sized layer that falls on the canvas, which reaches past the artwork's own edge."""
    out = np.zeros((y1 - y0, x1 - x0) + layer.shape[2:], layer.dtype)
    sy0, sx0, sy1, sx1 = max(y0, 0), max(x0, 0), min(y1, H), min(x1, W)
    out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = layer[sy0:sy1, sx0:sx1]
    return out


crop = window(helmet)
grown = ndimage.binary_dilation(window(helmet_ink), iterations=(LINE - 20) // 2)
crop[grown] = INK + (255,)
layer = Image.fromarray(crop.astype('uint8'), 'RGBA').resize(size, Image.LANCZOS)
head = Image.alpha_composite(face, layer)

head = head.crop(head.getbbox())
scale = OUT_WIDTH / head.width
head = head.resize((OUT_WIDTH, round(head.height * scale)), Image.LANCZOS)
head.save(OUT, optimize=True)
print('head', head.size, '-> BrandMark width 198 height', round(198 * head.height / head.width))
