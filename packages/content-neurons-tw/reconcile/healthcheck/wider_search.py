#!/usr/bin/env python3
"""
Wider full-booklet + cross-booklet stem search for the vision agents' not-found qids.
The ±3 window misses two cases: (a) 陽明 card-order != qNumber so the real 詳解 is far
from the anchor, (b) cross-booklet mis-filing (e.g. 106-1 醫學一 公衛 詳解 printed inside
the 醫學二 PDF). For each not-found qid we scan EVERY page of BOTH the 醫學一 and 醫學二
booklets of its (year,session) and report the page with the longest verbatim stem run.

Usage: .venv-fitz/bin/python wider_search.py /tmp/neurons-align-render/notfound.jsonl
Pages 0-based. Reports candidates with run>=8 (authoritative).
"""
import json, os, re, sys
import fitz
fitz.TOOLS.mupdf_display_errors(False)

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(HERE, "..", "..")
CORPUS = os.path.join(PKG, "data", "medexam-reconciled", "questions.json")
SOURCE_ROOT = os.path.expanduser("~/Desktop/國考/一階國考/陽明國考考古")


def _norm(s):
    return re.sub(r"\s+", "", s or "")


def longest_stem_run(stem, page_text):
    sn, pn = _norm(stem), _norm(page_text)
    for L in range(min(len(sn), 30), 4, -1):
        for st in range(0, min(len(sn) - L + 1, 60)):
            if sn[st:st + L] in pn:
                return L
    return 0


def sibling_files(year, session):
    """Both 醫學一/醫學二 booklet filenames for a (year,session). Handles irregular names."""
    out = {}
    for f in os.listdir(SOURCE_ROOT):
        if not f.endswith(".pdf"):
            continue
        if not f.startswith(f"{year}-{session}"):
            continue
        if "醫學一" in f or "醫學(一)" in f:
            out.setdefault("一", f)
        elif "醫學二" in f or "醫學(二)" in f:
            out.setdefault("二", f)
    return out


def main():
    nf_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/neurons-align-render/notfound.jsonl"
    nf = [json.loads(l) for l in open(nf_path, encoding="utf-8") if l.strip()]
    corpus = {q["id"]: q for q in json.load(open(CORPUS, encoding="utf-8"))}

    doc_cache = {}

    def pages_text(fname):
        if fname not in doc_cache:
            d = fitz.open(os.path.join(SOURCE_ROOT, fname))
            doc_cache[fname] = [d[i].get_text() for i in range(d.page_count)]
            d.close()
        return doc_cache[fname]

    results = []
    for item in nf:
        qid = item["id"]
        q = corpus[qid]
        stem = q.get("stem", "")
        y, s = q["meta"]["year"], q["meta"]["session"]
        sib = sibling_files(y, s)
        best = {"file": None, "page0": None, "run": 0}
        per_file = {}
        for book, fname in sib.items():
            texts = pages_text(fname)
            bp, br = None, 0
            for p, t in enumerate(texts):
                r = longest_stem_run(stem, t)
                if r > br:
                    br, bp = r, p
            per_file[fname] = {"page0": bp, "run": br}
            if br > best["run"]:
                best = {"file": fname, "page0": bp, "run": br}
        verdict = "FOUND" if best["run"] >= 8 else ("WEAK" if best["run"] >= 5 else "ABSENT(vision/never-written)")
        print(f'{qid:<32} -> {verdict:<28} best {best["file"]} p{best["page0"]} run{best["run"]}')
        for f, r in per_file.items():
            print(f'      {f:<26} p{r["page0"]} run{r["run"]}')
        results.append({"id": qid, "stem": stem[:40], "best": best, "perFile": per_file, "verdict": verdict})

    out = os.path.join(HERE, "wider_search_report.json")
    json.dump(results, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\nreport -> {out}")


if __name__ == "__main__":
    main()
