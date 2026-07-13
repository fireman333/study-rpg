#!/usr/bin/env python3
"""Restore the dropped 簡解 (### Key) section into each question's explanation.

Root cause: reconcile.py builds `explanation` from only `### 詳解`, dropping the
`### Key` section (陽明 author's 答題要訣 / 簡解 / 關鍵字) that the .md parser already
captured into `secs`. This script repairs the CURRENT hand-maintained
`data/medexam-reconciled/questions.json` in place via a targeted by-id merge —
it NEVER re-runs reconcile_all.py (that would wipe prior hand fixes) and NEVER
touches `id` / `answer`.

Format (owner-decided 2026-06-25): prepend a 簡解 block above the existing 詳解,
separated by a divider line:

    簡解：
    <Key text>

    ────────────────

    <existing explanation>

Idempotent: a question whose explanation already starts with the 簡解 sentinel, or
already contains the full Key text, is left untouched.

Exclusions: 107-1, 108-2 (source has no independent Key). 104/105 use a different
parser and have no `### Key` → auto-skipped. Any question still tagged
`explanationSource: 'ai-generated'` is skipped too, so a 陽明 Key is never
prepended onto an AI placeholder (e.g. the 6 × 115-1 questions 陽明 never wrote).

Usage:
    python reconcile/restore_jianjie_key.py            # dry-run (writes /tmp report only)
    python reconcile/restore_jianjie_key.py --apply    # rewrite questions.json in place
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from collections import Counter

PKG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QPATH = os.path.join(PKG_DIR, "data", "medexam-reconciled", "questions.json")
YM_ROOT = os.path.expanduser("~/Desktop/國考/一階國考/陽明國考考古/_extracted")
REPORT = "/tmp/restore_jianjie_report.json"

SENTINEL = "簡解："
DIVIDER = "────────────────"  # 16 × U+2500
EXCLUDE_YS = {("107", "1"), ("108", "2")}
# 內容為空 / 純標點 / 「見詳解」式的退化 Key — 還原無意義，跳過
NOISE_KEYS = {"見詳解", "無", "見上", "同上", "略", "見補充", "詳解"}

sys.path.insert(0, os.path.join(PKG_DIR, "reconcile"))
from reconcile import BOOK_SUBJECTS  # noqa: E402


def norm(t: str) -> str:
    return unicodedata.normalize("NFKC", t)


def strip_ws(t: str) -> str:
    return re.sub(r"\s+", "", t)


def is_noise_key(key: str) -> bool:
    s = key.strip()
    if s in NOISE_KEYS:
        return True
    # no CJK and no meaningful latin word left after stripping list-markers/punct/digits
    core = re.sub(r"[\s\d.\-−、,，。:：;；()（）]", "", s)
    return len(core) == 0


def parse_keys(path: str) -> dict:
    """qn -> {key, is_last} for one source .md file."""
    raw = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    body = m.group(2) if m else raw
    blocks = re.split(r"(?m)^## Q(\d+)\s*$", body)
    out = {}
    n = len(blocks)
    for i in range(1, n, 2):
        qn = int(blocks[i])
        content = blocks[i + 1]
        is_last = (i + 2) >= n
        secs: dict[str, list[str]] = {}
        cur = None
        for line in content.split("\n"):
            hm = re.match(r"^### (.+?)\s*$", line)
            if hm:
                cur = hm.group(1)
                secs.setdefault(cur, [])
            elif cur is not None:
                secs[cur].append(line)
        key = "\n".join(secs.get("Key", [])).strip()
        out[qn] = {"key": key, "is_last": is_last}
    return out


def build_source_index() -> dict:
    """(book, year, sess, qn) -> {key, is_last}."""
    src = {}
    for book, subs in BOOK_SUBJECTS.items():
        for subj in subs:
            d = os.path.join(YM_ROOT, book, subj)
            if not os.path.isdir(d):
                continue
            for fn in os.listdir(d):
                mm = re.match(r"(\d+)-(\d+)\.md$", fn)
                if not mm:
                    continue
                year, sess = mm.group(1), mm.group(2)
                for qn, info in parse_keys(os.path.join(d, fn)).items():
                    if info["key"]:
                        src[(book, year, sess, qn)] = info
    return src


def make_explanation(key: str, exp: str) -> str:
    return f"{SENTINEL}\n{key}\n\n{DIVIDER}\n\n{exp}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="rewrite questions.json in place")
    args = ap.parse_args()

    if not os.path.isdir(YM_ROOT):
        print(f"FATAL: source root not found: {YM_ROOT}")
        return 1

    src = build_source_index()
    raw = open(QPATH, encoding="utf-8").read()
    qs = json.loads(raw)

    buckets = {k: [] for k in ("prepend", "reformatted", "already_sentinel",
                               "already_contains", "excluded", "no_key",
                               "noise_skip", "ambiguous", "ai_skip")}
    by_ys = Counter()
    changed = 0
    detail_label_re = re.compile(r"\n+詳解：\n?")

    for q in qs:
        me = q["meta"]
        year = str(me["year"]); sess = str(me["session"])
        book = me["book"]; qn = me["qNumber"]; qid = q["id"]
        ys = (year, sess)

        if ys in EXCLUDE_YS:
            buckets["excluded"].append(qid); continue
        # Never prepend a 陽明 Key onto an AI placeholder explanation.
        if q.get("explanationSource") == "ai-generated":
            buckets["ai_skip"].append(qid); continue
        info = src.get((book, year, sess, qn))
        if not info:
            buckets["no_key"].append(qid); continue

        key = norm(info["key"]).strip()
        exp = q.get("explanation") or ""

        # Already has a 簡解 block. If it uses the old 「詳解：」 label and no divider,
        # reformat to the canonical divider format; otherwise leave it.
        if exp.lstrip().startswith(SENTINEL):
            if DIVIDER not in exp and detail_label_re.search(exp):
                buckets["reformatted"].append(qid)
                if args.apply:
                    q["explanation"] = detail_label_re.sub(f"\n\n{DIVIDER}\n\n", exp, count=1)
                    changed += 1
            else:
                buckets["already_sentinel"].append(qid)
            continue
        # Long key already embedded verbatim in 詳解 → don't duplicate (short keys
        # are too collision-prone to trust as a containment signal).
        if len(strip_ws(key)) >= 8 and strip_ws(key) in strip_ws(norm(exp)):
            buckets["already_contains"].append(qid); continue
        # Degenerate Key (empty / punctuation / 「見詳解」) → nothing worth restoring
        if is_noise_key(key):
            buckets["noise_skip"].append({"id": qid, "key": key}); continue
        # Pooled-note bleed: Key references ≥2 other question numbers
        if len(re.findall(r"Q\s*\d+", key)) >= 2:
            buckets["ambiguous"].append({"id": qid, "why": "multi-qref", "key": key[:80]}); continue

        buckets["prepend"].append({"id": qid, "key_len": len(key), "is_last": info["is_last"]})
        if args.apply:
            q["explanation"] = make_explanation(key, exp)
        by_ys[f"{year}-{sess}"] += 1
        changed += 1

    summary = {k: len(v) for k, v in buckets.items()}
    summary["total_questions"] = len(qs)
    summary["by_year_session_prepend"] = dict(sorted(by_ys.items()))
    json.dump({"summary": summary, "buckets": buckets}, open(REPORT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print("=== restore 簡解 (### Key) — %s ===" % ("APPLY" if args.apply else "DRY-RUN"))
    for k in ("prepend", "reformatted", "already_sentinel", "already_contains",
              "noise_skip", "ambiguous", "excluded", "no_key", "ai_skip"):
        print(f"  {k:18s}: {summary[k]}")
    print(f"  total questions   : {summary['total_questions']}")
    print(f"\n  by year-session (prepend):")
    for k, v in summary["by_year_session_prepend"].items():
        print(f"    {k:8s}: {v}")
    print(f"\n  report → {REPORT}")

    if args.apply:
        out = json.dumps(qs, ensure_ascii=False, separators=(", ", ": "))
        assert len(json.loads(out)) == len(qs), "round-trip count mismatch"
        with open(QPATH, "w", encoding="utf-8") as f:
            f.write(out)
        print(f"\n  ✍  wrote {changed} explanations → {QPATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
