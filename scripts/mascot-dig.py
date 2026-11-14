"""Cut the digging Dwoggle into layers so he can really dig: both front paws scrape, his tail wags, he rocks.

Usage: python3 scripts/mascot-dig.py scripts/art/dwoggle-digging.webp [folder for lossless copies]
Needs Python 3 with pillow, numpy and scipy. Writes the layers to public/brand/ and their pivots to
src/brand/diggingDwoggleRig.ts (generated: do not edit by hand). The component is src/brand/DiggingDwoggle.tsx.

The artwork in scripts/art/ is a 990 x 698 cut-out from a screenshot of the design. When the designer's own file
arrives (same drawing, transparent background), run this on it: the positions below are in the cut-out's pixels
and scale with a larger file.

Layers, bottom to top, all the size of the artwork so they stack exactly:
  tail       - his tail, which wags behind his body
  body       - everything else; where a paw was, the fur beside it is carried on underneath
  paw-right  - the far front leg, cut at the shoulder
  paw-left   - the near front leg, cut along its own outline
  front      - his head and chest again, so the tops of the legs slide under his chin
  dirt       - the mound his paws dig into, which stays where it is
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

SRC = sys.argv[1]
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'brand'
BASE = (990, 698)                       # the size the positions below were measured at

art = Image.open(SRC).convert('RGBA')
W, H = art.size
K = W / BASE[0]                         # positions scale with a larger artwork


def at(x, y):
    return (round(x * K), round(y * K))


img = np.array(art)
r, g, b, a = (img[..., i].astype(int) for i in range(4))
yy, xx = np.mgrid[0:H, 0:W]
opaque = a > 128
ink = ndimage.binary_dilation(opaque & (np.maximum(np.maximum(r, g), b) < 75), iterations=1)
fill = opaque & ~ink
labels, _ = ndimage.label(fill)


def region(x, y):
    """The area of flat colour, bounded by outlines, that holds this point."""
    px, py = at(x, y)
    assert labels[py, px] > 0, f'({x}, {y}) is on an outline'
    return labels == labels[py, px]


def grow(mask, px):
    return ndimage.binary_dilation(mask, iterations=max(1, round(px * K)))


def polygon(points):
    canvas = Image.new('L', (W, H), 0)
    ImageDraw.Draw(canvas).polygon([at(*p) for p in points], fill=255)
    return np.array(canvas) > 0


body_fill = region(500, 400)
tail_fill = region(900, 250)


def near(mask, px):
    """Everything within px of the mask, by distance (rounder than a grown square)."""
    return ndimage.distance_transform_edt(~mask) <= px * K


def outline_of(part, reach=10):
    """The outline round a flat area, soft edges included: what lies within reach and is not another area's flat colour."""
    others = ndimage.binary_erosion(fill & ~part, iterations=max(1, round(3 * K)))
    return near(part, reach) & (a > 0) & ~others

# ---- The near front leg: its own flat area (with the pebble drawn on it) and the outline round it ----
leg = ndimage.binary_fill_holes(region(200, 560) | region(215, 607))   # with the pebble drawn on its edge
PAW_LEFT = leg | outline_of(leg)
PAW_LEFT &= yy > at(0, 498)[1]                                   # the chin's line above it stays with the head
PAW_LEFT &= ~((xx < at(132, 0)[0]) & (yy > at(0, 585)[1]))       # the mound in front of it stays where it is

# ---- The far front leg: the body's fur below its upper outline, cut off the body across the shoulder ----
SHOULDER = [(424, 502), (520, 468), (590, 556), (608, 612)]
cut = Image.new('L', (W, H), 0)
ImageDraw.Draw(cut).line([at(*p) for p in SHOULDER], fill=255, width=max(3, round(3 * K)))
pieces, _ = ndimage.label(body_fill & ~(np.array(cut) > 0))
far_leg = pieces == pieces[at(380, 650)[1], at(380, 650)[0]]
PAW_RIGHT = (far_leg | outline_of(far_leg, 9)) & ~PAW_LEFT
# The cut runs through plain fur: the leg fades out over it, so no seam shows when the leg turns.
shoulder_cut = near(np.array(cut) > 0, 14)

# ---- The tail: its own flat area and its outer outline; the line it shares with the body stays with the body ----
d_tail, d_body = (ndimage.distance_transform_edt(~area) for area in (tail_fill, body_fill))
TAIL = (a > 0) & (d_tail <= 12 * K) & (d_tail < d_body)
# The tail's colour carries on under the body's line, to hide gaps when it wags; only where the body covers it.
tail_under = near(tail_fill, 12) & ~TAIL & (a == 255)

# ---- The earth that stays where it is while he rocks: the mound in front of his paws, the crumbs behind him ----
DIRT = (a > 0) & (((xx < at(132, 0)[0]) & (yy > at(0, 545)[1])) | ((xx > at(868, 0)[0]) & (yy > at(0, 505)[1])))

# The mound lies in front of the paws: where they meet, the pixels are the mound's.
PAW_LEFT &= ~DIRT
PAW_RIGHT &= ~DIRT

# ---- His head and chest, drawn again over the legs ----
# Only solid pixels: a soft edge drawn in two layers would come out darker than in the artwork.
FRONT = (a == 255) & (yy < at(0, 548)[1]) & ~PAW_LEFT & ~PAW_RIGHT & ~TAIL & ~DIRT


