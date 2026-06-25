#!/usr/bin/env python3
"""Draft clean prose for the 29 image-tail questions (faithful: drops lines only).

For each qid: take the 詳解 part of `explanation` (after the Part-B 簡解 divider, if
any), drop (a) footer cruft and (b) contiguous runs of short scrambled fragments
(= the PDF-flattened table/figure that becomes the image / is unrecoverable), keep
the narrative prose. Output a DRAFT for human review — every kept line is verbatim
from the source (no fabrication). Writes /tmp/prose_drafts.json (qid -> {prose,
dropped}) + a readable /tmp/prose_drafts.txt.
"""
from __future__ import annotations
import json, os, re

PKG = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
QPATH = os.path.join(PKG, "data", "medexam-reconciled", "questions.json")
DIV = "────────────────"

# the 7 codex-confirmed TEXT (no image) + 22 IMAGE — all need clean prose either way
TEXT_IDS = {
    "104-2-醫學二-生物化學-Q35", "104-2-醫學二-生理學-Q25", "104-2-醫學二-生理學-Q4",
    "105-1-醫學一-解剖學-Q17", "108-1-醫學二-寄生蟲學-Q30",
    "110-1-醫學二-公共衛生學-Q41", "111-1-醫學一-解剖學-Q17",
}

FOOTER = [
    r"^\d{1,3}$", r"^醫學[一二]$", r"國立陽明", r"陽明醫學系", r"陽明交通大學",
    r"第\s*\d+\s*次.*醫師", r"醫師.*考試", r"年第.*次.*醫", r"^\s*參考資料\s*$",
    r"^https?://", r"^www\.", r"\.htm", r"[A-Za-z]?\d{2,3}\s*級$", r"^p\.?\d", r"PDF\s*p",
    r"^第[一二三四五六七八九十]+階段$",  # diagram stage labels
]
FOOTER_RE = [re.compile(p) for p in FOOTER]
SENT_PUNCT = set("。，：、！？；")
BULLET = re.compile(r"^\s*([•\-・]|[0-9]+[.)、]|[一二三四五六七八九十]+、|[IVXivx]+[.)]|[A-Za-z][.)]|[ivx]+[.)]|[（(][0-9A-Za-z][)）])")


def is_footer(s: str) -> bool:
    return any(r.search(s) for r in FOOTER_RE)


def is_fragment(s: str) -> bool:
    """Short scrambled cell-like line (table/figure debris)."""
    t = s.strip()
    if not t:
        return False
    if BULLET.match(t):
        return False
    if any(c in SENT_PUNCT for c in t):
        return False
    return len(t) <= 8


def clean_detail(det: str):
    lines = det.split("\n")
    n = len(lines)
    drop = [False] * n
    # 1) footers
    for i, ln in enumerate(lines):
        if is_footer(ln.strip()):
            drop[i] = True
    # 2) contiguous fragment runs (>=3) = table/figure debris
    i = 0
    while i < n:
        if is_fragment(lines[i]) and not drop[i]:
            j = i
            while j < n and (is_fragment(lines[j]) or not lines[j].strip()):
                j += 1
            # count real fragments in [i,j)
            frags = sum(1 for k in range(i, j) if lines[k].strip())
            if frags >= 3:
                for k in range(i, j):
                    drop[k] = True
            i = j
        else:
            i += 1
    kept = [lines[i] for i in range(n) if not drop[i]]
    dropped = [lines[i].strip() for i in range(n) if drop[i] and lines[i].strip()]
    # collapse blank runs in kept
    out = []
    for ln in kept:
        if not ln.strip() and (not out or not out[-1].strip()):
            continue
        out.append(ln.rstrip())
    prose = "\n".join(out).strip()
    return prose, dropped


def main():
    seg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_work", "segments-tail.json")
    ids = list(json.load(open(seg_path)).keys())
    qs = {q["id"]: q for q in json.load(open(QPATH))}
    drafts = {}
    txt = []
    for qid in ids:
        e = qs[qid].get("explanation", "") or ""
        det = e.split(DIV, 1)[1].strip() if (e.startswith("簡解：") and DIV in e) else e
        prose, dropped = clean_detail(det)
        drafts[qid] = {"prose": prose, "dropped": dropped, "kind": "TEXT" if qid in TEXT_IDS else "IMAGE"}
        txt.append(f"{'='*70}\n{qid}  [{drafts[qid]['kind']}]  (prose {len(prose)} chars / dropped {len(dropped)} lines)\n--- PROSE ---\n{prose}\n--- DROPPED ---\n{' | '.join(dropped[:40])}\n")
    json.dump(drafts, open("/tmp/prose_drafts.json", "w"), ensure_ascii=False, indent=1)
    open("/tmp/prose_drafts.txt", "w").write("\n".join(txt))
    nempty = sum(1 for d in drafts.values() if not d["prose"])
    print(f"drafted {len(drafts)} qids → /tmp/prose_drafts.json (+ .txt)")
    print(f"empty-prose drafts (need PDF reread): {nempty}")
    for qid, d in drafts.items():
        if not d["prose"]:
            print("  EMPTY:", qid)


if __name__ == "__main__":
    main()
