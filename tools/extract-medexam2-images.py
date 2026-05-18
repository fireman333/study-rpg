#!/usr/bin/env python3
"""Extract embedded images from 二階國考 PDFs for hasImage questions.

Two modes:
  --dry-run : log PDF/page/image-count discovery, write nothing
  --write   : actually save PNGs to output dir

Reads:  apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json
Writes: apps/medexam2-hospital-tw/public/images/medexam2-tw/<qid>.png
Log:    tools/extraction.log
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import fitz  # PyMuPDF

REPO_ROOT = Path(__file__).resolve().parent.parent
QUESTIONS_JSON = REPO_ROOT / "apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json"
PDF_DIR = Path.home() / "Desktop" / "國考" / "二階國考"
OUTPUT_DIR = REPO_ROOT / "apps/medexam2-hospital-tw/public/images/medexam2-tw"
LOG_PATH = Path(__file__).resolve().parent / "extraction.log"

SITTING_TO_ZH = {"1": "一", "2": "二"}
QID_RE = re.compile(r"^(\d+)-(\d+)-(醫學[三四五六])-(.+?)-Q(\d+)$")


def parse_qid(qid: str):
    m = QID_RE.match(qid)
    if not m:
        return None
    year, sitting, paper, subject, qnum = m.groups()
    return year, sitting, paper, subject, int(qnum)


def pdf_path_for(year: str, sitting: str, paper: str) -> Path:
    zh = SITTING_TO_ZH.get(sitting, sitting)
    return PDF_DIR / f"民國{year}_第{zh}次_{paper}.pdf"


_WS_RE = re.compile(r"\s+")
# PyMuPDF sort=True extraction on the two-column 高點醫護 PDFs occasionally
# emits a character twice at the column boundary (e.g. "男男性嗽嗽"). Dedup
# any pair of identical adjacent CJK chars on both haystack and needle so the
# match is artifact-tolerant. Lossy for legitimate doubles like 慢慢/漸漸 —
# acceptable since we only need to locate the page, not preserve content.
_DEDUP_RE = re.compile(r"([㐀-鿿])\1")


def _normalize(text: str) -> str:
    no_ws = _WS_RE.sub("", text)
    # Apply twice for runs of 3+ same chars (e.g. "嗽嗽嗽" → "嗽嗽" → "嗽")
    return _DEDUP_RE.sub(r"\1", _DEDUP_RE.sub(r"\1", no_ws))


def find_page_for_stem(doc: fitz.Document, stem: str) -> int | None:
    """Search PDF pages for the stem text. The PDFs are two-column layouts where
    text extraction interleaves columns and breaks mid-sentence. Strategy:

    1. Normalize whitespace on both sides (collapse all whitespace).
    2. Use sort=True extraction (PyMuPDF tries to sort blocks in reading order).
    3. Try multiple fragments — start, middle, end — so at least one falls
       within an unbroken contiguous run.
    """
    stem_norm = _normalize(stem)
    if len(stem_norm) < 8:
        return None

    page_norms: list[str] = [
        _normalize(doc[pno].get_text("text", sort=True)) for pno in range(len(doc))
    ]

    # Generate candidate fragments — each 10-15 chars from different offsets.
    fragments: list[str] = []
    for length in (15, 10):
        for start in (0, 5, 10, 15, 20, 30):
            if start + length <= len(stem_norm):
                frag = stem_norm[start : start + length]
                if len(frag) >= 8 and frag not in fragments:
                    fragments.append(frag)

    for frag in fragments:
        for pno, text in enumerate(page_norms):
            if frag in text:
                return pno
    return None


def save_image(doc: fitz.Document, xref: int, out: Path) -> None:
    pix = fitz.Pixmap(doc, xref)
    try:
        if pix.n - pix.alpha >= 4:  # CMYK -> RGB
            converted = fitz.Pixmap(fitz.csRGB, pix)
            converted.save(str(out))
            converted = None  # noqa: F841
        else:
            pix.save(str(out))
    finally:
        pix = None  # noqa: F841


def pick_best_image_xref(
    page: fitz.Page, imgs: list, stem: str
) -> tuple[int, str]:
    """For MULTI_IMG cases, prefer the image whose bbox sits below the stem text
    and has the largest area. Returns (xref, strategy_label).

    Fallback: if no stem rect found, take the largest image on the page.
    """
    if len(imgs) == 1:
        return imgs[0][0], "single"

    # Find stem y position — try several fragment offsets to handle column wrap
    stem_norm = _normalize(stem)
    stem_y_bottom = None
    for offset in (0, 5, 10, 15, 20):
        frag = stem_norm[offset : offset + 8]
        if len(frag) < 6:
            continue
        rects = page.search_for(frag)
        if rects:
            stem_y_bottom = max(r.y1 for r in rects)
            break

    # Build candidate list: (xref, area, y0)
    candidates = []
    for img in imgs:
        xref = img[0]
        rects = page.get_image_rects(xref)
        if not rects:
            continue
        r = rects[0]
        area = (r.x1 - r.x0) * (r.y1 - r.y0)
        # Skip tiny images (likely decorative icons, < 0.5% of page area)
        page_area = page.rect.width * page.rect.height
        if area < 0.005 * page_area:
            continue
        candidates.append((xref, area, r.y0))

    if not candidates:
        # All filtered out — fall back to first image regardless
        return imgs[0][0], "no-bbox-fallback"

    if stem_y_bottom is not None:
        below = [c for c in candidates if c[2] >= stem_y_bottom - 5]
        if below:
            # Largest image below stem
            best = max(below, key=lambda c: c[1])
            return best[0], "below-stem"

    # Fallback: largest non-tiny image
    best = max(candidates, key=lambda c: c[1])
    return best[0], "largest"


def render_page(page: fitz.Page, out: Path, dpi: int = 150) -> None:
    pix = page.get_pixmap(dpi=dpi)
    pix.save(str(out))


def main() -> int:
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="discover only, write nothing")
    mode.add_argument("--write", action="store_true", help="extract and save PNGs")
    ap.add_argument("--only", help="comma-separated qid filter (for spot-check)", default=None)
    args = ap.parse_args()

    if not QUESTIONS_JSON.exists():
        print(f"ERROR: {QUESTIONS_JSON} not found — run pnpm build first", file=sys.stderr)
        return 1

    questions = json.loads(QUESTIONS_JSON.read_text(encoding="utf-8"))
    has_image = [q for q in questions if q.get("hasImage")]
    if args.only:
        only_ids = set(args.only.split(","))
        has_image = [q for q in has_image if q["id"] in only_ids]
    print(f"[medexam2-images] total questions: {len(questions)}, hasImage: {len(has_image)}")
    print(f"[medexam2-images] mode: {'dry-run' if args.dry_run else 'WRITE'}")
    print()

    if args.write:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    stats: Counter[str] = Counter()
    log_lines: list[str] = []
    pdf_cache: dict[Path, fitz.Document] = {}

    def get_doc(path: Path) -> fitz.Document | None:
        if path in pdf_cache:
            return pdf_cache[path]
        if not path.exists():
            return None
        doc = fitz.open(path)
        pdf_cache[path] = doc
        return doc

    for q in has_image:
        qid = q["id"]
        parsed = parse_qid(qid)
        if not parsed:
            log_lines.append(f"BAD_QID {qid}")
            stats["failed"] += 1
            continue
        year, sitting, paper, _subject, _qnum = parsed
        pdf = pdf_path_for(year, sitting, paper)
        doc = get_doc(pdf)
        if doc is None:
            log_lines.append(f"NO_PDF {qid} -> {pdf.name}")
            stats["no_pdf"] += 1
            continue

        target_page = find_page_for_stem(doc, q.get("stem", ""))
        if target_page is None:
            log_lines.append(f"STEM_NOT_FOUND {qid}")
            stats["stem_not_found"] += 1
            continue

        page = doc[target_page]
        imgs = page.get_images()
        out = OUTPUT_DIR / f"{qid}.png"

        if imgs:
            xref, strategy = pick_best_image_xref(page, imgs, q.get("stem", ""))
            if len(imgs) > 1:
                log_lines.append(
                    f"MULTI_IMG {qid} page={target_page} count={len(imgs)} -> {strategy} xref={xref}"
                )
                stats["multi_img"] += 1
            stats["extracted"] += 1
            if args.write:
                try:
                    save_image(doc, xref, out)
                except Exception as e:  # noqa: BLE001
                    log_lines.append(f"SAVE_FAIL {qid} xref={xref} err={e!r}")
                    stats["extracted"] -= 1
                    stats["failed"] += 1
        else:
            log_lines.append(f"RENDERED_PAGE {qid} page={target_page} (no embedded image)")
            stats["rendered_page"] += 1
            if args.write:
                try:
                    render_page(page, out)
                except Exception as e:  # noqa: BLE001
                    log_lines.append(f"RENDER_FAIL {qid} err={e!r}")
                    stats["rendered_page"] -= 1
                    stats["failed"] += 1

    for doc in pdf_cache.values():
        doc.close()

    LOG_PATH.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
    print(f"[medexam2-images] log written to {LOG_PATH} ({len(log_lines)} entries)")
    print()
    print("=== Stats ===")
    print(f"  extracted:      {stats['extracted']}")
    print(f"    multi-img:    {stats['multi_img']} (first image taken; review log)")
    print(f"  rendered_page:  {stats['rendered_page']} (no embedded image — full page render)")
    print(f"  no_pdf:         {stats['no_pdf']}")
    print(f"  stem_not_found: {stats['stem_not_found']}")
    print(f"  failed:         {stats['failed']}")
    print(f"  total:          {len(has_image)}")
    success = stats["extracted"] + stats["rendered_page"]
    print(f"  ----")
    print(f"  success rate:   {success}/{len(has_image)} ({100*success/max(1, len(has_image)):.1f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
