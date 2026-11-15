"""Pixel Dwoggle (Pokemon-overworld style, 32x32, front view) holding a jackhammer. Writes SVG sprite sheets."""
import sys
from PIL import Image

PAL = {
 'K': '#2a1a12', 'Y': '#fbb404', 'y': '#d68f00', 'H': '#ffe486', 'G': '#ece8dc', 'g': '#aaa69a',
 'L': '#33363b', 'l': '#9aa1aa', 'S': '#b9552f', 'B': '#8f5d3e', 'b': '#64402a', 'C': '#f8e2c0',
 'c': '#dcbd96', 'M': '#a3acb6', 'm': '#5f6872', 'W': '#e3e8ed', 'R': '#d2452f', 'r': '#8e2b1e',
 'D': '#7a4f33', 'd': '#4e3120', 'w': '#ffffff',
}
LEFT = [
 "................",  # 0
 "...........KKKKK",  # 1
 ".........KKYYYYY",  # 2
 "........KYYHHYYY",  # 3
 ".......KYHHYYYYY",  # 4
 "......KYHYYYYYYY",  # 5
 "......KYKKKKKYYY",  # 6
 ".....KYKGGGGGKKK",  # 7
 ".....KYKGLLLGKGG",  # 8
 ".....KYKGLlLGKgg",  # 9
 "....KYYKGLLLGKYY",  # 10
 "...KYYYYKGGGKYYY",  # 11
 "..KYYYYYYKKKYYYY",  # 12
 ".KYYYYYYYYYYYYYY",  # 13
 ".KKyyyyyyyyyyyyy",  # 14
 "..KKKKKKKKKKKKKK",  # 15
 "....KBBBBBBBBBBB",  # 16
 "....KBBBKKBBBBBB",  # 17
 "....KBBCKKCCCCCC",  # 18
 "....KBCCKKCCCCKK",  # 19
 "....KCCCCCCCCCCK",  # 20
 ".....KCCCKCCCCCK",  # 21
 ".....KcCCCKKKKKC",  # 22
 "....KBKKccccKKKK",  # 23
 "...KBBKBBKKKMWMM",  # 24
 "...KBBKBBBKKKKKK",  # 25
 "...KBBBKKKKKRRRR",  # 26
 "...KBBBBBBKRrRRR",  # 27
 "....KBBBBBKRrRRR",  # 28
 "....KbbbbbKKKKKK",  # 29
 "...KDDKKDDK...KM",  # 30
 "...KKKK.KKK...Km",  # 31
]
def mirror(row):
    flip = row[::-1]
    return row + flip
BASE = [mirror(r) for r in LEFT]
# Asymmetry: helmet strap (right side), right lens shine on the left of the lens.
def put(g, x, y, ch):
    g[y] = g[y][:x] + ch + g[y][x + 1:]

def frame(kind, n):
    g = list(BASE)
    put(g, 25, 9, 'S'); put(g, 25, 10, 'S')
    put(g, 20, 9, 'l'); put(g, 21, 9, 'L')
    rows = g
    if kind == 'run':
        # carrying the drill, bouncing, feet in turn
        feet = ["...KDDK..KKKK..KK..KKKK..KDDK...", "...KKKK..KDDK..KK..KDDK..KKKK..."]
        rows = rows[:30] + ["....KDDKK......KK......KKDDK....", feet[n]]
        if n == 1:
            rows = ["." * 32] + rows[:-1]
    else:
        # drilling: the body shakes down a pixel on the second frame; the bit hammers into the ground
        if n == 1:
            rows = ["." * 32] + rows[:-1]
            rows[31] = rows[31][:13] + "dK.KMMK.Kd" [:6] + rows[31][19:]
    return rows

def svg(frames, path):
    W = 32 * len(frames)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 32" shape-rendering="crispEdges">']
    for i, rows in enumerate(frames):
        for y, row in enumerate(rows):
            x = 0
            while x < 32:
                ch = row[x]
                if ch == '.':
                    x += 1; continue
                run = 1
                while x + run < 32 and row[x + run] == ch:
                    run += 1
                out.append(f'<rect x="{i*32+x}" y="{y}" width="{run}" height="1" fill="{PAL[ch]}"/>')
                x += run
    out.append('</svg>')
    open(path, 'w').write('\n'.join(out))

def png(frames, path, scale=10):
    im = Image.new('RGBA', (32 * len(frames), 32), (0, 0, 0, 0))
    for i, rows in enumerate(frames):
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch != '.':
                    h = PAL[ch]
                    im.putpixel((i * 32 + x, y), tuple(int(h[k:k + 2], 16) for k in (1, 3, 5)) + (255,))
    bg = Image.new('RGBA', im.size, (120, 160, 120, 255)); bg.alpha_composite(im)
    bg.resize((im.width * scale, im.height * scale), Image.NEAREST).save(path)

for r in LEFT: assert len(r) == 16, r
run = [frame('run', 0), frame('run', 1)]
drill = [frame('drill', 0), frame('drill', 1)]
for f in run + drill:
    for r in f: assert len(r) == 32, (len(r), r)
out = sys.argv[1] if len(sys.argv) > 1 else '.'
svg(run, f'{out}/dwoggle-run.svg'); svg(drill, f'{out}/dwoggle-drill.svg')
png(run + drill, 'preview.png')

# ---- The mound he pushes up while he tunnels to the spot: 20x10, two frames (earth shifting) ----
MOUND = [
 [
  "....................",
  "........KKKK........",
  ".....KKKDDDDKK......",
  "....KDDDDcDDDDK.....",
  "...KDDcDDDDDDDDKK...",
  "..KDDDDDDDDcDDDDDK..",
  ".KDdDDDDDDDDDDdDDDK.",
  "KDddDDdDDDDdDDddDDDK",
  "KKKKKKKKKKKKKKKKKKKK",
  "....................",
 ],
 [
  "..........K.........",
  ".......KKKKKK.......",
  "....KKKDDDDDDKK..K..",
  "...KDDDDDDcDDDDK....",
  "..KDDDcDDDDDDDDDK...",
  ".KDDDDDDDDDDDcDDDKK.",
  ".KDdDDDDDcDDDDdDDDK.",
  "KDddDDdDDDDdDDDdDDDK",
  "KKKKKKKKKKKKKKKKKKKK",
  "....................",
 ],
]
def svg_grid(frames, w, h, path):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w*len(frames)} {h}" shape-rendering="crispEdges">']
    for i, rows in enumerate(frames):
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch != '.':
                    out.append(f'<rect x="{i*w+x}" y="{y}" width="1" height="1" fill="{PAL[ch]}"/>')
    out.append('</svg>')
    open(path, 'w').write('\n'.join(out))
for f in MOUND:
    for r in f: assert len(r) == 20, r
svg_grid(MOUND, 20, 10, f'{out}/dwoggle-mound.svg')
