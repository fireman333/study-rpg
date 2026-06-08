#!/usr/bin/env python3
"""Parameterized PIL「變形」工法 — produce correct + evolve animation sheets for a
neuron variant (per `generate-neurons-legendary-showpiece-sheets`).

Recovered + generalized from the slice's hero script (render_hero_frames.py) and the
per-family batch (render_variant_frames.py, originally in scratch). Per-family glow
colour auto-sampled from the sprite's highlights so a single gold halo isn't smeared
on every family. NO idle sheet (global CSS .neuron-sprite--alive covers idle).

This version (slot-5 傳奇 apex showpieces):
  - --showpiece  applies modest extra intensity (glow/flash/ray/ring) so legendary
                 reactions read grander than the slot-3 featured recipe.
  - assembles the per-state frames into the final transparent horizontal sheet
    (no padding, `<family>-<slot>-<state>.png`) that the app's glob registers — not
    just the QA montage. Frame counts match SpriteSheetPlayer STATE_META
    (correct 9 / evolve 11).

Run: render_legendary_showpiece_frames.py --family 生物化學 --slot 5 --showpiece \
       --size 160 --sheets-out packages/theme-pixel-neurons/sprites/animated
"""
import argparse
import math
import os

import numpy as np
from PIL import Image, ImageEnhance, ImageDraw, ImageFilter

REPO = "/Users/kangweiling/coding-scratch/study-rpg-neurons"
VARIANTS = f"{REPO}/packages/theme-pixel-neurons/sprites/variants"
W = H = 384
WHITE = (255, 255, 255)

ap = argparse.ArgumentParser()
ap.add_argument("--family", required=True)
ap.add_argument("--slot", type=int, default=5)
ap.add_argument("--size", type=int, default=160, help="downscaled frame size (native render 384)")
ap.add_argument("--glow", default="", help="hex #RRGGBB; empty = auto-sample from sprite")
ap.add_argument("--anchor", default="bottom", choices=["bottom", "center"])
ap.add_argument("--showpiece", action="store_true", help="legendary intensity boost (傳奇 > featured)")
ap.add_argument("--qa-out", default="/Users/kangweiling/.claude/scratch/neuron-legendary-showpiece-2026-06-08",
                help="dir for individual frames + QA montage")
ap.add_argument("--sheets-out", default="", help="dir to write assembled transparent sheet (empty = skip)")
args = ap.parse_args()

os.makedirs(args.qa_out, exist_ok=True)
if args.sheets_out:
    os.makedirs(args.sheets_out, exist_ok=True)

# Legendary showpiece intensity multipliers (modest — keep the neuron readable, not washed out).
SP_GLOW = 1.18 if args.showpiece else 1.0
SP_FLASH = 1.12 if args.showpiece else 1.0
SP_RAY = 1.25 if args.showpiece else 1.0
SP_RING = 1.20 if args.showpiece else 1.0

SRC = f"{VARIANTS}/{args.family}-{args.slot}.png"
src = Image.open(SRC).convert("RGBA")
bbox = src.getbbox()
L, T, R, B = bbox
content = src.crop(bbox)
CW, CH = content.size
CX = L + CW / 2
CYm = T + CH / 2
BOTTOM = B if args.anchor == "bottom" else CYm + CH / 2


def sample_glow():
    arr = np.array(content)
    op = arr[..., 3] > 40
    rgb = arr[..., :3][op].astype(float)
    if len(rgb) == 0:
        return (255, 205, 80)
    lum = rgb.mean(axis=1)
    bright = rgb[lum >= np.percentile(lum, 70)]
    base = bright.mean(axis=0) if len(bright) else rgb.mean(axis=0)
    glow = np.clip(base * 1.12 + 45, 0, 255)
    return tuple(int(x) for x in glow)


GLOW = tuple(int(args.glow[i:i + 2], 16) for i in (1, 3, 5)) if args.glow else sample_glow()


