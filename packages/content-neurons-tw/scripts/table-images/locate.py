#!/usr/bin/env python3
"""Locate Bucket C 詳解 tables in the original 陽明 source PDFs.

The source PDFs have a broken ToUnicode CMap (Chinese -> mojibake), but the
rasterized page renders perfectly and DIGITS in the text layer decode cleanly.
Empirically each detail page's leading digit tokens are [year, qNumber, ...], so
we derive a page -> qNumber map from the digit layer alone and never rely on the
(unsearchable) Chinese text.

Outputs (under _work/):
  - pdf-map.json      : (year,session,book) -> resolved PDF filename
  - targets.json      : qid -> {pdf, year, session, book, qNumber, pages:[...]}
  - pages/<qid>__p<N>.png : 1.6x render of each candidate page (for vision review)

Run from repo root:  python3 packages/content-neurons-tw/scripts/table-images/locate.py
"""
from __future__ import annotations
import json, re, sys, pathlib

REPO = pathlib.Path(__file__).resolve().parents[4]
SRC = pathlib.Path.home() / 'Desktop/國考/一階國考/陽明國考考古'
WORK = pathlib.Path(__file__).resolve().parent / '_work'
PAGES = WORK / 'pages'
QJSON = REPO / 'packages/content-neurons-tw/data/medexam-reconciled/questions.json'
QUARANTINE_REVIEW = REPO / 'openspec/changes/add-neurons-explanation-tables/quarantine-review.md'

RENDER_ZOOM = 1.6  # review render; final crop uses a higher zoom


def book_of(name: str) -> str | None:
    """Return '醫學一'/'醫學二' from a filename, tolerating 醫學(一)/醫學一/醫學(二)."""
    if '醫學一' in name or '醫學(一)' in name or '醫學（一）' in name:
        return '醫學一'
    if '醫學二' in name or '醫學(二)' in name or '醫學（二）' in name:
        return '醫學二'
    return None


def build_pdf_map() -> dict[tuple[str, str, str], pathlib.Path]:
    """Fuzzy-map (year, session, book) -> PDF path over all source PDFs."""
    m: dict[tuple[str, str, str], pathlib.Path] = {}
    for p in sorted(SRC.glob('*.pdf')):
        mm = re.match(r'^(\d{3})[-_](\d)', p.name)
        if not mm:
            continue
        year, session = mm.group(1), mm.group(2)
        book = book_of(p.name)
        if not book:
            continue
        key = (year, session, book)
        # First match wins; warn on dupes so we never silently pick the wrong file.
        if key in m:
            print(f"  WARN dup for {key}: keeping {m[key].name}, ignoring {p.name}", file=sys.stderr)
            continue
        m[key] = p
    return m


def candidate_points(doc, max_q: int = 110, lead: int = 8) -> list[tuple[int, int]]:
    """All (page, qNumber) candidates from each page's leading digit tokens.

    Heavily noisy (reference numbers, years, dates) — disambiguated by the
    longest-monotonic-chain pass below, not trusted per-point. Header constants
    (the ROC year / exam code printed on every page) are dropped first: any value
    present on a large fraction of pages can't be a per-question number and would
    otherwise form a spurious full-length constant chain.
    """
    raw: list[tuple[int, int]] = []
    for p, page in enumerate(doc):
        seen_on_page: set[int] = set()
        for t in re.findall(r'\d+', page.get_text())[:lead]:
            try:
                q = int(t)
            except ValueError:
                continue
            if 1 <= q <= max_q:
                raw.append((p, q))
                seen_on_page.add(q)
    npages = max(1, doc.page_count)
    from collections import Counter
    page_freq: Counter[int] = Counter()
    for p, q in set((p, q) for p, q in raw):
        page_freq[q] += 1
    drop = {q for q, c in page_freq.items() if c > 0.30 * npages}
    return [(p, q) for p, q in raw if q not in drop]


