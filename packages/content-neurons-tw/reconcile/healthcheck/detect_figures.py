#!/usr/bin/env python3
"""
neurons 詳解-figure health-check detector (Phase 1, read-only).

Scans the 陽明 source PDFs, and per question resolves source PDF + card bbox +
row-label y-bands, attributing every >threshold raster on the card pages to a
content block (stem / option / explanation). Emits a canonical per-question +
per-candidate inventory and a coverage report. MODIFIES NO PRODUCT DATA.

Parsing functions (parse_filename / find_question_starts / offset_to_page /
build_full_text_and_pagemap / SUBJECT_MAP) are VENDORED verbatim from
`_scripts/extract_exam.py` so this tool is self-contained (no import from ~/Desktop).

Requires PyMuPDF (fitz) >= 1.24 (uses page.get_image_rects). Pin: pymupdf==1.27.*
Run:  python detect_figures.py --source-root "<dir of 陽明 *.pdf>" \
        --corpus ../../data/medexam-reconciled/questions.json \
        --out healthcheck_inventory.json
"""
import argparse, bisect, json, os, re, sys, glob
from collections import Counter, defaultdict
import fitz  # PyMuPDF >=1.24

# ---------------------------------------------------------------------------
# VENDORED from _scripts/extract_exam.py (do not edit here; re-vendor if upstream changes)
# ---------------------------------------------------------------------------
SUBJECT_MAP = {
    "醫學一": [
        ("解剖學", 1, 31),
        ("胚胎學", 32, 36),
        ("組織學", 37, 46),
        ("生理學", 47, 73),
        ("生物化學", 74, 100),
    ],
    "醫學二": [
        ("微生物暨免疫學", 1, 28),
        ("寄生蟲學", 29, 35),
        ("公共衛生學", 36, 50),
        ("藥理學", 51, 75),
        ("病理學", 76, 100),
    ],
}

# Subject keywords (longer alternatives first to avoid prefix-eating)
SUBJECT_KEYWORDS = (
    r"大體解剖學|大體解剖|生物化學|公共衛生學|公共衛生|"
    r"微生物學|微生物免疫學|微生物|寄生蟲學|寄生蟲|"
    r"生化學|生理學|藥理學|藥物學|病理學|解剖學|胚胎學|組織學|"
    r"解剖|胚胎|組織|生理|生化|微免|免疫|寄生|公衛|藥理|藥物|病理"
)


def parse_filename(path: str):
    """Return (year, session, book) or None."""
    name = os.path.basename(path)
    m = re.match(r"(\d{3})[-_](\d)", name)
    if not m:
        return None
    year = int(m.group(1))
    session = int(m.group(2))
    if "醫學(一)" in name or "醫學一" in name:
        book = "醫學一"
    elif "醫學(二)" in name or "醫學二" in name:
        book = "醫學二"
    else:
        return None
    return year, session, book


def extract_pages(pdf_path: str):
    """Return list of (page_idx, text, has_image)."""
    doc = fitz.open(pdf_path)
    pages = []
    for i in range(doc.page_count):
        page = doc[i]
        text = page.get_text()
        imgs = page.get_images(full=False)
        # Filter logos: only count images > 50000 px area
        has_img = False
        for img in imgs:
            try:
                w = img[2] if len(img) > 2 else 0
                h = img[3] if len(img) > 3 else 0
                if w * h > 50000:
                    has_img = True
                    break
            except Exception:
                has_img = True
                break
        pages.append((i, text, has_img))
    doc.close()
    return pages


def build_full_text_and_pagemap(pages):
    """Concatenate page texts with \\n separator. Return (full_text, page_offsets[]).
    page_offsets[i] = char offset where page i starts in full_text."""
    parts = []
    offsets = []
    cur = 0
    for _, t, _ in pages:
        offsets.append(cur)
        parts.append(t)
        cur += len(t) + 1  # +1 for the joining \n
    return "\n".join(parts), offsets


def offset_to_page(offset, page_offsets):
    return max(0, bisect.bisect_right(page_offsets, offset) - 1)