def brighten(img, f):
    if f == 1.0:
        return img
    r, g, b, a = img.split()
    rgb = ImageEnhance.Brightness(Image.merge("RGB", (r, g, b))).enhance(f)
    return Image.merge("RGBA", (*rgb.split(), a))


def make_glow(spr, color, radius, strength):
    a = spr.split()[3]
    g = Image.new("RGBA", spr.size, color + (0,)); g.putalpha(a)
    g = g.filter(ImageFilter.GaussianBlur(radius))
    g.putalpha(g.split()[3].point(lambda v: int(v * strength)))
    return g


def make_flash(spr, s):
    a = spr.split()[3].point(lambda v: min(255, int(v * s)))
    f = Image.new("RGBA", spr.size, WHITE + (0,)); f.putalpha(a)
    return f


def compose(sx=1.0, sy=1.0, dy=0.0, brightness=1.0, glow=0.0, glow_radius=14, flash=0.0, bg=None):
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if bg is not None:
        bg(ImageDraw.Draw(canvas))
    sw, sh = max(1, int(round(CW * sx))), max(1, int(round(CH * sy)))
    spr = brighten(content.resize((sw, sh), Image.NEAREST), brightness)
    px = int(round(CX - sw / 2))
    py = int(round(BOTTOM - sh + dy))
    if glow > 0:
        g = make_glow(spr, GLOW, glow_radius, min(1.0, glow * SP_GLOW))
        gg = Image.new("RGBA", (sw + 2 * glow_radius, sh + 2 * glow_radius), (0, 0, 0, 0))
        gg.alpha_composite(g, (glow_radius, glow_radius))
        canvas.alpha_composite(gg, (px - glow_radius, py - glow_radius))
    canvas.alpha_composite(spr, (px, py))
    if flash > 0:
        canvas.alpha_composite(make_flash(spr, min(1.0, flash * SP_FLASH)), (px, py))
    return canvas


def evolve_bg(progress, ray_len, ring_r, ring_fade):
    ray_len = ray_len * SP_RAY
    ring_r = ring_r * SP_RING

    def draw(d):
        cx, cy = CX, CYm
        if ray_len > 0:
            n = 18
            for k in range(n):
                ang = (2 * math.pi / n) * k + 0.1
                rl = ray_len * (1.0 if k % 2 == 0 else 0.62)
                x2, y2 = cx + math.cos(ang) * rl, cy + math.sin(ang) * rl
                x1, y1 = cx + math.cos(ang) * (rl * 0.32), cy + math.sin(ang) * (rl * 0.32)
                d.line([(x1, y1), (x2, y2)], fill=GLOW + (int(235 * progress),), width=5)
                xm, ym = cx + math.cos(ang) * (rl * 0.55), cy + math.sin(ang) * (rl * 0.55)
                d.line([(x1, y1), (xm, ym)], fill=WHITE + (int(205 * progress),), width=2)
                d.ellipse([x2 - 3, y2 - 3, x2 + 3, y2 + 3], fill=GLOW + (int(220 * progress),))
        if ring_r > 0 and ring_fade > 0:
            a = int(235 * ring_fade)
            for off, col, w in ((0, GLOW, 4), (4, WHITE, 3), (8, GLOW, 3)):
                r = ring_r - off
                if r > 2:
                    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col + (a,), width=w)
            r2 = ring_r * 0.6
            if r2 > 2:
                d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], outline=GLOW + (int(a * 0.55),), width=2)
    return draw


