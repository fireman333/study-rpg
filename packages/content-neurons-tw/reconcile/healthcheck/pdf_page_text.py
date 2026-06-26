#!/usr/bin/env python3
"""Dump the extracted text of a page range from a source PDF — a small helper for
the residual page-resolution agent pass (locate a question's 詳解 card by reading
the booklet text around a candidate window). Read-only.

Usage:
  .venv-fitz/bin/python pdf_page_text.py "<pdf basename or abs path>" <page0_start> [<page0_end>]

Pages are 0-based (PyMuPDF doc[page]). Prints "--- page <n> ---" headers so the
caller can attribute text to a page.
"""
import os, sys
import fitz
fitz.TOOLS.mupdf_display_errors(False)

SRC = os.path.expanduser("~/Desktop/國考/一階國考/陽明國考考古")


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(2)
    arg = sys.argv[1]
    path = arg if os.path.isabs(arg) and os.path.exists(arg) else os.path.join(SRC, arg)
    p0 = int(sys.argv[2])
    p1 = int(sys.argv[3]) if len(sys.argv) > 3 else p0
    doc = fitz.open(path)
    p0 = max(0, p0); p1 = min(doc.page_count - 1, p1)
    for i in range(p0, p1 + 1):
        print(f"--- page {i} ---")
        print(doc[i].get_text())
    doc.close()


if __name__ == "__main__":
    main()
