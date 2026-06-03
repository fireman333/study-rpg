"""Audit committed 106-114 corpus for the same stem/option truncation bug.

Re-downloads 考選部 試題 (t=Q) for 106-114 per manifest, layout-parses each
(wrapped-line-safe), and compares to the committed corpus stems/options.
A question where the committed text is a strict prefix of (and shorter than)
the layout text = a production truncation.

Output: out/audit_106_114.json (per-question diffs) + console summary.
"""
from __future__ import annotations
import json, os, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from parse_moex_layout import parse_questions_layout

HERE = Path(__file__).parent
PDF = HERE / "pdf"
OUT = HERE / "out"
UA = "Mozilla/5.0"
REF = "https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx"
BASE = "https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx"


def norm(s: str) -> str:
    return "".join((s or "").split())


def dl(code, c, s, out):
    if os.path.exists(out) and os.path.getsize(out) > 5000:
        return out
    subprocess.run(["curl", "-skS", "-L", "--max-time", "90", "-A", UA, "-e", REF, "-o", out,
                    f"{BASE}?t=Q&code={code}&c={c}&s={s}&q=1"], capture_output=True)
    return out if os.path.exists(out) and os.path.getsize(out) > 5000 else None


def main():
    manifest = json.loads((HERE / "manifest.json").read_text())
    corpus = json.loads((HERE.parent / "data" / "medexam-reconciled" / "questions.json").read_text())
    # index committed corpus by (year,session,book,qNum)
    idx = {}
    for q in corpus:
        m = q["meta"]
        idx[(m["year"], m["session"], m["book"], m["qNumber"])] = q

    affected = []
    per_paper = {}
    for tag, mf in manifest.items():
        year, sess = int(tag.split("-")[0]), int(tag.split("-")[1])
        for bshort, book, skey in [("一", "醫學一", "s1"), ("二", "醫學二", "s2")]:
            ydir = PDF / str(year)
            ydir.mkdir(parents=True, exist_ok=True)
            out = str(ydir / f"{tag}_醫學{bshort}_試題.pdf")
            if dl(mf["code"], mf["c"], mf[skey], out) is None:
                print(f"  ! download failed {tag} 醫學{bshort}", flush=True)
                continue
            lay = parse_questions_layout(out)
            n_aff = 0
            for qn, lq in lay.items():
                cq = idx.get((year, sess, book, qn))
                if not cq:
                    continue
                # compare; flag where committed shorter AND a prefix (truncation signature)
                for field, lval, cval in [("stem", lq["stem"], cq["stem"])] + \
                        [(f"opt_{L}", lq["options"].get(L, ""), cq["options"].get(L, "")) for L in "ABCD"]:
                    ln, cn = norm(lval), norm(cval)
                    if ln != cn and len(cn) < len(ln) and ln.startswith(cn) and len(ln) - len(cn) > 3:
                        affected.append({"year": year, "session": sess, "book": book, "qNum": qn,
                                         "field": field, "committed_len": len(cn), "layout_len": len(ln),
                                         "committed": cval[:50], "layout_tail": lval[len(cval):len(cval)+40]})
                        n_aff += 1
            per_paper[f"{tag}-{book}"] = n_aff
            print(f"  {tag} {book}: {len(lay)}Q parsed, {n_aff} truncation(s)", flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "audit_106_114.json").write_text(json.dumps(affected, ensure_ascii=False, indent=2), encoding="utf-8")
    aff_q = {(a["year"], a["session"], a["book"], a["qNum"]) for a in affected}
    print(f"\n=== AUDIT SUMMARY ===")
    print(f"total truncated field-instances: {len(affected)} across {len(aff_q)} questions")
    bad_papers = {k: v for k, v in per_paper.items() if v > 0}
    print(f"papers with truncations: {len(bad_papers)} → {bad_papers}")


if __name__ == "__main__":
    main()