def find_question_starts(full_text: str):
    """Return sorted list of (qnum, char_offset) for unique question start positions.

    Union of 6 layout patterns (try most-specific first):
      P4n: 題號\\n<n>\\n科目  (110+, newline-separated)
      P4s: 題號 <n> 類別/科目  (107-1, space-separated)
      P3:  <n>\\n<subject>\\n(筆者|...)  (108-1)
      P3l: <n>\\n<any 1-15 中文字>\\n(筆者|...)  (looser fallback for unknown subject names)
      P5:  第N 題\\s+科別/作者  (109-1, 111-1)
      P1:  <n>.\\n題[目幹]  (106-1 old)
    """
    candidates = {}

    patterns = [
        # P4n: 題號\n<n>\n科目  (most reliable, 110+)
        re.compile(
            r"題[號]\s*\n+\s*(\d{1,3})\s*\n+\s*(?:科[目⽬]|題[幹目⽬]|類別|筆者|撰寫|關鍵字|製稿)",
            re.MULTILINE,
        ),
        # P4s: 題號 <n> 類別  (107-1, space-separated)
        re.compile(
            r"題[號][\s　]+(\d{1,3})[\s　]+(?:類別|科[目⽬]|題[幹目⽬]|製稿|筆者)",
        ),
        # P3: <n>\n<known subject>\n(筆者|關鍵字|撰寫)
        re.compile(
            rf"(?:^|\n)\s*(\d{{1,3}})\s*\n+\s*(?:{SUBJECT_KEYWORDS})\s*\n+\s*(?:筆者|關鍵字|撰寫|出題者|作者)",
            re.MULTILINE,
        ),
        # P3l: <n>\n<any 1-15 中文字>\n(筆者|關鍵字|撰寫|作者)
        re.compile(
            r"(?:^|\n)\s*(\d{1,3})\s*\n+\s*[一-鿿]{1,15}\s*\n+\s*(?:筆者|關鍵字|撰寫|出題者|作者)",
            re.MULTILINE,
        ),
        # P5a: 第N 題 + 科別/作者/筆者 label  (111-1)
        re.compile(
            r"第\s*(\d{1,3})\s*題[\s\n]*(?:科[別目⽬]|作者|筆者|題目)",
            re.MULTILINE,
        ),
        # P5b: 第N 題 + <subject keyword> (no label)  (109-1: "第01 題\n解剖\n<author>\n<stem>")
        re.compile(
            rf"第\s*(\d{{1,3}})\s*題[\s\n]+(?:{SUBJECT_KEYWORDS})\s*\n",
            re.MULTILINE,
        ),
        # P1: <n>.\n題[目幹]  (106-1 old continuous)
        re.compile(
            r"(?:^|\n)\s*(\d{1,3})[\.\．]?\s*\n+\s*題[目⽬幹]\s*\n",
            re.MULTILINE,
        ),
    ]

    for pat in patterns:
        for m in pat.finditer(full_text):
            qn = int(m.group(1))
            if 1 <= qn <= 100:
                if qn not in candidates or m.start() < candidates[qn]:
                    candidates[qn] = m.start()

    # P6 fallback: option-block-anchored detection.
    # Find every "(A)" or "A.\s" that's followed (within 1000 chars) by (B), (C), (D)
    # in order; then look back up to 500 chars for the nearest isolated 1-100 number.
    opt_a_pat = re.compile(r"(?:^|\n)\s*(?:\(A\)|A[\.\、\．])\s", re.MULTILINE)
    opt_b_pat = re.compile(r"(?:^|\n)\s*(?:\(B\)|B[\.\、\．])\s", re.MULTILINE)
    opt_c_pat = re.compile(r"(?:^|\n)\s*(?:\(C\)|C[\.\、\．])\s", re.MULTILINE)
    opt_d_pat = re.compile(r"(?:^|\n)\s*(?:\(D\)|D[\.\、\．])\s", re.MULTILINE)
    qnum_lookback = re.compile(r"(?:^|\n)\s*(\d{1,3})\s*[\.\．]?\s*(?:\n|$)", re.MULTILINE)

    for ma in opt_a_pat.finditer(full_text):
        window_end = min(ma.end() + 1500, len(full_text))
        window = full_text[ma.end():window_end]
        mb = opt_b_pat.search(window)
        if not mb:
            continue
        mc = opt_c_pat.search(window, mb.end())
        if not mc:
            continue
        md = opt_d_pat.search(window, mc.end())
        if not md:
            continue
        # Confirmed 4-option block. Look back 500 chars for nearest qnum.
        back_start = max(0, ma.start() - 500)
        before = full_text[back_start:ma.start()]
        nums = list(qnum_lookback.finditer(before))
        if not nums:
            continue
        for nm in reversed(nums):
            qn = int(nm.group(1))
            if 1 <= qn <= 100:
                offset = back_start + nm.start()
                if qn not in candidates or offset < candidates[qn]:
                    candidates[qn] = offset
                break

    return sorted(candidates.items(), key=lambda x: x[1])



