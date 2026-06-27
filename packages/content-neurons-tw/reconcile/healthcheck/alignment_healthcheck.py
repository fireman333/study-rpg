#!/usr/bin/env python3
"""
Alignment health-check for the 44 suspect base-map provenance entries flagged by the
owner's 44-PDF verification (handoff-neurons-pdf-provenance-alignment-2026-06-27).

For each suspect qid: build the merged 0-based page (same 5-source priority as
build-provenance-map.mjs), then open the PDF and compute the longest_stem_run of the
question's own 題目 stem on the current page and on every page in a ±WINDOW band.
An off-by-one shows up as: a neighbor page scores a much higher run than the current page.

Output: alignment_healthcheck_report.json + a human-readable table on stdout.
Does NOT modify any source — pure diagnosis.
"""
import json, os, re, sys
import fitz
fitz.TOOLS.mupdf_display_errors(False)

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(HERE, "..", "..")
CORPUS = os.path.join(PKG, "data", "medexam-reconciled", "questions.json")
PROV = os.path.join(PKG, "provenance")
SOURCE_ROOT = os.path.expanduser("~/Desktop/國考/一階國考/陽明國考考古")
WINDOW = 3

# 5 sources in builder priority (later wins). manifest is figure-only; load via its provenance shape.
MANIFEST = os.path.join(PKG, "explanation-figures", "manifest.json")

SUSPECTS = {
    "A_offbyone": [
        "106-1-醫學一-公共衛生學-Q93", "106-1-醫學一-公共衛生學-Q94",
        "106-1-醫學一-公共衛生學-Q95", "106-1-醫學一-公共衛生學-Q96",
        "106-1-醫學二-病理學-Q93", "106-1-醫學二-病理學-Q94",
        "107-2-醫學二-寄生蟲學-Q35", "108-1-醫學一-生理學-Q61",
        "108-1-醫學一-解剖學-Q9", "108-1-醫學二-病理學-Q84",
        "108-2-醫學二-微生物暨免疫學-Q17", "111-1-醫學一-生物化學-Q97",
    ],
    "B_garbled104_2": [
        "104-2-醫學二-生物化學-Q33", "104-2-醫學二-生物化學-Q34",
        "104-2-醫學二-生物化學-Q39", "104-2-醫學二-生物化學-Q50",
        "104-2-醫學二-生理學-Q8", "104-2-醫學二-生理學-Q12", "104-2-醫學二-生理學-Q23",
        "104-2-醫學二-病理學-Q76", "104-2-醫學二-病理學-Q99",
        "104-2-醫學二-藥理學-Q52", "104-2-醫學二-藥理學-Q57",
        "104-2-醫學二-藥理學-Q58", "104-2-醫學二-藥理學-Q71",
    ],
    "C_imagecard": [
        "106-1-醫學一-解剖學-Q5", "106-1-醫學一-解剖學-Q6", "106-1-醫學一-解剖學-Q8",
        "106-2-醫學一-組織學-Q46", "106-2-醫學一-胚胎學-Q33",
        "107-1-醫學一-生物化學-Q86",
        "107-2-醫學二-微生物暨免疫學-Q14", "107-2-醫學二-微生物暨免疫學-Q24",
        "107-2-醫學二-病理學-Q80", "108-2-醫學二-公共衛生學-Q46",
        "108-2-醫學二-病理學-Q34", "108-2-醫學二-藥理學-Q56",
        "110-1-醫學二-病理學-Q79", "113-1-醫學一-生物化學-Q91",
        "113-1-醫學一-生理學-Q55", "113-1-醫學二-公共衛生學-Q40",
        "113-1-醫學二-病理學-Q83", "113-2-醫學一-組織學-Q42",
        "114-1-醫學一-解剖學-Q17",
    ],
}


def _norm(s):
    return re.sub(r"\s+", "", s or "")


def longest_stem_run(stem, page_text):
    sn = _norm(stem)
    pn = _norm(page_text)
    for L in range(min(len(sn), 24), 4, -1):
        for st in range(0, min(len(sn) - L + 1, 40)):
            if sn[st:st + L] in pn:
                return L
    return 0


