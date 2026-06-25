#!/usr/bin/env python3
"""Crop the 詳解 CONTENT region (inner table grids + figures, excluding the outer
question/answer card) for each tail question → <qid>__full.webp. Pairs with the
extracted figures (__1/__2): 都要 — every question gets its table AND its figure."""
import json, pathlib, fitz
HERE=pathlib.Path(__file__).resolve().parent
SRC=pathlib.Path.home()/'Desktop/國考/一階國考/陽明國考考古'
seg=json.loads((HERE/'_work/segments-tail.json').read_text())
OUT=HERE/'auto-crop-tail'; OUT.mkdir(exist_ok=True)
for f in OUT.glob('*__full.webp'): f.unlink()
ZOOM=3.0
def is_outer_card(t,H,W):
    b=fitz.Rect(t.bbox)
    return b.height/H>0.62 and t.col_count<=3
rows=[]
for qid,v in seg.items():
    best=None
    for pno in v['pages']:
        doc=fitz.open(SRC/v['pdf']); pg=doc[pno]; W,H=pg.rect.width,pg.rect.height
        regions=[]
        for t in pg.find_tables().tables:
            if not is_outer_card(t,H,W):
                regions.append(fitz.Rect(t.bbox))
        for img in pg.get_images(full=True):
            for r in pg.get_image_rects(img[0]):
                if 0.04<(r.width*r.height)/(W*H)<0.92: regions.append(r)
        if regions:
            u=regions[0]
            for r in regions[1:]: u=u|r
            cov=(u.width*u.height)/(W*H)
            if best is None or cov>best[0]: best=(cov,pno,u,doc,W,H)
            else: doc.close()
        else: doc.close()
    if best is None:
        rows.append((qid,'no-content-region')); continue
    cov,pno,u,doc,W,H=best
    pad=10
    clip=fitz.Rect(max(0,u.x0-pad),max(0,u.y0-pad),min(W,u.x1+pad),min(H,u.y1+pad))
    pix=doc[pno].get_pixmap(matrix=fitz.Matrix(ZOOM,ZOOM),clip=clip)
    pix.pil_save(str(OUT/f'{qid}__full.webp'),format='WEBP',quality=82)
    rows.append((qid,f'p{pno} cov{cov:.0%}')); doc.close()
print('content-region crops:',sum(1 for _,s in rows if not s.startswith('no')),'/29')
for qid,s in rows:
    if s.startswith('no'): print('  MISS:',qid,s)