# ---------------------------------------------------------------------------
# Figure detection v2 — per-page region splitting (codex-reviewed)
# Region boundaries come from 題號 anchor y-positions; OWNERSHIP comes from
# find_question_starts (qnums whose start-page == this page, matched in y-order).
# Each image is assigned to a region by vertical-overlap majority. Fixes the
# boundary-sweep bug where Q_N absorbed Q_{N+1}'s figures off the shared page.
# ---------------------------------------------------------------------------
EXPL_LABELS = ["簡解", "答題要訣", "詳解", "解析"]
ROW_LABELS_ALL = ["題幹", "題目", "答案", "公告答案"] + EXPL_LABELS + ["資料出處"]

def _region_anchor_ys(pg):
    rs = pg.search_for("題號")
    ys = sorted(r.y0 for r in rs)
    # collapse near-duplicate label hits (<8pt apart = same header)
    out = []
    for y in ys:
        if not out or y - out[-1] > 8:
            out.append(y)
    return out

def _band_in_region(pg, img_y, ry0, ry1):
    A = {}
    for lab in ROW_LABELS_ALL:
        for r in pg.search_for(lab):
            if ry0 - 2 <= r.y0 < ry1:
                A.setdefault(lab, r.y0)
                break
    expl = min([A[k] for k in EXPL_LABELS if k in A], default=None)
    stem = A.get("題幹", A.get("題目"))
    ans = A.get("答案", A.get("公告答案"))
    if expl is not None and img_y >= expl - 6:
        return "explanation"
    if stem is not None and ans is not None and stem - 6 <= img_y < ans:
        return "stem"
    return "unknown"

def process_pdf(pdf, cidx):
    info = parse_filename(pdf)
    if not info:
        return [], None
    year, session, book = info
    doc = fitz.open(pdf)
    pages = [(i, doc[i].get_text(), None) for i in range(doc.page_count)]
    full, offs = build_full_text_and_pagemap(pages)
    starts = find_question_starts(full)
    notext = len(starts) < 30
    # page -> [qnums whose card starts on that page], sorted by qnum (≈ top→bottom)
    page_to_qnums = defaultdict(list)
    for qn, off in starts:
        page_to_qnums[offset_to_page(off, offs)].append(qn)
    for p in page_to_qnums:
        page_to_qnums[p].sort()
    # logo filter
    xref_pages = defaultdict(set)
    for pi in range(doc.page_count):
        for img in doc[pi].get_images(full=True):
            xref_pages[img[0]].add(pi)

    figs_by_q = defaultdict(list)         # qnum -> [candidate dict]
    last_open = None
    for pi in range(doc.page_count):
        pg = doc[pi]
        ph = pg.rect.height
        anchor_ys = _region_anchor_ys(pg)
        starting = page_to_qnums.get(pi, [])
        # Build regions: (y0, y1, qnum, confidence)
        regions = []
        if not anchor_ys:
            regions.append((0.0, ph, last_open, "medium" if last_open else "review"))
        else:
            # top → first anchor = continuation tail of previous open question
            regions.append((0.0, anchor_ys[0], last_open, "medium" if last_open else "review"))
            # match anchors to qnums starting here, in order
            for idx, ay in enumerate(anchor_ys):
                y1 = anchor_ys[idx + 1] if idx + 1 < len(anchor_ys) else ph
                if idx < len(starting):
                    qn = starting[idx]
                    conf = "high" if len(anchor_ys) == len(starting) else "review"
                else:
                    qn = None
                    conf = "review"
                regions.append((ay, y1, qn, conf))
                if qn is not None:
                    last_open = qn
        # assign images to regions by vertical-overlap majority
        for img in pg.get_images(full=True):
            xref = img[0]
            if len(xref_pages[xref]) >= 10:
                continue
            try:
                rects = pg.get_image_rects(xref)
            except Exception:
                rects = []
            single = len(rects) == 1
            for r in rects:
                ar = (r.width * r.height) / (pg.rect.width * ph)
                if ar < 0.012 or r.y1 < 72 or r.y0 > ph - 40:
                    continue
                ov = []
                for (ry0, ry1, qn, rconf) in regions:
                    oh = max(0.0, min(r.y1, ry1) - max(r.y0, ry0))
                    frac = oh / max(1.0, r.height)
                    if frac > 0:
                        ov.append((frac, ry0, ry1, qn, rconf))
                if not ov:
                    continue
                ov.sort(reverse=True)
                best_frac, ry0, ry1, qn, rconf = ov[0]
                second = ov[1][0] if len(ov) > 1 else 0.0
                if qn is None:
                    continue  # region with no resolvable owner → skip (review)
                if best_frac >= 0.70:
                    aconf = rconf
                elif best_frac >= 0.55 and best_frac - second >= 0.10:
                    aconf = "review"
                else:
                    continue  # ~50/50 straddle → skip-with-reason ambiguous
                band = _band_in_region(pg, r.y0, ry0, ry1)
                figs_by_q[qn].append({
                    "page": pi, "xref": xref,
                    "bbox": [round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1)],
                    "areaRatio": round(ar, 4), "band": band,
                    "decision": _classify_decision(single, ar),
                    "attributionConfidence": aconf,
                })

    recs = []
    seen = set()
    for qn in sorted(set(list(figs_by_q) + [q for q, _ in starts])):
        if qn in seen:
            continue
        seen.add(qn)
        cands = figs_by_q.get(qn, [])
        expl_c = [c for c in cands if c["band"] == "explanation"]
        cref = cidx.get((year, session, book, qn), {})
        recs.append({
            "year": year, "session": session, "book": book, "qnum": qn, "notext": notext,
            "candidates": cands,
            "counts": {"stem": sum(c["band"] == "stem" for c in cands),
                       "option": 0,
                       "explanation": len(expl_c),
                       "unknown": sum(c["band"] == "unknown" for c in cands)},
            "corpusId": cref.get("id"),
            "corpusHasImage": cref.get("hasImage"),
            "corpusHasBlocks": cref.get("hasBlocks"),
        })
    doc.close()
    return recs, {"book": book, "year": year, "session": session,
                  "q": len(starts), "notext": notext}

