#!/usr/bin/env python3
"""Turn the owner's hand-cropped 詳解 table screenshots into shipped WebP assets.

Owner crops live in from-owner/ named `<NN>_<qid>__<page-or-part>[-<title>].png`.
A question may have several crops (multiple tables / a spanning table split into
`_partJofK` parts / figures). We keep each crop as its OWN image (no stitching:
consecutive parts stack in order and read fine), dedupe identical files, set
aside crops whose embedded Q-number differs from the slot's target (the owner
flagged "next question's table" cases), and derive a caption from the filename.

Outputs:
  table-images/<qid>__<n>.webp                 shipped assets (mirror figures/)
  _work/owner-images.json                      qid -> [{src, caption}] (build input)
  _work/owner-foreign.json                     set-aside crops (wrong Q-number)
"""
from __future__ import annotations
import json, re, hashlib, pathlib
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
SRCDIR = HERE / 'from-owner'
WORK = HERE / '_work'
ASSETS = HERE.parents[1] / 'table-images'   # packages/content-neurons-tw/table-images/
PUBLIC_REL = 'content/neurons-tw/table-images'  # served path (mirrors figures)
WEBP_Q = 82


def target_qids() -> dict[int, str]:
    seg = json.loads((WORK / 'segments.json').read_text())
    return {i: qid for i, qid in enumerate(seg.keys(), 1)}


def clean_caption(suffix: str) -> str:
    s = suffix
    s = re.sub(r'_part\d+of\d+', '', s)
    s = re.sub(r'^p\d+', '', s)             # drop leading page token
    s = re.sub(r'^[-_：:．.\s]+', '', s)     # drop separators
    s = re.sub(r'^\d+[.\．、]?\s*', '', s)   # drop leading ordinal (1. / 2)
    s = re.sub(r'[-_]\d+$', '', s)          # drop trailing -1 / _2 ordinal
    s = s.replace('拷貝', '').strip(' -_：:．.')
    return s or '原始詳解表格'


def sort_key(name: str) -> tuple[int, int]:
    """Order crops within a question: by page, then bare-page before -1/-2."""
    suffix = name.split('__', 1)[1]
    pm = re.search(r'p(\d+)', suffix)
    page = int(pm.group(1)) if pm else 0
    partm = re.search(r'_part(\d+)of', suffix)
    if partm:
        ordn = int(partm.group(1))
    else:
        om = re.search(r'[-_](\d+)', suffix)
        ordn = int(om.group(1)) if om else 0
    return (page, ordn)


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    for old in ASSETS.glob('*.webp'):
        old.unlink()
    tmap = target_qids()
    crops = sorted((p for p in SRCDIR.glob('*.png')), key=lambda p: (p.name[:2], sort_key(p.name), p.name))

    images: dict[str, list[dict]] = {}
    foreign: list[dict] = []
    seen_hash: dict[str, set] = {}

    for p in crops:
        m = re.match(r'(\d{2})_(.+?)__(.+)\.png$', p.name)
        if not m:
            continue
        slot, qid_in_name, suffix = int(m.group(1)), m.group(2), m.group(3)
        target = tmap.get(slot)
        # the qid embedded in THIS crop's name (owner relabels foreign tables)
        crop_q = re.search(r'-Q(\d+)$', qid_in_name)
        target_q = re.search(r'-Q(\d+)$', target) if target else None
        if not target:
            continue
        # foreign crop: owner relabeled it to a different question number
        if crop_q and target_q and crop_q.group(1) != target_q.group(1):
            foreign.append({'file': p.name, 'belongs_to': qid_in_name, 'slot_target': target})
            continue
        # dedupe identical bytes within a question
        h = hashlib.md5(p.read_bytes()).hexdigest()
        seen_hash.setdefault(target, set())
        if h in seen_hash[target]:
            continue
        seen_hash[target].add(h)
        images.setdefault(target, []).append({'src_png': p, 'caption': clean_caption(suffix)})

    manifest: dict[str, list[dict]] = {}
    total_kb = 0
    for qid, items in images.items():
        out = []
        for n, it in enumerate(items, 1):
            webp = ASSETS / f'{qid}__{n}.webp'
            img = Image.open(it['src_png']).convert('RGB')
            img.save(webp, 'WEBP', quality=WEBP_Q, method=6)
            total_kb += webp.stat().st_size / 1024
            out.append({'src': f'{PUBLIC_REL}/{qid}__{n}.webp', 'caption': it['caption']})
        manifest[qid] = out

    (WORK / 'owner-images.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    (WORK / 'owner-foreign.json').write_text(json.dumps(foreign, ensure_ascii=False, indent=2))
    n_imgs = sum(len(v) for v in manifest.values())
    print(f'questions: {len(manifest)} | images: {n_imgs} | total {total_kb:.0f} KB | set-aside foreign: {len(foreign)}')
    print('foreign:', [f['file'] for f in foreign])
    multi = {q: len(v) for q, v in manifest.items() if len(v) > 1}
    print('multi-image questions:', json.dumps(multi, ensure_ascii=False))


if __name__ == '__main__':
    main()
