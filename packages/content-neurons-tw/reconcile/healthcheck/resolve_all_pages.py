#!/usr/bin/env python3
"""
Resolve a {questionId: {file, page}} page map for ALL born-digital questions
(not just figure-bearing ones), reusing the trusted detector primitives that
produced the figure manifest. Deterministic; needs the 陽明 source PDFs.

Output (committed source, consumed by build-provenance-map.mjs):
  packages/content-neurons-tw/provenance/question-page-map.json
    { "<id>": { "file": "<pdf basename>", "page": <0-based> }, ... }
  + resolve-report.json  (coverage + monotonicity-suspect list)

Pages are 0-based (PyMuPDF doc[page], same convention as the manifest); the JS
builder adds +1 for the 1-based #page=N viewer.

Self-check: within a booklet, question N's start page must be monotonic non-
decreasing in qnum (questions are sequential in the booklet). A question that
breaks monotonicity is a mis-resolved anchor → emitted to `suspects` for the
agent verification pass, and EXCLUDED from the map (button stays hidden — safer
than a wrong page).

Run:  .venv-fitz/bin/python resolve_all_pages.py \
        --source-root "~/Desktop/國考/一階國考/陽明國考考古"
"""
import argparse, glob, json, os, re
from collections import defaultdict

import fitz  # noqa: F401  (imported by detect_figures)
from detect_figures import (
    parse_filename,
    build_full_text_and_pagemap,
    find_question_starts,
    offset_to_page,
)

def _norm(s):
    return re.sub(r"\s+", "", s or "")


def _distinctive(stem):
    """Longest CJK run (≥6, cap 18) from a normalized stem — an independent
    content signal to cross-check the 題號 anchor page against."""
    n = _norm(stem)
    runs = sorted(re.findall(r"[一-鿿]{6,}", n), key=len, reverse=True)
    return runs[0][:18] if runs else (n[:14] if len(n) >= 8 else None)


def _stem_page(stem, full, offs):
    """Page where the stem's distinctive token appears in the PDF, or None."""
    tok = _distinctive(stem)
    if not tok:
        return None
    pat = re.compile(r"\s*".join(map(re.escape, tok)))
    mo = pat.search(full)
    return offset_to_page(mo.start(), offs) if mo else None


HERE = os.path.dirname(__file__)
DEFAULT_CORPUS = os.path.join(HERE, "..", "..", "data", "medexam-reconciled", "questions.json")
DEFAULT_MANIFEST = os.path.join(HERE, "..", "..", "explanation-figures", "manifest.json")
DEFAULT_OUT = os.path.join(HERE, "..", "..", "provenance", "question-page-map.json")