def _classify_decision(single_xref_raster, area_ratio):
    if single_xref_raster and area_ratio >= 0.02:
        return "extract"
    return "render-crop"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-root", default=os.path.expanduser(
        "~/Desktop/國考/一階國考/陽明國考考古"))
    ap.add_argument("--corpus", default=os.path.join(
        os.path.dirname(__file__), "..", "..", "data", "medexam-reconciled", "questions.json"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "healthcheck_inventory.json"))
    ap.add_argument("--only", help="substring filter on PDF filename (e.g. 112- for pilot subset)")
    args = ap.parse_args()

    corpus = json.loads(open(args.corpus, encoding="utf-8").read())
    cidx = {}
    for q in corpus:
        m = q.get("meta", {})
        cidx[(m.get("year"), m.get("session"), m.get("book"), m.get("qNumber"))] = {
            "id": q["id"], "hasImage": bool(q.get("hasImage")),
            "hasBlocks": bool(q.get("explanationBlocks"))}

    pdfs = sorted(glob.glob(os.path.join(args.source_root, "*.pdf")))
    if args.only:
        pdfs = [p for p in pdfs if args.only in os.path.basename(p)]
    inv = []
    summary = []
    for n, pdf in enumerate(pdfs):
        recs, s = process_pdf(pdf, cidx)
        if s is None:
            continue
        inv.extend(recs)
        summary.append(s)
        json.dump(inv, open(args.out, "w"), ensure_ascii=False)  # partial write
        wexpl = sum(1 for r in recs if r["counts"]["explanation"])
        print(f"[{n+1:2d}/{len(pdfs)}] {os.path.basename(pdf)[:22]:23s} q={s['q']:3d} "
              f"explFig={wexpl:3d}{' NOTEXT' if s['notext'] else ''}", flush=True)

    scanned = len(inv)
    corpus_n = len(corpus)
    wexpl = sum(1 for r in inv if r["counts"]["explanation"])
    netnew = sum(1 for r in inv if r["counts"]["explanation"] and not r["corpusHasBlocks"])
    multifig = sum(1 for r in inv if r["counts"]["explanation"] > 1)
    report = {
        "corpusTotal": corpus_n, "scanned": scanned, "unscanned": corpus_n - scanned,
        "explFigureQuestions": wexpl, "explFigureNetNew": netnew, "multiFigure": multifig,
        "stemImageQuestions": sum(1 for r in inv if r["counts"]["stem"]),
        "optionImageQuestions": sum(1 for r in inv if r["counts"]["option"]),
        "totalExplFigures": sum(r["counts"]["explanation"] for r in inv),
        "notextBooklets": sorted({f"{s['year']}-{s['session']}{s['book'][-1]}"
                                  for s in summary if s["notext"]}),
    }
    json.dump(report, open(os.path.join(os.path.dirname(args.out), "healthcheck_report.json"), "w"),
              ensure_ascii=False, indent=2)
    print("\n=== REPORT ===")
    for k, v in report.items():
        print(f"  {k}: {v}")

if __name__ == "__main__":
    main()
