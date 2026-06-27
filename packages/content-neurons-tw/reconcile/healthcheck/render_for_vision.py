#!/usr/bin/env python3
"""
Render ±WINDOW page bands (deduped) for the vision-pass suspects and emit per-booklet
agent briefs. Reads alignment_healthcheck_report.json; SKIPS the deterministic off-by-one
entries (handled separately). Pages render fine even for garbled-font booklets (104-2二),
so the vision agent reads the rendered image, not the broken text layer.

Output:
  /tmp/neurons-align-render/<booklet>/page-NNN.png  (NNN = 0-based page index)
  /tmp/neurons-align-render/briefs.json             (per-booklet question list)
"""
import json, os, re
import fitz
fitz.TOOLS.mupdf_display_errors(False)

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(HERE, "..", "..")
CORPUS = os.path.join(PKG, "data", "medexam-reconciled", "questions.json")
SOURCE_ROOT = os.path.expanduser("~/Desktop/國考/一階國考/陽明國考考古")
OUT = "/tmp/neurons-align-render"
WINDOW = 3
DPI = 120

# the 6 deterministic off-by-one ids (NOT rendered — fixed directly)
DETERMINISTIC = {
    "111-1-醫學一-生物化學-Q97", "107-1-醫學一-生物化學-Q86",
    "113-1-醫學一-生物化學-Q91", "113-1-醫學一-生理學-Q55",
    "113-1-醫學二-公共衛生學-Q40", "113-1-醫學二-病理學-Q83",
}


def booklet_key(fname):
    return re.sub(r"[^0-9一二]", "_", fname.replace(".pdf", ""))


def main():
    rep = json.load(open(os.path.join(HERE, "alignment_healthcheck_report.json"), encoding="utf-8"))
    corpus = {q["id"]: q for q in json.load(open(CORPUS, encoding="utf-8"))}
    os.makedirs(OUT, exist_ok=True)

    by_file = {}
    for e in rep:
        if not e.get("mapped") or e["id"] in DETERMINISTIC:
            continue
        by_file.setdefault(e["file"], []).append(e)

    briefs = []
    for fname, items in sorted(by_file.items()):
        bk = booklet_key(fname)
        bdir = os.path.join(OUT, bk)
        os.makedirs(bdir, exist_ok=True)
        doc = fitz.open(os.path.join(SOURCE_ROOT, fname))
        n = doc.page_count
        wanted = set()
        for e in items:
            for p in range(max(0, e["curPage0"] - WINDOW), min(n, e["curPage0"] + WINDOW + 1)):
                wanted.add(p)
        for p in sorted(wanted):
            out_png = os.path.join(bdir, f"page-{p:03d}.png")
            if not os.path.exists(out_png):
                doc[p].get_pixmap(dpi=DPI).save(out_png)
        qs = []
        for e in sorted(items, key=lambda x: corpus[x["id"]]["meta"]["qNumber"]):
            q = corpus[e["id"]]
            qs.append({
                "id": e["id"],
                "qNumber": q["meta"]["qNumber"],
                "subject": e["id"].split("-")[3] if len(e["id"].split("-")) > 3 else "",
                "currentPage0": e["curPage0"],
                "currentRun": e["curRun"],
                "stem": q.get("stem", ""),
                "options": q.get("options", q.get("choices")),
                "answer": q.get("answer"),
            })
        briefs.append({
            "booklet": bk, "file": fname, "renderDir": bdir,
            "pagesRendered": sorted(wanted), "pageCount": n, "questions": qs,
        })
        doc.close()
        print(f"{bk:<28} {len(qs):>2} Q  {len(wanted):>3} pages -> {bdir}")

    json.dump(briefs, open(os.path.join(OUT, "briefs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    total = sum(len(b["questions"]) for b in briefs)
    print(f"\n{len(briefs)} booklets, {total} questions, briefs.json written")


if __name__ == "__main__":
    main()
