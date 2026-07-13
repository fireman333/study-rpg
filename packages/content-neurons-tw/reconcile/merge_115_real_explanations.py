#!/usr/bin/env python3
"""Route-B targeted merge: replace 115-1 AI placeholder explanations with the REAL
陽明 詳解 now published (extracted to _extracted/醫學{一,二}/<subject>/115-1.md).

For each 115-1 question, matched by (meta.book, meta.qNumber):
  - if the extracted 陽明 詳解 body is substantive → set `explanation` = cleaned 詳解
    (body only; the 簡解 Key is prepended afterward by restore_jianjie_key.py),
    set `sourceCredit` to the 陽明 credit, and DROP the `explanationSource` tag.
  - if the question is an anchor-failed stub or has an empty 詳解 body → LEAVE the
    AI placeholder untouched (still `explanationSource: 'ai-generated'`); reported
    for a separate PDF-render recovery pass. NEVER blank, NEVER fabricate.

考選部 answer stays authoritative: a 陽明 詳解 whose extracted 答案 disagrees with the
baked answer is only FLAGGED (never changed).

Byte-safe single-line JSON write (json.dumps(list, ensure_ascii=False,
separators=(", ", ": ")) + round-trip count assert), mirrors restore_jianjie_key.py.

Usage:
    python reconcile/merge_115_real_explanations.py           # dry-run (report only)
    python reconcile/merge_115_real_explanations.py --apply   # rewrite questions.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

PKG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QPATH = os.path.join(PKG_DIR, "data", "medexam-reconciled", "questions.json")
REPORT = "/tmp/merge_115_report.json"

sys.path.insert(0, os.path.join(PKG_DIR, "reconcile"))
from reconcile import load_ym_paper, clean_explanation  # noqa: E402

YM_CREDIT = "考選部（試題與標準答案）+ 陽明國考考古題小組（詳解，CC-BY-NC）"
YEAR, SESS = 115, 1
BOOKS = ["醫學一", "醫學二"]
MIN_BODY = 8  # min whitespace-stripped 詳解-body length to count as substantive


def strip_ws(t: str) -> str:
    return re.sub(r"\s+", "", t or "")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    ym = {}  # (book, qn) -> ym record
    for book in BOOKS:
        for qn, rec in load_ym_paper(YEAR, SESS, book).items():
            ym[(book, qn)] = rec

    qs = json.loads(open(QPATH, encoding="utf-8").read())

    buckets = {"replaced": [], "stub": [], "empty_body": [], "no_match": [],
               "answer_mismatch": [], "already_real": []}
    changed = 0

    for q in qs:
        me = q["meta"]
        if not (me.get("year") == YEAR and me.get("session") == SESS):
            continue
        book = me["book"]; qn = me["qNumber"]; qid = q["id"]

        if q.get("explanationSource") != "ai-generated":
            buckets["already_real"].append(qid); continue

        rec = ym.get((book, qn))
        if rec is None:
            buckets["no_match"].append(qid); continue
        if rec.get("missing"):
            buckets["stub"].append(qid); continue

        body = clean_explanation(rec.get("explanation", ""))
        if len(strip_ws(body)) < MIN_BODY:
            buckets["empty_body"].append(qid); continue

        # Fact-gate: flag (do NOT change) a 陽明 answer that disagrees with the baked one.
        ym_ans = (rec.get("answer") or "").strip()
        if ym_ans and ym_ans != q.get("answer"):
            buckets["answer_mismatch"].append({"id": qid, "corpus": q.get("answer"), "ym": ym_ans})

        if args.apply:
            q["explanation"] = body.strip()
            q["sourceCredit"] = YM_CREDIT
            q.pop("explanationSource", None)
            changed += 1
        buckets["replaced"].append(qid)

    summary = {k: len(v) for k, v in buckets.items()}
    json.dump({"summary": summary, "buckets": buckets}, open(REPORT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print("=== merge 115-1 real 詳解 — %s ===" % ("APPLY" if args.apply else "DRY-RUN"))
    for k in ("replaced", "stub", "empty_body", "no_match", "answer_mismatch", "already_real"):
        print(f"  {k:16s}: {summary[k]}")
    if buckets["stub"]:
        print("  STUBS (anchor-failed):", buckets["stub"])
    if buckets["empty_body"]:
        print("  EMPTY-BODY (key-only?):", buckets["empty_body"])
    if buckets["answer_mismatch"]:
        print("  ⚠ ANSWER MISMATCH (flagged, NOT changed):")
        for m in buckets["answer_mismatch"]:
            print("     ", m)
    print(f"  report → {REPORT}")

    if args.apply:
        out = json.dumps(qs, ensure_ascii=False, separators=(", ", ": "))
        assert len(json.loads(out)) == len(qs), "round-trip count mismatch"
        with open(QPATH, "w", encoding="utf-8") as f:
            f.write(out)
        print(f"\n  ✍  wrote {changed} explanations → {QPATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
