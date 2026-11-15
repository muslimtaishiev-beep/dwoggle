"""Dwoggle standing with his map, wearing the logo's clean head, and where his lids and mouth go on it.

Usage: python3 scripts/mascot-standing.py
Needs Python 3 with pillow, numpy and scipy. Reads scripts/art/dwoggle-standing-original.webp (the designer's
standing Dwoggle, 669 x 1000) and scripts/art/dwoggle-logo-clean.jpg (the logo's clean head). Writes
public/brand/dwoggle-standing.webp and src/brand/standingDwoggleRig.ts (generated: do not edit by hand).

The head is set on his own eyes, a little larger so it covers his old head, and a little lower so its helmet fits
inside the picture. His lids (he blinks) and his open mouth (he talks) are drawn over the picture by
src/brand/StandingDwoggle.tsx, at the places this script measures on the new head.
"""
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'scripts' / 'art'
OUT = ROOT / 'public' / 'brand' / 'dwoggle-standing.webp'
RIG = ROOT / 'src' / 'brand' / 'standingDwoggleRig.ts'

LOGO_EYES = [(345.5, 652.5), (780.0, 661.0)]   # in the logo drawing's pixels
OLD_EYES = [(226.0, 283.5), (411.5, 293.5)]    # his own eyes in the standing picture
HEAD_SIZE = 1.15                               # times the size that puts the eyes exactly on his
DROP = 30                                      # pixels lower than his own eyes, so the helmet fits in the picture

# His open mouth as drawn for the old head, hanging from the middle of its smile (OLD_SMILE), and his tongue.
OLD_MOUTH = [(280.7, 380.6), (296.7, 376.7), (305.4, 367.2), (316.2, 381.9), (335.6, 384.5), (337.8, 413.5),
             (309.7, 417.8), (282.4, 413.5), (280.7, 380.6)]
OLD_SMILE = (305.4, 367.2)
OLD_TONGUE = (309.0, 413.0, 18.0, 10.0)
OLD_ORIGIN = (308.0, 373.0)

spec = importlib.util.spec_from_file_location('logo_clean', Path(__file__).with_name('logo-clean.py'))
logo_clean = importlib.util.module_from_spec(spec)
spec.loader.exec_module(logo_clean)

logo = logo_clean.cut(str(ART / 'dwoggle-logo-clean.jpg'))
art = Image.open(ART / 'dwoggle-standing-original.webp').convert('RGBA')
W, H = art.size

(ax0, ay0), (ax1, ay1) = LOGO_EYES
(bx0, by0), (bx1, by1) = OLD_EYES
old_eye_gap = math.hypot(bx1 - bx0, by1 - by0)
scale = old_eye_gap / math.hypot(ax1 - ax0, ay1 - ay0) * HEAD_SIZE
turn = math.atan2(by1 - by0, bx1 - bx0) - math.atan2(ay1 - ay0, ax1 - ax0)
mid_a = ((ax0 + ax1) / 2, (ay0 + ay1) / 2)
mid_b = ((bx0 + bx1) / 2, (by0 + by1) / 2 + DROP)


def to_art(x, y):
    """A point of the logo drawing, where it lands on him."""
    dx, dy = (x - mid_a[0]) * scale, (y - mid_a[1]) * scale
    return (mid_b[0] + dx * math.cos(turn) - dy * math.sin(turn), mid_b[1] + dx * math.sin(turn) + dy * math.cos(turn))


c, s_ = math.cos(-turn) / scale, math.sin(-turn) / scale
inverse = (c, -s_, mid_a[0] - (c * mid_b[0] - s_ * mid_b[1]), s_, c, mid_a[1] - (s_ * mid_b[0] + c * mid_b[1]))
head = logo.transform((W, H), Image.AFFINE, inverse, resample=Image.BICUBIC)
assert head.getbbox()[1] > 0, 'the helmet does not fit in the picture: raise DROP'

picture = art.copy()
picture.alpha_composite(head)
picture.save(OUT, quality=90, method=6)

