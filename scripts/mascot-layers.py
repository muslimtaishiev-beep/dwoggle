"""Cut the standing Dwoggle into layers so he can close his map like a book and open it again.

Usage: python3 scripts/mascot-layers.py "Dwoggle mascot v3 helmet.png" [folder for lossless copies]
Needs Python 3 with pillow, numpy and scipy. Writes the layers to public/brand/ and the motion to
src/brand/standingDwoggleRig.ts and src/brand/StandingDwoggleFold.css (both generated: do not edit by hand).

The map folds along its own centre crease. His right paw keeps the right half where it is; his left paw takes
the left half over onto it, like closing a book, and opens it again. The left arm, hidden behind the map in the
drawing, is two flat segments (shoulder to elbow, elbow to paw) whose angles are solved for every frame so the
paw stays on the paper's edge. What the map hid (his chest, the side of his body) is painted in the drawing's
own flat colours. The open pose is the drawing itself.

Positions below are in the pixels of the drawing (1584 x 2350); the layers are 669 x 1000, the drawing cropped to
its own bounds.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC = sys.argv[1]
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'brand'
CROP = (19, 19, 1565, 2331)
SIZE = (669, 1000)
SX, SY = SIZE[0] / (CROP[2] - CROP[0]), SIZE[1] / (CROP[3] - CROP[1])
FUR, CREAM, PAPER, INK = (152, 97, 66, 255), (255, 234, 207, 255), (228, 228, 168, 255), (0, 0, 0, 255)

# The crease: from the dip in the map's top edge to the point of its bottom edge.
CREASE_TOP, CREASE_BOTTOM = (520.0, 1199.0), (645.0, 1807.0)
SLANT = (CREASE_BOTTOM[0] - CREASE_TOP[0]) / (CREASE_BOTTOM[1] - CREASE_TOP[1])


def crease_x(y):
    return CREASE_TOP[0] + SLANT * (y - CREASE_TOP[1])


def to_out(x, y):
    return ((x - CROP[0]) * SX, (y - CROP[1]) * SY)


src = Image.open(SRC).convert('RGBA')
img = np.array(src)
H, W = img.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
r, g, b, a = (img[..., i].astype(int) for i in range(4))
opaque = a > 128
ink = opaque & (np.maximum(np.maximum(r, g), b) < 70)
fur = opaque & (r > 70) & (r - b > 40) & (r >= g) & (g < 150)

# ---- The map and the paws ----
greenish = opaque & (g >= r - 30) & (g > b + 15) & ~ink
blue = opaque & (b > r + 30) & ~ink
paper = opaque & (r > 200) & (g > 200) & (np.abs(r - g) <= 16) & (b < 200)
mapcol = ndimage.binary_opening((greenish | blue | paper) & (xx < 1250) & (yy > 1060) & (yy < 1850), iterations=2)
lab, n = ndimage.label(mapcol)
mapcol = lab == (np.argmax(ndimage.sum(mapcol, lab, range(1, n + 1))) + 1)
inside = ndimage.binary_fill_holes(ndimage.binary_closing(mapcol, iterations=6))
MAP = ndimage.binary_fill_holes(inside | (ink & ndimage.binary_dilation(inside, iterations=26)))
lab, n = ndimage.label(fur)
left_fur = lab == lab[1420, 150]
right_fur = fur & (xx > 930) & (xx < 1250) & (yy > 1290) & (yy < 1610)


def paw(fur_mask):
    mask = fur_mask | (ink & ndimage.binary_dilation(fur_mask, iterations=24))
    return ndimage.binary_fill_holes(ndimage.binary_closing(mask, iterations=3))


LEFT_PAW, RIGHT_PAW = paw(left_fur), paw(right_fur)
LEFT = MAP & (xx < crease_x(yy)) & ~ndimage.binary_dilation(LEFT_PAW, iterations=3)

# ---- What the left half hid: chest, the side of the body, the belly; painted at the drawing's size ----
# The chest: the face's cream above the chin line, the head's shadow below it, light belly further down. The chin
# line shows on both sides of the map; behind it, it runs on as one smooth curve.
shadow = (a > 200) & (r > 215) & (g > 185) & (g < 220) & (b > 140) & (b < 190) & (yy > 1040) & (yy < 1330) & ~MAP
chin_pts = np.array([(460, 1086), (500, 1102), (540, 1114), (580, 1122), (620, 1128), (660, 1133),
                     (1100, 1103), (1140, 1080), (1180, 1053), (800, 1152), (900, 1150), (1000, 1138)], float)
chin = np.poly1d(np.polyfit(chin_pts[:, 0], chin_pts[:, 1], 3, w=np.r_[np.full(9, 4.0), np.ones(3)]))
left_shadow, right_shadow = shadow & (xx < 720), shadow & (xx > 1080)
tone_l = tuple(int(v) for v in np.median(img[left_shadow][:, :3], axis=0)) + (255,)
tone_r = tuple(int(v) for v in np.median(img[right_shadow][:, :3], axis=0)) + (255,)
nearer_left = ndimage.distance_transform_edt(~left_shadow) < ndimage.distance_transform_edt(~right_shadow)
# Where the head's shadow ends on the chest: a soft arc, in the hidden part only.
shadow_end = 1470 + 0.00035 * (xx - 560) ** 2
in_shadow = (yy >= chin(xx)) & (yy < shadow_end)
chest = np.zeros_like(img)
chest[...] = CREAM
chest[in_shadow & nearer_left] = tone_l
chest[in_shadow & ~nearer_left] = tone_r
paint = Image.fromarray(chest.astype('uint8'), 'RGBA')
d = ImageDraw.Draw(paint)


def bezier(p0, c, p1, n=60):
    t = np.linspace(0, 1, n)[:, None]
    pts = (1 - t) ** 2 * np.array(p0) + 2 * (1 - t) * t * np.array(c) + t ** 2 * np.array(p1)
    return [tuple(p) for p in pts]


# The left side of the body, from the shoulder to where it shows again under the map (x 255 at y 1830).
body_edge = bezier((372, 1060), (330, 1480), (255, 1860))
fur_edge = bezier((445, 1060), (410, 1480), (389, 1860))
d.polygon([(0, 1000)] + body_edge + [(0, 1860)], fill=(0, 0, 0, 0))   # beside the body: nothing
d.polygon(body_edge + fur_edge[::-1], fill=FUR)                       # side fur
d.line(body_edge, fill=INK, width=20, joint='curve')
# The right half's own edge along the crease, seen once the left half lifts away (under it when open).
d.polygon([(crease_x(1180) - 10, 1180), (crease_x(1180), 1180), (crease_x(1830), 1830), (crease_x(1830) - 10, 1830)], fill=INK)
paint = np.array(paint)

# Paint where the left half and the left paw were (a little wider, for their soft edges), never over the right half.
shoulder = (xx > 330) & (xx < 470) & (yy < 1200)
region = ndimage.binary_dilation(LEFT | LEFT_PAW, iterations=10) & (xx < crease_x(yy))
region &= ~ndimage.binary_dilation(RIGHT_PAW, iterations=2)
region &= ~(shoulder & ~ndimage.binary_dilation(LEFT, iterations=4))
region &= ~(shoulder & (a < 128) & ~MAP)
body = img.copy()
body[region] = paint[region]
# Outside the map, where the drawing fades into the background, only take the old edges away; draw nothing there.
body[region & ~MAP & (a < 255)] = 0

# The left half's shadow on the belly, just under its bottom edge: it fades as the half lifts.
belly_shadow = (opaque & ~MAP & (r > 205) & (r < 240) & (g > 175) & (g < 210) & (b > 130) & (b < 175)
                & ndimage.binary_dilation(LEFT, iterations=45) & (xx < crease_x(yy)) & (yy > 1700))
belly_shadow = ndimage.binary_closing(belly_shadow, iterations=2) & opaque & ~MAP
body[belly_shadow] = CREAM

# ---- The paper side: the left half mirrored over the crease, where it lands on the right half ----
ty, tx = np.mgrid[0:H, 0:W].astype(float)
sx = 2 * crease_x(ty) - tx
inb = (sx >= 0) & (sx < W) & (tx >= crease_x(ty))
BACK = np.zeros((H, W), bool)
BACK[inb] = LEFT[ty[inb].astype(int), sx[inb].astype(int)]
BACK = ndimage.binary_opening(ndimage.binary_closing(BACK, iterations=2), iterations=1)
# Outline 18 px round the outside; along the fold only 10, since the right half draws its own edge there.
fold_side = (tx < crease_x(ty)) & (tx >= crease_x(ty) - 8)
grown = BACK | (ndimage.binary_dilation(BACK, iterations=8) & fold_side)
edge = grown & ~ndimage.binary_erosion(grown, iterations=18, border_value=0)
back = np.zeros_like(img)
back[BACK] = PAPER
back[BACK & edge] = INK


# ---- Everything is scaled first, then split along the crease, so the layers meet without a seam ----
def out(arr):
    return np.array(Image.fromarray(arr.astype('uint8'), 'RGBA').crop(CROP).resize(SIZE, Image.LANCZOS))


def small(mask):
    return np.array(Image.fromarray((mask * 255).astype('uint8')).crop(CROP).resize(SIZE, Image.BILINEAR)) > 0


left_rgba = img.copy()
left_rgba[~LEFT] = 0
o, bo, f, bk = out(img), out(body), out(left_rgba), out(back)
oy, ox = np.mgrid[0:SIZE[1], 0:SIZE[0]]
crease_out = (crease_x(oy / SY + CROP[1]) - CROP[0]) * SX           # the crease's x on every output row
left_of_crease = ox < crease_out

paw_l, paw_r = (ndimage.binary_dilation(small(m), iterations=1) for m in (LEFT_PAW, RIGHT_PAW))
core = ndimage.binary_dilation(small(LEFT), iterations=1) & left_of_crease & ~paw_l
# The left half's soft outer edge lies just outside the mask: it goes with the paper. Not by the shoulder.
shoulder_out = (ox > (330 - CROP[0]) * SX) & (ox < (470 - CROP[0]) * SX) & (oy < (1200 - CROP[1]) * SY)
ring = ndimage.binary_dilation(core, iterations=4) & ~core & ~paw_l & ~paw_r & ~shoulder_out & left_of_crease
ring &= np.abs(o.astype(int) - bo.astype(int)).max(axis=2) > 3
# Three pixels past the crease, over the identical right half, so no line shows when the browser scales the layers.
overlap = ndimage.binary_dilation(core, iterations=3) & ~left_of_crease & (ox < crease_out + 3) & small(MAP) & ~paw_r
front = np.zeros_like(o)
front[core] = f[core]
# Take the drawing itself where the cut-out is thin (its very corners), near the crease, and on the soft edges.
thin = core & (f[..., 3].astype(int) < o[..., 3].astype(int) - 10)
near = core & (ox > crease_out - 5)
take = thin | ring | overlap | near
front[take] = o[take]

base = o.copy()
painted = (core | ring | paw_l) & left_of_crease
base[painted] = bo[painted]
shadow_out = small(belly_shadow) & ~paw_l
base[shadow_out] = bo[shadow_out]
shadow_layer = np.zeros_like(o)
shadow_layer[shadow_out] = o[shadow_out]
# A paw's soft edge over an empty background must not be drawn twice.
base[paw_l & (o[..., 3] < 250)] = 0
right = np.zeros_like(o)
solid_r = paw_r & (o[..., 3] >= 250)
right[solid_r] = o[solid_r]
bk[left_of_crease] = 0

# The left paw on its own, cropped: it moves.
ys_, xs_ = np.nonzero(paw_l)
box = (int(xs_.min()), int(ys_.min()), int(xs_.max()) + 1, int(ys_.max()) + 1)
paw_img = np.zeros_like(o)
paw_img[paw_l] = o[paw_l]
paw_img = paw_img[box[1]:box[3], box[0]:box[2]]

for name, arr in (('body', base), ('map-left', front), ('map-back', bk), ('map-shadow', shadow_layer),
                  ('paw-right', right), ('paw-left', paw_img)):
    Image.fromarray(arr.astype('uint8'), 'RGBA').save(OUT / f'dwoggle-{name}.webp', quality=90, method=6)
    if len(sys.argv) > 2:  # a folder for lossless copies, to check the layers against the drawing
        Image.fromarray(arr.astype('uint8'), 'RGBA').save(Path(sys.argv[2]) / f'dwoggle-{name}.png')

# ---- The left arm: two segments, solved for every frame so the paw stays on the paper's edge ----
SHOULDER = to_out(420, 1230)
WRIST = to_out(165, 1430)                       # under the paw, which hides the joint
GRIP_Y = 1430
GRIP_REACH = crease_x(GRIP_Y) - 250             # from the paw's grip on the edge to the crease
UPPER = FORE = 240 * SX
THICK = 130 * SX                                # about two-thirds of his paw, like his right arm
LINE = 20 * SX


def solve(theta):
    """Upper arm angle, forearm angle (relative to it), paw angle (relative), with the half turned theta degrees."""
    shift = GRIP_REACH * (1 - math.cos(math.radians(theta))) * SX
    wx, wy = WRIST[0] + shift, WRIST[1]
    dx, dy = wx - SHOULDER[0], wy - SHOULDER[1]
    dist = min(math.hypot(dx, dy), UPPER + FORE - 0.01)
    along = (UPPER ** 2 - FORE ** 2 + dist ** 2) / (2 * dist)
    h = math.sqrt(max(UPPER ** 2 - along ** 2, 0))
    ux, uy = dx / dist, dy / dist
    # The elbow on the outer side: tucked up behind the map when it is open, out and then down as the paw crosses.
    ex, ey = SHOULDER[0] + ux * along - uy * h, SHOULDER[1] + uy * along + ux * h
    a1 = math.degrees(math.atan2(ey - SHOULDER[1], ex - SHOULDER[0]))
    a2 = math.degrees(math.atan2(wy - ey, wx - ex)) - a1
    return a1, a2, -(a1 + a2)                   # the paw keeps the drawing's own angle


def ease(p):                                    # ease-in-out, as the fold's speed
    return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


# Once every nine seconds: 0.9 s to close, a moment closed, 0.9 s to open.
STEPS = 12
CYCLE = [(0.0, 0.0)]
CYCLE += [(30 + 10 * i / STEPS, 180 * ease(i / STEPS)) for i in range(STEPS + 1)]
CYCLE += [(58 + 10 * i / STEPS, 180 * (1 - ease(i / STEPS))) for i in range(STEPS + 1)]
CYCLE += [(100.0, 0.0)]


def unwrap(values):
    result, last = [], None
    for v in values:
        while last is not None and v - last > 180:
            v -= 360
        while last is not None and v - last < -180:
            v += 360
        result.append(v)
        last = v
    return result


angles = [solve(theta) for _, theta in CYCLE]
a1s, a2s, a3s = (unwrap([x[i] for x in angles]) for i in range(3))
skew = math.degrees(math.atan(SLANT))


def keyframes(name, values):
    rows = '\n'.join(f'  {pct:.2f}% {{\n    transform: {value};\n  }}' for pct, value in values)
    return f'@keyframes {name} {{\n{rows}\n}}\n'


face = 'skewX({:.3f}deg) rotateY({:.2f}deg) skewX({:.3f}deg)'
css = ['/* Generated by scripts/mascot-layers.py: the map closing like a book and opening again. Do not edit. */\n',
       keyframes('dwoggle-map-left', [(p, face.format(skew, t, -skew)) for p, t in CYCLE]),
       keyframes('dwoggle-map-back', [(p, face.format(skew, t - 180, -skew)) for p, t in CYCLE]),
       keyframes('dwoggle-arm-upper', [(p, f'rotate({v:.2f}deg)') for (p, _), v in zip(CYCLE, a1s)]),
       keyframes('dwoggle-arm-fore', [(p, f'rotate({v:.2f}deg)') for (p, _), v in zip(CYCLE, a2s)]),
       keyframes('dwoggle-arm-paw', [(p, f'rotate({v:.2f}deg)') for (p, _), v in zip(CYCLE, a3s)])]
(ROOT / 'src' / 'brand' / 'StandingDwoggleFold.css').write_text('\n'.join(css))

axis = to_out(crease_x(GRIP_Y), GRIP_Y)
rig = {
    'axis': [round(axis[0] / SIZE[0] * 100, 3), round(axis[1] / SIZE[1] * 100, 3)],
    'shoulder': [round(SHOULDER[0], 2), round(SHOULDER[1], 2)],
    'wrist': [round(WRIST[0], 2), round(WRIST[1], 2)],
    'upper': round(UPPER, 2),
    'fore': round(FORE, 2),
    'thick': round(THICK, 2),
    'line': round(LINE, 2),
    'rest': [round(v, 3) for v in angles[0]],
    'paw': {'x': box[0], 'y': box[1], 'width': box[2] - box[0], 'height': box[3] - box[1]},
}
(ROOT / 'src' / 'brand' / 'standingDwoggleRig.ts').write_text(
    '// Generated by scripts/mascot-layers.py: the left arm and paw, in the layers\' pixels (669 x 1000). Do not edit.\n'
    f'export const RIG = {json.dumps(rig, indent=2)} as const\n')
print('slant %.3f (skew %.2f deg); rest angles %s; paw box %s' % (SLANT, skew, [round(v, 1) for v in angles[0]], box))