def canonical_pdf_per_booklet(manifest):
    """booklet (year,session,book) -> the sourcePdf the manifest already uses,
    so a booklet's text questions reference the SAME file as its figure questions."""
    out = {}
    for qid, figs in manifest.items():
        for fig in figs:
            prov = fig.get("provenance") or {}
            src = prov.get("sourcePdf")
            bk = prov.get("booklet")  # e.g. "112-1一"
            if src and bk:
                m = re.match(r"(\d{3})-(\d)([一二])", bk)
                if m:
                    book = "醫學一" if m.group(3) == "一" else "醫學二"
                    out[(int(m.group(1)), int(m.group(2)), book)] = src
            break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-root", default=os.path.expanduser("~/Desktop/國考/一階國考/陽明國考考古"))
    ap.add_argument("--corpus", default=DEFAULT_CORPUS)
    ap.add_argument("--manifest", default=DEFAULT_MANIFEST)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    corpus = json.load(open(args.corpus, encoding="utf-8"))
    manifest = json.load(open(args.manifest, encoding="utf-8"))

    # (year, session, book, qNumber) -> (corpus id, stem)
    cid = {}
    for q in corpus:
        m = q.get("meta", {})
        cid[(m.get("year"), m.get("session"), m.get("book"), m.get("qNumber"))] = (q["id"], q.get("stem", ""))

    canon = canonical_pdf_per_booklet(manifest)
    all_pdfs = sorted(glob.glob(os.path.join(args.source_root, "*.pdf")))

    # Group candidate PDFs by booklet; choose canonical (manifest) else best-resolving.
    by_booklet = defaultdict(list)
    for p in all_pdfs:
        info = parse_filename(p)
        if info:
            by_booklet[info].append(p)

    page_map = {}            # id -> {file, page, v}
    suspects = []            # mis-resolved (non-monotonic) — go to agent pass
    disagreements = []       # anchor vs stem conflict — go to agent adjudication
    notext_booklets = []
    per_booklet = {}

    for booklet, pdfs in sorted(by_booklet.items()):
        year, session, book = booklet
        # pick the file
        want = canon.get(booklet)
        chosen = next((p for p in pdfs if os.path.basename(p) == want), None)
        resolved_by = {}
        for p in pdfs:
            doc = fitz.open(p)
            pages = [(i, doc[i].get_text(), None) for i in range(doc.page_count)]
            doc.close()
            full, offs = build_full_text_and_pagemap(pages)
            starts = find_question_starts(full)
            resolved_by[p] = (starts, offs, full)
        if chosen is None:
            # no manifest file for this booklet → best-resolving pdf
            chosen = max(pdfs, key=lambda p: len(resolved_by[p][0]))
        starts, offs, full = resolved_by[chosen]
        notext = len(starts) < 30
        if notext:
            notext_booklets.append(f"{year}-{session}{book[-1]}")
        fname = os.path.basename(chosen)

        # monotonicity check (qnum order → page order) + independent stem cross-check
        starts_sorted = sorted(starts)  # by qnum
        last_page = -1
        nver = nanchor = ndis = bad = 0
        for qn, off in starts_sorted:
            cid_key = (year, session, book, qn)
            rec = cid.get(cid_key)
            if not rec:
                continue
            qid, stem = rec
            page0 = offset_to_page(off, offs)
            if page0 < last_page:
                suspects.append({"id": qid, "file": fname, "page": page0,
                                 "prevPage": last_page, "reason": "non-monotonic"})
                bad += 1
                continue  # exclude from map → agent pass
            last_page = page0
            if notext:
                continue  # scanned booklet → text layer unreliable; route to OCR/agent residual
            # second independent signal: does the corpus stem land on the same page?
            sp = _stem_page(stem, full, offs)
            if sp is None:
                verdict = "anchoronly"          # unverifiable (stem absent in 詳解 text) — keep
                nanchor += 1
            elif abs(sp - page0) <= 1:
                verdict = "verified"            # two signals agree — keep, high confidence
                nver += 1
            else:
                disagreements.append({"id": qid, "file": fname, "anchorPage": page0,
                                      "stemPage": sp})
                ndis += 1
                continue  # signals conflict → exclude from map → agent adjudication
            page_map[qid] = {"file": fname, "page": page0, "v": verdict}
        per_booklet[f"{year}-{session}{book[-1]}"] = {
            "file": fname, "verified": nver, "anchorOnly": nanchor,
            "disagree": ndis, "suspect": bad, "notext": notext}

    manifest_ids = set(manifest.keys())
    corpus_ids = set(q["id"] for q in corpus)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    # committed artifact: TEXT questions only (figure questions stay authoritative in the
    # manifest with bbox-precise pages). Clean {file, page} (0-based), stable key order.
    ordered = {k: {"file": page_map[k]["file"], "page": page_map[k]["page"]}
               for k in sorted(page_map) if k not in manifest_ids}
    json.dump(ordered, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    text_resolved = set(page_map) - manifest_ids
    verified = sum(1 for k, v in page_map.items() if k not in manifest_ids and v["v"] == "verified")
    anchoronly = sum(1 for k, v in page_map.items() if k not in manifest_ids and v["v"] == "anchoronly")
    report = {
        "corpusTotal": len(corpus_ids),
        "figureMapped(manifest)": len(manifest_ids & corpus_ids),
        "textPageResolved(shipped)": len(text_resolved),
        "  ofWhich_doubleVerified": verified,
        "  ofWhich_anchorOnly": anchoronly,
        "combinedShippableCoverage": len((manifest_ids | set(page_map)) & corpus_ids),
        "excluded_disagree(agent)": len(disagreements),
        "excluded_suspect(agent)": len(suspects),
        "unresolved(agent/OCR)": len(corpus_ids - manifest_ids - set(page_map) - {d["id"] for d in disagreements} - {s["id"] for s in suspects}),
        "notextBooklets": sorted(set(notext_booklets)),
    }
    json.dump({"report": report, "perBooklet": per_booklet,
               "disagreements": disagreements, "suspects": suspects},
              open(os.path.join(os.path.dirname(args.out), "resolve-report.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("=== resolve_all_pages REPORT ===")
    for k, v in report.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
