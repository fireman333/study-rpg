#!/usr/bin/env python3
"""Crop the located 詳解 table regions to faithful WebP images + debug previews.

Input:  _work/segments.json   (qid -> [{page, top, bot}, ...]; fractions of page height)
        _work/targets.json     (qid -> {pdf, ...})
Output: out/<qid>.webp                 the shipped crop (vertically stitched if multi-page)
        preview/<qid>.png              source page(s) with the cropped band outlined (owner review)
        table-image-overrides.json     provenance: qid -> {pdf, segments:[{page,bbox,dpi}], method}

The image is a rasterized crop of the original PDF — faithful by construction, no
transcription. Full page WIDTH is always kept (never risk clipping a wide table);
only the vertical band is cropped, padded slightly. Run from repo root.
"""
from __future__ import annotations
import json, pathlib
import fitz
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
WORK = HERE / '_work'
OUT = HERE / 'out'
PREVIEW = HERE / 'preview'
SRC = pathlib.Path.home() / 'Desktop/國考/一階國考/陽明國考考古'

CROP_ZOOM = 2.15        # ~155 dpi; legible CJK at small size (design D2)
PREVIEW_ZOOM = 1.2      # smaller, just for eyeballing framing
VPAD_FRAC = 0.012       # vertical padding added to each band edge
WEBP_QUALITY = 82


def pix_to_pil(pix: fitz.Pixmap) -> Image.Image:
    return Image.frombytes('RGB', (pix.width, pix.height), pix.samples)


def crop_segment(doc, seg: dict, zoom: float) -> tuple[Image.Image, fitz.Rect]:
    page = doc[seg['page']]
    h = page.rect.height
    top = max(0.0, seg['top'] - VPAD_FRAC) * h
    bot = min(1.0, seg['bot'] + VPAD_FRAC) * h
    clip = fitz.Rect(page.rect.x0, top, page.rect.x1, bot)
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip)
    return pix_to_pil(pix), clip


def stitch_vertical(imgs: list[Image.Image]) -> Image.Image:
    if len(imgs) == 1:
        return imgs[0]
    w = max(i.width for i in imgs)
    total_h = sum(i.height for i in imgs)
    canvas = Image.new('RGB', (w, total_h), 'white')
    y = 0
    for im in imgs:
        canvas.paste(im, (0, y))
        y += im.height
    return canvas


def preview_page(doc, segs_on_page: list[dict]) -> Image.Image:
    """Full page rendered with each cropped band outlined in red."""
    page = doc[segs_on_page[0]['page']]
    pix = page.get_pixmap(matrix=fitz.Matrix(PREVIEW_ZOOM, PREVIEW_ZOOM))
    img = pix_to_pil(pix).convert('RGB')
    draw = ImageDraw.Draw(img)
    H = img.height
    for seg in segs_on_page:
        y0 = max(0.0, seg['top'] - VPAD_FRAC) * H
        y1 = min(1.0, seg['bot'] + VPAD_FRAC) * H
        draw.rectangle([2, y0, img.width - 3, y1], outline=(220, 20, 60), width=4)
    return img


def main() -> None:
    OUT.mkdir(exist_ok=True)
    PREVIEW.mkdir(exist_ok=True)
    segments = json.loads((WORK / 'segments.json').read_text())
    targets = json.loads((WORK / 'targets.json').read_text())

    opened: dict[str, fitz.Document] = {}
    provenance: dict[str, dict] = {}
    sizes: list[tuple[str, int]] = []

    for qid, segs in segments.items():
        pdf = targets[qid]['pdf']
        if pdf not in opened:
            opened[pdf] = fitz.open(SRC / pdf)
        doc = opened[pdf]

        # crop + stitch deliverable
        imgs, prov_segs = [], []
        for seg in segs:
            im, clip = crop_segment(doc, seg, CROP_ZOOM)
            imgs.append(im)
            prov_segs.append({'page': seg['page'], 'bbox': [round(c, 1) for c in clip],
                              'top': seg['top'], 'bot': seg['bot']})
        webp = stitch_vertical(imgs)
        out_path = OUT / f'{qid}.webp'
        webp.save(out_path, 'WEBP', quality=WEBP_QUALITY, method=6)
        sizes.append((qid, out_path.stat().st_size))

        # debug preview: one outlined page image per distinct page, stacked
        by_page: dict[int, list[dict]] = {}
        for seg in segs:
            by_page.setdefault(seg['page'], []).append(seg)
        page_imgs = [preview_page(doc, by_page[p]) for p in sorted(by_page)]
        stitch_vertical(page_imgs).save(PREVIEW / f'{qid}.png')

        provenance[qid] = {
            'pdf': pdf, 'qNumber': targets[qid]['qNumber'],
            'segments': prov_segs, 'dpi': round(72 * CROP_ZOOM),
            'method': 'vision-bbox-band' + ('+stitched' if len(segs) > 1 else ''),
        }

    (HERE / 'table-image-overrides.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2))

    sizes.sort(key=lambda x: -x[1])
    total = sum(s for _, s in sizes)
    print(f"cropped {len(segments)} webp; total {total/1024:.0f} KB")
    print(f"largest: {sizes[0][0]} {sizes[0][1]/1024:.0f} KB | smallest: {sizes[-1][0]} {sizes[-1][1]/1024:.0f} KB")
    over = [(q, s) for q, s in sizes if s > 200 * 1024]
    if over:
        print("OVER 200KB:", [(q, f'{s/1024:.0f}KB') for q, s in over])


if __name__ == '__main__':
    main()