# ---- Where the lids and the mouth go on the new head ----
src = np.asarray(logo)
dark = src[..., :3].max(axis=2) < 60
blobs = ndimage.label(dark)[0]


def blob_box(x, y):
    ys, xs = np.nonzero(blobs == blobs[int(y), int(x)])
    return ys.min(), ys.max(), xs.min(), xs.max()


def eye(x, y):
    top, bottom, left, right = blob_box(x, y)
    cx, cy = to_art((left + right) / 2, (top + bottom) / 2)
    return {'cx': round(cx, 1), 'cy': round(cy, 1),
            'rx': round((right - left) / 2 * scale + 2, 1), 'ry': round((bottom - top) / 2 * scale + 2, 1)}


def cheek_line(x, y):
    """How far down the eye the brown fur turns to the pale cheek beside it."""
    top, bottom, left, right = blob_box(x, y)
    turns = []
    for column in (left - 20, right + 20):
        pale = np.nonzero(src[top - 30:bottom + 30, column, 0] > 205)[0]
        if len(pale):
            turns.append(top - 30 + pale[0])
    return (np.mean(turns) - top) / (bottom - top) if turns else 1.0


# The middle of the smile: the nose, the line under it and the smile are one dark shape. Straight down the
# middle from the top of the nose, the dark runs through the nose and the line to where the smile's halves meet.
nose_top, _, _, _ = blob_box(553, 700)
top_rows = np.nonzero(blobs[nose_top:nose_top + 40] == blobs[700, 553])
nose_x = int(round(np.mean(top_rows[1])))
y = nose_top
while y < src.shape[0] - 1 and dark[y + 1, nose_x]:
    y += 1
smile = to_art(nose_x, y - 6)       # inside the line, where it meets the halves
grow = scale / (old_eye_gap / math.hypot(ax1 - ax0, ay1 - ay0))   # = HEAD_SIZE: the mouth grows with the head


def moved(point):
    return (smile[0] + (point[0] - OLD_SMILE[0]) * grow, smile[1] + (point[1] - OLD_SMILE[1]) * grow)


mouth = [moved(p) for p in OLD_MOUTH]
path = (f'M{mouth[0][0]:.1f} {mouth[0][1]:.1f} Q{mouth[1][0]:.1f} {mouth[1][1]:.1f} {mouth[2][0]:.1f} {mouth[2][1]:.1f} '
        f'Q{mouth[3][0]:.1f} {mouth[3][1]:.1f} {mouth[4][0]:.1f} {mouth[4][1]:.1f} '
        f'Q{mouth[5][0]:.1f} {mouth[5][1]:.1f} {mouth[6][0]:.1f} {mouth[6][1]:.1f} '
        f'Q{mouth[7][0]:.1f} {mouth[7][1]:.1f} {mouth[8][0]:.1f} {mouth[8][1]:.1f} Z')
tongue_x, tongue_y = moved(OLD_TONGUE[:2])
origin = moved(OLD_ORIGIN)

rig = {
    'size': [W, H],
    'eyes': [eye(*LOGO_EYES[0]), eye(*LOGO_EYES[1])],
    'cheekLine': round(float(np.clip(np.mean([cheek_line(*e) for e in LOGO_EYES]), 0.2, 0.95)), 2),
    'mouth': path,
    'tongue': {'cx': round(tongue_x, 1), 'cy': round(tongue_y, 1),
               'rx': round(OLD_TONGUE[2] * grow, 1), 'ry': round(OLD_TONGUE[3] * grow, 1)},
    'mouthOrigin': [round(origin[0], 1), round(origin[1], 1)],
}
RIG.write_text(
    "// Generated by scripts/mascot-standing.py: where the standing Dwoggle's lids and mouth go. Do not edit.\n"
    f'export const STANDING_RIG = {json.dumps(rig, indent=2)} as const\n')
print('written', OUT.name, 'and', RIG.name, json.dumps(rig))
