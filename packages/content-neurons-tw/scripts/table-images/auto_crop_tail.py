#!/usr/bin/env python3
"""Auto-crop the 29 image-tail 詳解 figures. Anchor on the EMBEDDED-IMAGE rect
(precise figure, render-cropped upright — handles rotation + composite labels).
Questions with no sizable embedded image are flagged (text-table OR flattened
prose) for separate classification. Output: auto-crop-tail/<qid>__N.webp."""
import json, pathlib
import fitz
HERE = pathlib.Path(__file__).resolve().parent
SRC = pathlib.Path.home() / 'Desktop/國考/一階國考/陽明國考考古'
seg = json.loads((HERE / '_work/segments-tail.json').read_text())
OUT = HERE / 'auto-crop-tail'; OUT.mkdir(exist_ok=True)
for f in OUT.glob('*.webp'): f.unlink()
ZOOM = 3.2
rows = []
for qid, v in seg.items():
    doc = fitz.open(SRC / v['pdf'])
    figs = []  # (area, page, rect)
    for pno in v['pages']:
        pg = doc[pno]; W, H = pg.rect.width, pg.rect.height
        seen = set()
        for img in pg.get_images(full=True):
            xref = img[0]
            if xref in seen: continue
            seen.add(xref)
            for r in pg.get_image_rects(xref):
                a = (r.width * r.height) / (W * H)
                if 0.06 < a < 0.92:
                    figs.append((a, pno, r))
    figs.sort(key=lambda x: x[0], reverse=True)
    if not figs:
        rows.append((qid, v['pdf'], None, 0, 'NO-IMAGE → text-table or prose (classify)'))
        doc.close(); continue
    # crop each distinct large figure (dedup overlapping)
    kept = []
    for a, pno, r in figs:
        if any(pno == kp and (r & kr).get_area() > 0.6 * min(r.get_area(), kr.get_area()) for kp, kr in kept):
            continue
        kept.append((pno, r))
        if len(kept) >= 3: break
    n = 0
    for pno, r in kept:
        pg = doc[pno]; W, H = pg.rect.width, pg.rect.height
        pad = 8
        clip = fitz.Rect(max(0, r.x0-pad), max(0, r.y0-pad), min(W, r.x1+pad), min(H, r.y1+pad))
        n += 1
        pix = pg.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), clip=clip)
        pix.pil_save(str(OUT / f'{qid}__{n}.webp'), format='WEBP', quality=82)
    rows.append((qid, v['pdf'], kept[0][0], n, f'{n} figure(s) extracted'))
    doc.close()
noimg = [r for r in rows if r[2] is None]
print(f'figure-extracted: {len([r for r in rows if r[2] is not None])}/29 | no-image (classify): {len(noimg)}')
for r in noimg: print('  NO-IMAGE:', r[0])
