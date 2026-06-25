#!/usr/bin/env python3
"""Render the located 詳解 page(s) per question at high res, captioned, for the
owner to manually screenshot the precise table. One image per (qid, page).

Output: for-owner/<NN>_<qid>__pP[ _partJ-of-K].png   (zoom 2.2, top caption banner)
        for-owner/_MANIFEST.md
The owner Cmd-Shift-4 crops each table and hands the crops back; we then save
each as <qid>.webp and wire into content.
"""
from __future__ import annotations
import json, pathlib
import fitz
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
WORK = HERE / '_work'
OUT = HERE / 'for-owner'
SRC = pathlib.Path.home() / 'Desktop/國考/一階國考/陽明國考考古'
ZOOM = 2.2
BANNER_H = 64

FONT_CANDIDATES = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
]


def load_font(size: int):
    for f in FONT_CANDIDATES:
        if pathlib.Path(f).exists():
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                continue
    return ImageFont.load_default()


def pix_to_pil(pix):
    return Image.frombytes('RGB', (pix.width, pix.height), pix.samples)


def banner(img: Image.Image, lines: list[str]) -> Image.Image:
    w = img.width
    canvas = Image.new('RGB', (w, img.height + BANNER_H), 'white')
    canvas.paste(img, (0, BANNER_H))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, 0, w, BANNER_H], fill=(24, 32, 48))
    f1 = load_font(22)
    f2 = load_font(17)
    d.text((10, 6), lines[0], fill=(255, 255, 255), font=f1)
    d.text((10, 36), lines[1], fill=(180, 220, 255), font=f2)
    return canvas


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob('*.png'):
        old.unlink()
    segments = json.loads((WORK / 'segments.json').read_text())
    targets = json.loads((WORK / 'targets.json').read_text())
    briefing = json.loads((WORK / 'briefing.json').read_text())

    opened: dict[str, fitz.Document] = {}
    manifest = ['# 人工截圖清單 — 27 題 Bucket C 詳解表格\n',
                '截圖後請存成 `<qid>.png`（或保留檔名中的編號），放到一個資料夾交回。',
                '跨頁的表格：分別截每頁的表格部分，我會直接上下接起來。\n']
    for nn, (qid, segs) in enumerate(segments.items(), 1):
        pdf = targets[qid]['pdf']
        if pdf not in opened:
            opened[pdf] = fitz.open(SRC / pdf)
        doc = opened[pdf]
        b = briefing[qid]
        desc = (b.get('table_desc') or '').strip().replace('\n', ' ')[:70]
        k = len(segs)
        manifest.append(f'## {nn:02d}. `{qid}` — 題{b["qNumber"]} {b["subject"]}'
                        + (f'（跨 {k} 頁）' if k > 1 else ''))
        manifest.append(f'- 要截的表：{desc}')
        for j, seg in enumerate(segs, 1):
            page = doc[seg['page']]
            img = pix_to_pil(page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM)))
            part = f'（第 {j}/{k} 頁）' if k > 1 else ''
            l1 = f'[{nn:02d}/27] {qid}'
            l2 = f'題{b["qNumber"]} {b["subject"]}　截表:{desc[:34]} {part}'
            suffix = f'__p{seg["page"]}' + (f'_part{j}of{k}' if k > 1 else '')
            name = f'{nn:02d}_{qid}{suffix}.png'
            banner(img, [l1, l2]).save(OUT / name)
            manifest.append(f'  - 檔案：`{name}`（PDF p{seg["page"]}）')
        manifest.append('')
    (OUT / '_MANIFEST.md').write_text('\n'.join(manifest))
    pngs = sorted(OUT.glob('*.png'))
    print(f'wrote {len(pngs)} page images for {len(segments)} questions -> {OUT}')


if __name__ == '__main__':
    main()
