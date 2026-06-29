#!/usr/bin/env python3
"""Render the pdf_queue pages for the 簡答 backfill
(backfill-neurons-simplified-explanations, task 1.3).

Reads <workDir>/manifest.json, and for every queue=='pdf' item renders the mapped
page (0-based) of the original 陽明 詳解 PDF to <workDir>/pdf-pages/<qid>.png at
2.5x. Source PDFs default to ~/Desktop/國考/一階國考/陽明國考考古/ (override with
$YM_PDF_ROOT). Handles macOS NFC/NFD filename mismatch by normalized lookup.

Run with the venv python that has PyMuPDF:
    <venv>/bin/python scripts/option-explanations/render-backfill-pages.py <workDir>
"""
import json
import os
import sys
import unicodedata

import fitz  # PyMuPDF

SCALE = 2.5
PDF_ROOT = os.environ.get(
    "YM_PDF_ROOT",
    os.path.expanduser("~/Desktop/國考/一階國考/陽明國考考古"),
)


def build_pdf_index(root: str) -> dict[str, str]:
    """Map NFC-normalized filename -> real on-disk path (defeats NFD/NFC drift)."""
    index: dict[str, str] = {}
    for name in os.listdir(root):
        if name.lower().endswith(".pdf"):
            index[unicodedata.normalize("NFC", name)] = os.path.join(root, name)
    return index


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: render-backfill-pages.py <workDir>")
    work_dir = sys.argv[1]
    manifest = json.load(open(os.path.join(work_dir, "manifest.json")))
    pages_dir = os.path.join(work_dir, "pdf-pages")
    os.makedirs(pages_dir, exist_ok=True)

    index = build_pdf_index(PDF_ROOT)
    docs: dict[str, fitz.Document] = {}
    rendered = 0
    missing_file: list[str] = []
    bad_page: list[str] = []

    for item in manifest:
        if item.get("queue") != "pdf":
            continue
        qid = item["qid"]
        fname = unicodedata.normalize("NFC", item["file"])
        path = index.get(fname)
        if not path:
            missing_file.append(f"{qid}: {item['file']}")
            continue
        if path not in docs:
            docs[path] = fitz.open(path)
        doc = docs[path]
        page_idx = int(item["page"])  # 0-based
        if page_idx < 0 or page_idx >= doc.page_count:
            bad_page.append(f"{qid}: page {page_idx} of {doc.page_count} in {fname}")
            continue
        page = doc.load_page(page_idx)
        pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False)
        pix.save(os.path.join(pages_dir, f"{qid}.png"))
        rendered += 1
        # Next page too (2-page window): older continuous-flow 詳解 spills onto page+1.
        if page_idx + 1 < doc.page_count:
            nxt = doc.load_page(page_idx + 1)
            npix = nxt.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False)
            npix.save(os.path.join(pages_dir, f"{qid}-next.png"))

    for d in docs.values():
        d.close()

    print("=== RENDER PDF PAGES ===")
    print(f"PDF root: {PDF_ROOT}")
    print(f"rendered: {rendered} → {pages_dir}")
    if missing_file:
        print(f"! missing source PDF ({len(missing_file)}):")
        for m in missing_file:
            print(f"    {m}")
    if bad_page:
        print(f"! page out of range ({len(bad_page)}):")
        for b in bad_page:
            print(f"    {b}")


if __name__ == "__main__":
    main()