def carry_on(rgb, hole, source):
    """Fill `hole` with the `source` colours beside it: every pixel's nearest source pixel, smoothed, so nothing else bleeds in."""
    _, (iy, ix) = ndimage.distance_transform_edt(~source, return_indices=True)
    nearest = rgb[iy, ix].astype(float)
    soft = np.stack([ndimage.gaussian_filter(nearest[..., c], 7 * K) for c in range(3)], axis=-1)
    out = rgb.astype(float).copy()
    out[hole] = soft[hole]
    return out


# The body without its moving parts: under each paw the fur (never an outline) beside it carries on.
# The body without its moving parts: under each paw the brown fur beside it carries on (never an outline,
# and not the pale belly: what a lifted paw shows is the shade under him).
moving = PAW_LEFT | PAW_RIGHT
# Not under the shoulder, where the far leg fades out: there the body keeps its own fur.
under = grow(moving, 2) & opaque & ~DIRT & ~shoulder_cut
brown_fur = ndimage.binary_erosion(fill & (r > 80) & (g < 125) & ~grow(moving, 3), iterations=max(1, round(2 * K)))
body = img.astype(float).copy()
# A little darker than the fur beside it: it is in his own shade.
body[..., :3] = np.where(under[..., None], carry_on(img[..., :3], under, brown_fur) * 0.86, body[..., :3])
# Every soft-edged pixel of the artwork belongs to one layer only: the tail's, a paw's, the earth's, or the body's.
body[..., 3] = np.where(TAIL | DIRT | (moving & (a < 255)), 0, a)


def layer(mask, soft_edge=None, rgb=None):
    out = np.zeros((H, W, 4), float)
    out[..., :3] = img[..., :3] if rgb is None else rgb
    alpha = np.where(mask, a, 0).astype(float)
    if soft_edge is not None:
        # Fade the layer out over the cut: full strength away from it, nothing at its far side.
        ramp = ndimage.gaussian_filter((mask & ~soft_edge).astype(float), 5 * K)
        alpha = np.where(soft_edge & mask, np.minimum(alpha, ramp * 255 * 1.6), alpha).clip(0, 255)
    out[..., 3] = alpha
    return out


tail_rgb = img[..., :3].astype(float).copy()
tail_colour = np.median(img[tail_fill][:, :3], axis=0)
tail_rgb[tail_under] = tail_colour
tail = layer(TAIL | tail_under, rgb=tail_rgb)
tail[..., 3] = np.where(tail_under, 255, tail[..., 3])

layers = {
    'tail': tail,
    'body': body,
    'paw-right': layer(PAW_RIGHT, soft_edge=shoulder_cut),
    'paw-left': layer(PAW_LEFT),
    'front': layer(FRONT),
    'dirt': layer(DIRT),
}
for name, data in layers.items():
    out = Image.fromarray(data.clip(0, 255).astype('uint8'), 'RGBA')
    out.save(OUT / f'dwoggle-dig-{name}.webp', quality=88, method=6)
    if len(sys.argv) > 2:
        out.save(Path(sys.argv[2]) / f'dwoggle-dig-{name}.png')

# ---- Where the parts turn, and where his eyes are (for the lids), as shares of the artwork ----
def share(x, y):
    return [round(x / BASE[0] * 100, 2), round(y / BASE[1] * 100, 2)]


def eye(x, y):
    """The black of one eye round this point, in the artwork's base pixels, and how far down it the fur turns to cheek."""
    px, py = at(x, y)
    blob = ndimage.label(opaque & (np.maximum(np.maximum(r, g), b) < 60))[0]
    spot = blob == blob[py, px]
    ys, xs = np.nonzero(spot)
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    # Beside the eye, the first row where the brown fur gives way to the pale cheek.
    turns = []
    for column in (left - round(7 * K), right + round(7 * K)):
        pale = np.nonzero(r[top - round(12 * K):bottom + round(12 * K), column] > 205)[0]
        if len(pale):
            turns.append(top - round(12 * K) + pale[0])
    split = (np.mean(turns) - top) / (bottom - top) if turns else 0.6
    return {
        'cx': round(float((left + right) / 2 / K), 1),
        'cy': round(float((top + bottom) / 2 / K), 1),
        'rx': round(float((right - left) / 2 / K + 2), 1),
        'ry': round(float((bottom - top) / 2 / K + 2), 1),
        'cheekLine': round(float(min(max(split, 0.2), 0.9)), 2),
    }


rig = {
    'size': list(BASE),
    'pivots': {
        'body': share(770, 652),        # his hind foot, planted on the ground
        'pawLeft': share(262, 512),     # the near shoulder, under his chin
        'pawRight': share(512, 500),    # the far shoulder
        'tail': share(848, 336),        # where the tail leaves his back
    },
    'eyes': [eye(212, 360), eye(385, 350)],
}
(ROOT / 'src' / 'brand' / 'diggingDwoggleRig.ts').write_text(
    '// Generated by scripts/mascot-dig.py: where the digging Dwoggle\'s parts turn, and his eyes. Do not edit.\n'
    f'export const DIG_RIG = {json.dumps(rig, indent=2)} as const\n')
print('layers written;', {name: int((data[..., 3] > 0).sum()) for name, data in layers.items()})
print('eyes', rig['eyes'])
