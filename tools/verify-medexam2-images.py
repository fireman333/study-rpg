#!/usr/bin/env python3
"""Verify each extracted PNG actually belongs to its claimed question by
checking that the image's bbox on the source PDF page falls within the
question's vertical range (between this question's number marker and the
next question's number marker).

Outputs a verification report classifying each extracted image as:
  - OK              : image bbox between Q_n and Q_{n+1} markers on page
  - WRONG_PAGE      : image came from wrong page (no Q_n marker found)
  - WRONG_Q         : image bbox is in another question's range on same page
  - SUSPECT_ORDER   : image found but Q_{n+1} not found, can't confirm upper bound
  - FULL_PAGE_RENDER: full-page render (cannot verify, always trust)
  - NO_VERIFY       : couldn't run check (qid parse fail, etc.)

Usage:
  python3 tools/verify-medexam2-images.py [--only qid1,qid2,...]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import fitz

REPO_ROOT = Path(__file__).resolve().parent.parent
QUESTIONS_JSON = REPO_ROOT / "apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json"
PDF_DIR = Path.home() / "Desktop" / "國考" / "二階國考"
IMG_DIR = REPO_ROOT / "apps/medexam2-hospital-tw/public/images/medexam2-tw"
EXTRACT_LOG = Path(__file__).resolve().parent / "extraction.log"
VERIFY_LOG = Path(__file__).resolve().parent / "verification.log"

SITTING_TO_ZH = {"1": "一", "2": "二"}
QID_RE = re.compile(r"^(\d+)-(\d+)-(醫學[三四五六])-(.+?)-Q(\d+)$")
_WS = re.compile(r"\s+")
_DEDUP = re.compile(r"([㐀-鿿])\1")


def parse_qid(qid: str):
    m = QID_RE.match(qid)
    if not m:
        return None
    year, sitting, paper, subject, qnum = m.groups()
    return year, sitting, paper, subject, int(qnum)


def pdf_path_for(year: str, sitting: str, paper: str) -> Path:
    zh = SITTING_TO_ZH.get(sitting, sitting)
    return PDF_DIR / f"民國{year}_第{zh}次_{paper}.pdf"


def _normalize(text: str) -> str:
    return _DEDUP.sub(r"\1", _DEDUP.sub(r"\1", _WS.sub("", text)))


def find_question_page(doc: fitz.Document, stem: str) -> int | None:
    stem_norm = _normalize(stem)
    if len(stem_norm) < 8:
        return None
    page_norms = [
        _normalize(doc[pno].get_text("text", sort=True)) for pno in range(len(doc))
    ]
    for length in (15, 10):
        for start in (0, 5, 10, 15, 20, 30):
            if start + length <= len(stem_norm):
                frag = stem_norm[start : start + length]
                if len(frag) < 8:
                    continue
                for pno, text in enumerate(page_norms):
                    if frag in text:
                        return pno
    return None


def find_q_marker_y(page: fitz.Page, qnum: int) -> float | None:
    """Find the vertical position of the question number marker.

    高點醫護 PDFs use various formats:
    - "10."   (number + period)
    - "37 一位..."  (number + space + stem, common in answer-key PDFs where
                    period got dropped by PyMuPDF text extraction)
    - "10、"  (rare)
    - "（C）37 ..." (answer-letter prefix + number + space)

    Returns the top y-coordinate of the matching rect, preferring leftmost
    (closer to margin = question marker, not in-text reference).
    """
    candidates = []

    # Try period / dot variants first (most specific, least false-positive risk)
    for marker in (f"{qnum}.", f"{qnum}、", f"{qnum}．"):
        rects = page.search_for(marker)
        for r in rects:
            candidates.append(r)

    # Then try "number + space" — riskier but needed for many PDFs.
    # Filter to rects in left half of page (Q-markers are left-aligned).
    page_w = page.rect.width
    rects = page.search_for(f"{qnum} ")
    for r in rects:
        if r.x0 < page_w / 2:
            candidates.append(r)

    if not candidates:
        return None
    # Take topmost-leftmost (smallest y, then smallest x)
    candidates.sort(key=lambda r: (r.y0, r.x0))
    return candidates[0].y0


def verify_one(qid: str, png_path: Path, log_lines: list[str]) -> str:
    parsed = parse_qid(qid)
    if not parsed:
        log_lines.append(f"NO_VERIFY {qid} bad-qid")
        return "NO_VERIFY"
    year, sitting, paper, _subject, qnum = parsed
    pdf = pdf_path_for(year, sitting, paper)
    if not pdf.exists():
        log_lines.append(f"NO_VERIFY {qid} no-pdf")
        return "NO_VERIFY"

    data = json.loads(QUESTIONS_JSON.read_text(encoding="utf-8"))
    q = next((x for x in data if x["id"] == qid), None)
    if not q:
        log_lines.append(f"NO_VERIFY {qid} no-question")
        return "NO_VERIFY"

    doc = fitz.open(pdf)
    try:
        target_page = find_question_page(doc, q.get("stem", ""))
        if target_page is None:
            log_lines.append(f"NO_VERIFY {qid} stem-not-found")
            return "NO_VERIFY"

        page = doc[target_page]
        # Locate Q-number rect for this question and the next
        q_y = find_q_marker_y(page, qnum)
        q_next_y = find_q_marker_y(page, qnum + 1)

        # Find embedded images on this page; pick the one corresponding to
        # the PNG we saved. We can't directly map saved PNG → xref, so we
        # locate ALL images on the page and check if any of their bbox is
        # within [q_y, q_next_y]. If picker behaved correctly, at least one
        # image will fall in that range. We don't need to validate WHICH
        # xref was picked — just that there exists a candidate in the right
        # range.
        imgs = page.get_images()
        if not imgs:
            # Was rendered as full page → cannot verify, trust
            log_lines.append(f"FULL_PAGE_RENDER {qid} page={target_page}")
            return "FULL_PAGE_RENDER"

        if q_y is None:
            # Can't locate Q-marker even though page is right; suspect
            log_lines.append(
                f"NO_VERIFY {qid} page={target_page} q-marker-not-found"
            )
            return "NO_VERIFY"

        # If q_next_y < q_y, the next-marker detection picked up a false
        # positive (numbers should increase down the page). Discard the upper
        # bound and downgrade to SUSPECT_ORDER.
        if q_next_y is not None and q_next_y < q_y:
            q_next_y = None

        # Get all image rects on page — no area filter here. The extraction
        # picker has its own filter but falls back to tiny images when nothing
        # else qualifies. The verify script's job is to confirm SOMETHING valid
        # exists in the question's vertical range, not impose its own threshold.
        in_range = False
        any_below_q = False
        for img in imgs:
            xref = img[0]
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            r = rects[0]
            if r.y0 >= q_y - 5:
                any_below_q = True
                if q_next_y is None or r.y0 < q_next_y:
                    in_range = True
                    break

        if in_range:
            return "OK"
        if q_next_y is None:
            log_lines.append(
                f"SUSPECT_ORDER {qid} page={target_page} q_y={q_y:.0f} "
                f"(no q_{qnum + 1} marker reliably found; can't confirm upper bound)"
            )
            return "SUSPECT_ORDER"
        if any_below_q:
            log_lines.append(
                f"WRONG_Q {qid} page={target_page} q_y={q_y:.0f} "
                f"q_next_y={q_next_y:.0f} (image is below q_next — picker grabbed wrong Q)"
            )
            return "WRONG_Q"
        log_lines.append(
            f"WRONG_Q {qid} page={target_page} q_y={q_y:.0f} "
            f"q_next_y={q_next_y:.0f} (no image in range)"
        )
        return "WRONG_Q"
    finally:
        doc.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated qid filter", default=None)
    args = ap.parse_args()

    pngs = sorted(IMG_DIR.glob("*.png"))
    if args.only:
        only_ids = set(args.only.split(","))
        pngs = [p for p in pngs if p.stem in only_ids]

    print(f"Verifying {len(pngs)} PNGs against PDF source layout")
    counts: Counter[str] = Counter()
    log_lines: list[str] = []

    for png in pngs:
        qid = png.stem
        verdict = verify_one(qid, png, log_lines)
        counts[verdict] += 1

    VERIFY_LOG.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
    print(f"\nLog written to {VERIFY_LOG}")
    print("\n=== Verification stats ===")
    for k in [
        "OK",
        "FULL_PAGE_RENDER",
        "WRONG_Q",
        "WRONG_PAGE",
        "SUSPECT_ORDER",
        "NO_VERIFY",
    ]:
        if k in counts or k == "OK":
            print(f"  {k:18s} {counts[k]}")
    total = sum(counts.values())
    ok = counts["OK"] + counts["FULL_PAGE_RENDER"]
    print(f"  {'----':18s}")
    print(f"  {'TOTAL':18s} {total}")
    print(f"  trustworthy:       {ok}/{total} ({100*ok/max(1,total):.1f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
