#!/usr/bin/env python3
"""Build the owner-crop package for the 29 image-tail tables (the destroyed-OCR
severe-quarantine 詳解 NOT covered by the shipped 27). Mirrors for_owner.py but
self-contained for the tail. Output: for-owner-tail/<qid>__pP.png (banner) +
for-owner-tail/_INDEX.md. Owner crops each 詳解 table → from-owner-tail/<qid>__N.png.
"""
import json, pathlib, sys
import fitz
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import locate  # reuse build_pdf_map / candidate_points / anchor_chain / predict_window

REPO = HERE.parents[3]
CORPUS = REPO / 'packages/content-neurons-tw/data/medexam-reconciled/questions.json'
QUAR = REPO / 'openspec/changes/archive/2026-06-25-add-neurons-explanation-tables/quarantine-severe.json'
MANIFEST = HERE.parents[1] / 'table-images/manifest.json'
OUT = HERE / 'for-owner-tail'
OUT.mkdir(exist_ok=True)
ZOOM = 2.4
BANNER_H = 70
FONTS = ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/STHeiti Medium.ttc']

def font(sz):
    for f in FONTS:
        if pathlib.Path(f).exists():
            try: return ImageFont.truetype(f, sz)
            except Exception: pass
    return ImageFont.load_default()

def banner(img, lines):
    w = img.width
    c = Image.new('RGB', (w, img.height + BANNER_H), 'white')
    c.paste(img, (0, BANNER_H))
    d = ImageDraw.Draw(c)
    d.rectangle([0, 0, w, BANNER_H], fill=(24, 32, 48))
    d.text((12, 8), lines[0], fill='white', font=font(22))
    d.text((12, 40), lines[1], fill=(180, 200, 230), font=font(15))
    return c

quar = set(json.loads(QUAR.read_text()))
imaged = set(json.loads(MANIFEST.read_text()).keys())
tail = sorted(quar - imaged)
corpus = {q['id']: q for q in json.loads(CORPUS.read_text())}

# group by (year,session,book) → resolve pages via the LIS-chain
pdf_map = locate.build_pdf_map()
by_key = {}
for qid in tail:
    m = corpus[qid]['meta']
    by_key.setdefault((str(m['year']), str(m['session']), m['book']), []).append(qid)

index = ['# 29 image-tail 詳解 — owner crop package', '',
         f'{len(tail)} questions. For each, open its `<qid>__pP.png`, Cmd-Shift-4 crop the 詳解 TABLE region',
         'precisely, and save to `from-owner-tail/<qid>__1.png` (use __2,__3 if several tables).', '',
         '| # | qid | page img | answer | stem |', '|---|---|---|---|---|']
seg = {}
n = 0
for key, qids in sorted(by_key.items()):
    pdf = pdf_map.get(key)
    if pdf is None:
        for qid in qids: index.append(f'| - | {qid} | PDF-NOT-FOUND | | |')
        continue
    doc = fitz.open(pdf)
    chain = locate.anchor_chain(locate.candidate_points(doc))
    for qid in qids:
        n += 1
        qn = int(corpus[qid]['meta']['qNumber'])
        pages, exact = locate.predict_window(chain, qn, doc.page_count)
        seg[qid] = {'pdf': pdf.name, 'qNumber': qn, 'pages': pages, 'exact': exact}
        stem = (corpus[qid].get('stem') or '')[:40]
        ans = corpus[qid].get('answer', '')
        imgs = []
        for pno in pages:
            pil = Image.frombytes('RGB', (0, 0), b'') if False else None
            pix = doc[pno].get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
            pil = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            out = banner(pil, [f'{qid}   (q{qn}, ans {ans})', f'crop the 詳解 表格 → from-owner-tail/{qid}__1.png   |   {stem}'])
            fn = f'{qid}__p{pno}.png'
            out.save(str(OUT / fn)); imgs.append(fn)
        index.append(f'| {n} | {qid} | {", ".join(imgs)} | {ans} | {stem} |')
    doc.close()

(OUT / '_INDEX.md').write_text('\n'.join(index) + '\n')
(HERE / '_work' / 'segments-tail.json').write_text(json.dumps(seg, ensure_ascii=False, indent=1))
print(f'tail questions: {len(tail)}; rendered into {OUT}')
print(f'pages rendered: {sum(len(v["pages"]) for v in seg.values())}')
unresolved = [q for q, v in seg.items() if not v['pages']]
print(f'unresolved (no page): {len(unresolved)} {unresolved}')