def build_merged():
    """Replicate build-provenance-map.mjs priority (0-based pages). Returns {qid:{file,page,src}}."""
    entries = {}
    # 1. manifest (figure), page = min provenance page (0-based)
    if os.path.exists(MANIFEST):
        man = json.load(open(MANIFEST, encoding="utf-8"))
        for qid, figs in man.items():
            pages, file = [], None
            for fig in (figs if isinstance(figs, list) else []):
                prov = fig.get("provenance") if isinstance(fig, dict) else None
                if prov and prov.get("page") is not None and prov.get("sourcePdf"):
                    pages.append(prov["page"]); file = prov["sourcePdf"]
            if file and pages:
                entries[qid] = {"file": file, "page": min(pages), "src": "manifest"}

    def fold(name, label, win_over=False):
        path = os.path.join(PROV, name)
        if not os.path.exists(path):
            return
        for qid, ent in json.load(open(path, encoding="utf-8")).items():
            if qid.startswith("__"):
                continue
            if not ent or not ent.get("file") or ent.get("page") is None:
                continue
            if (qid in entries) and not win_over:
                continue
            entries[qid] = {"file": ent["file"], "page": ent["page"], "src": label}

    fold("question-page-map.json", "base")
    fold("question-page-map-residual.json", "residual")
    fold("base-corrections.json", "baseCorr", win_over=True)
    fold("verified-overrides.json", "override", win_over=True)
    return entries


def main():
    corpus = json.load(open(CORPUS, encoding="utf-8"))
    stems = {q["id"]: q.get("stem", "") for q in corpus}
    merged = build_merged()

    doc_cache = {}

    def get_doc(fname):
        if fname not in doc_cache:
            doc_cache[fname] = fitz.open(os.path.join(SOURCE_ROOT, fname))
        return doc_cache[fname]

    report = []
    print(f"{'qid':<38} {'src':<9} {'curP':>4} {'curRun':>6} {'bestP':>5} {'bestRun':>7} verdict")
    print("-" * 95)
    for cat, ids in SUSPECTS.items():
        for qid in ids:
            ent = merged.get(qid)
            stem = stems.get(qid, "")
            if ent is None:
                print(f"{qid:<38} {'UNMAPPED':<9}")
                report.append({"cat": cat, "id": qid, "mapped": False})
                continue
            cur0 = ent["page"]
            doc = get_doc(ent["file"])
            n = doc.page_count
            runs = {}
            for p in range(max(0, cur0 - WINDOW), min(n, cur0 + WINDOW + 1)):
                runs[p] = longest_stem_run(stem, doc[p].get_text())
            cur_run = runs.get(cur0, 0)
            best_p = max(runs, key=lambda p: (runs[p], -abs(p - cur0)))
            best_run = runs[best_p]
            if cur_run >= 8 and best_p == cur0:
                verdict = "OK"
            elif best_run >= 8 and best_p != cur0:
                verdict = f"OFF-BY{best_p-cur0:+d}->p{best_p}"
            elif best_run >= 8 and best_p == cur0:
                verdict = "OK"
            else:
                verdict = "WEAK(vision)"  # no strong text run anywhere in window → likely image-card / garbled
            print(f"{qid:<38} {ent['src']:<9} {cur0:>4} {cur_run:>6} {best_p:>5} {best_run:>7} {verdict}")
            report.append({
                "cat": cat, "id": qid, "mapped": True, "file": ent["file"], "src": ent["src"],
                "curPage0": cur0, "curRun": cur_run, "bestPage0": best_p, "bestRun": best_run,
                "runs": runs, "verdict": verdict, "pageCount": n,
                "stem": stem[:60],
            })
    out = os.path.join(HERE, "alignment_healthcheck_report.json")
    json.dump(report, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # summary
    from collections import Counter
    vc = Counter(r.get("verdict", "UNMAPPED") for r in report)
    print("\n=== summary ===")
    for v, c in sorted(vc.items()):
        print(f"  {v:<24} {c}")
    print(f"\nreport → {out}")


if __name__ == "__main__":
    main()