# (sx, sy, dy, glow, glowR, flash, bright) — correct (9 frames, bounce 彈低 + 白閃 pop)
CORRECT = [
    (1.04, 0.95, 6, 0.20, 16, 0.0, 1.0), (1.02, 0.98, 3, 0.28, 16, 0.0, 1.0),
    (0.97, 1.06, -9, 0.55, 22, 0.18, 1.10), (0.96, 1.08, -15, 0.85, 26, 0.48, 1.22),
    (0.98, 1.04, -8, 0.60, 22, 0.20, 1.10), (1.04, 0.96, 3, 0.32, 18, 0.0, 1.0),
    (0.99, 1.02, -2, 0.24, 16, 0.0, 1.0), (1.0, 1.0, 0, 0.18, 16, 0.0, 1.0),
    (1.0, 1.0, 0, 0.16, 16, 0.0, 1.0),
]

# (sx, sy, dy, glow, glowR, flash, bright, rayLen, ringR, ringFade) — evolve (11, 更炸)
EVOLVE = [
    (1.00, 1.00, 0, 0.28, 18, 0.00, 1.03, 0, 0, 0.0), (1.02, 1.03, -2, 0.50, 22, 0.08, 1.08, 40, 0, 0.0),
    (1.03, 1.04, -4, 0.85, 26, 0.20, 1.15, 90, 40, 0.6), (1.08, 1.09, -7, 1.00, 34, 0.58, 1.32, 150, 100, 1.0),
    (1.18, 1.18, -12, 1.00, 40, 0.90, 1.42, 240, 160, 1.0), (1.20, 1.20, -13, 0.98, 40, 0.58, 1.32, 300, 215, 0.9),
    (1.15, 1.15, -10, 0.74, 34, 0.26, 1.20, 230, 270, 0.55), (1.11, 1.11, -6, 0.56, 28, 0.10, 1.14, 120, 320, 0.25),
    (1.08, 1.08, -3, 0.48, 24, 0.00, 1.11, 0, 0, 0.0), (1.06, 1.06, -2, 0.44, 24, 0.00, 1.09, 0, 0, 0.0),
    (1.06, 1.06, -2, 0.42, 24, 0.00, 1.08, 0, 0, 0.0),
]

S = args.size
prefix = f"{args.family}-{args.slot}"


def emit(state, frames):
    imgs = []
    for i, im in enumerate(frames, 1):
        small = im.resize((S, S), Image.BOX)  # downscale 384 → size (clean for soft glow)
        small.save(f"{args.qa_out}/{prefix}-{state}_{i:02d}.png")
        imgs.append(small)
    # QA montage on dark bg
    pad = 5
    mont = Image.new("RGBA", (len(imgs) * S + pad * (len(imgs) + 1), S + pad * 2), (24, 24, 34, 255))
    for idx, im in enumerate(imgs):
        mont.alpha_composite(im, (pad + idx * (S + pad), pad))
    mont.convert("RGB").save(f"{args.qa_out}/{prefix}-{state}_montage.png")
    # Final transparent horizontal sheet (no padding) — what the app glob registers.
    if args.sheets_out:
        sheet = Image.new("RGBA", (len(imgs) * S, S), (0, 0, 0, 0))
        for idx, im in enumerate(imgs):
            sheet.alpha_composite(im, (idx * S, 0))
        sheet.save(f"{args.sheets_out}/{prefix}-{state}.png")
    return imgs


emit("correct", [compose(sx=p[0], sy=p[1], dy=p[2], glow=p[3], glow_radius=p[4], flash=p[5], brightness=p[6]) for p in CORRECT])
ev = []
for p in EVOLVE:
    prog = min(1.0, p[7] / 150) if p[7] else (p[9] if p[9] else 0)
    ev.append(compose(sx=p[0], sy=p[1], dy=p[2], glow=p[3], glow_radius=p[4], flash=p[5], brightness=p[6],
                      bg=evolve_bg(max(prog, p[9]), p[7], p[8], p[9])))
emit("evolve", ev)
sp = "showpiece" if args.showpiece else "featured"
print(f"{prefix}: glow={GLOW} size={S} ({sp}); correct 9 + evolve 11 frames"
      + (f" + sheets → {args.sheets_out}" if args.sheets_out else " (QA only)"))