def anchor_chain(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Longest near-linear monotonic chain of (page, qNumber) points.

    The true question progression (q climbs 1->~100 as page climbs 0->N at a
    roughly constant pages-per-question rate) is the longest chain with page
    strictly increasing and q non-decreasing; scattered noise can't chain long.
    DP rejects transitions whose local pages-per-question is implausible
    (<0.3 or >4.0), so a noise spike can't splice into the backbone.
    """
    pts = sorted(set(points))
    n = len(pts)
    if n == 0:
        return []
    best = [1] * n
    prev = [-1] * n
    for j in range(n):
        pj, qj = pts[j]
        for i in range(j):
            pi, qi = pts[i]
            if pj <= pi or qj < qi:
                continue
            dq, dp = qj - qi, pj - pi
            if dq == 0:
                if dp > 3:  # same q over many pages = not a real step
                    continue
            else:
                spp = dp / dq
                if spp < 0.3 or spp > 4.0:
                    continue
            if best[i] + 1 > best[j]:
                best[j] = best[i] + 1
                prev[j] = i
    end = max(range(n), key=lambda k: best[k])
    chain: list[tuple[int, int]] = []
    k = end
    while k != -1:
        chain.append(pts[k])
        k = prev[k]
    chain.reverse()
    return chain


def predict_window(chain: list[tuple[int, int]], qn: int, npages: int) -> tuple[list[int], bool]:
    """(candidate pages, exact?) for qNumber qn from the anchor chain.

    Exact anchor -> that page (+1 for a possible spill). Bracketed by anchors ->
    interpolate (whole span if tight, else +-1 around the estimate). Beyond the
    chain ends -> extrapolate on the global slope. Always clamped to the PDF.
    """
    def clamp(ps: list[int]) -> list[int]:
        return sorted({p for p in ps if 0 <= p < npages})

    if not chain:
        return [], False
    qs = [q for _, q in chain]
    ps = [p for p, _ in chain]
    exact = [p for p, q in chain if q == qn]
    if exact:
        return clamp(exact + [exact[-1] + 1]), True
    lo = max((idx for idx, q in enumerate(qs) if q < qn), default=None)
    hi = min((idx for idx, q in enumerate(qs) if q > qn), default=None)
    if lo is not None and hi is not None:
        q0, p0 = qs[lo], ps[lo]
        q1, p1 = qs[hi], ps[hi]
        if p1 - p0 <= 4:
            return clamp(list(range(p0, p1 + 1))), False
        pred = round(p0 + (p1 - p0) * (qn - q0) / (q1 - q0))
        return clamp([pred - 1, pred, pred + 1, pred + 2]), False
    # extrapolate on the global slope
    slope = (ps[-1] - ps[0]) / (qs[-1] - qs[0]) if qs[-1] != qs[0] else 1.5
    anchor_idx = lo if lo is not None else hi
    pred = round(ps[anchor_idx] + slope * (qn - qs[anchor_idx]))
    return clamp([pred - 2, pred - 1, pred, pred + 1, pred + 2]), False


def load_bucket_c_ids() -> list[str]:
    text = QUARANTINE_REVIEW.read_text()
    sec = re.search(r'##\s*🔴\s*Bucket C.*?(?=\n##\s|\Z)', text, re.S)
    if not sec:
        raise SystemExit('Bucket C section not found in quarantine-review.md')
    return re.findall(r'^###\s+`([^`]+)`', sec.group(0), re.M)


def main() -> None:
    import fitz
    PAGES.mkdir(parents=True, exist_ok=True)
    ids = load_bucket_c_ids()
    corpus = {q['id']: q for q in json.loads(QJSON.read_text())}
    pdf_map = build_pdf_map()
    (WORK / 'pdf-map.json').write_text(
        json.dumps({'-'.join(k): v.name for k, v in sorted(pdf_map.items())}, ensure_ascii=False, indent=2)
    )

    # group ids by (year,session,book) so each PDF opens once
    by_key: dict[tuple[str, str, str], list[str]] = {}
    for qid in ids:
        meta = corpus[qid]['meta']
        key = (str(meta['year']), str(meta['session']), meta['book'])
        by_key.setdefault(key, []).append(qid)

    targets: dict[str, dict] = {}
    for key, qids in sorted(by_key.items()):
        year, session, book = key
        pdf = pdf_map.get(key)
        if pdf is None:
            print(f"  MISSING PDF for {key} (ids: {qids})", file=sys.stderr)
            for qid in qids:
                targets[qid] = {'pdf': None, 'pages': [], 'error': 'pdf-not-found'}
            continue
        doc = fitz.open(pdf)
        npages = doc.page_count
        chain = anchor_chain(candidate_points(doc))
        for qid in qids:
            qn = int(corpus[qid]['meta']['qNumber'])
            pages, exact = predict_window(chain, qn, npages)
            targets[qid] = {
                'pdf': pdf.name, 'year': year, 'session': session, 'book': book,
                'qNumber': qn, 'pages': pages, 'exact': exact,
                'method': 'chain-exact' if exact else 'chain-window',
            }
            for pno in pages:
                doc[pno].get_pixmap(matrix=fitz.Matrix(RENDER_ZOOM, RENDER_ZOOM)).save(
                    str(PAGES / f'{qid}__p{pno}.png')
                )
        doc.close()

    (WORK / 'targets.json').write_text(json.dumps(targets, ensure_ascii=False, indent=2))

    # summary
    exact = sum(1 for t in targets.values() if t.get('exact'))
    window = sum(1 for t in targets.values() if t.get('pages') and not t.get('exact'))
    none = [qid for qid, t in targets.items() if not t.get('pages')]
    print(f"PDFs resolved: {len([k for k in by_key if k in pdf_map])}/{len(by_key)}")
    print(f"ids: exact-backbone={exact} | window-only={window} | unresolved={len(none)} / {len(ids)}")
    for qid, t in targets.items():
        print(f"  {t.get('method','?'):14s} q{t.get('qNumber'):<3} pages={t.get('pages')}  {qid}")


if __name__ == '__main__':
    main()
