"""Generate AI explanations for 115-1 (no 陽明 詳解 exists).

Mirrors the 二階 explainer (bare `gemini` CLI, NEVER -y, grounded, concurrent,
per-Q cache, model fallback). Per question Gemini INDEPENDENTLY picks the answer
+ explains all 4 options + confidence. We then cross-check Gemini's pick against
the 考選部 authoritative answer; mismatch / low-confidence → flag list for owner.

Inputs:
  - 試題:  ~/Downloads/115020_{1301,2301}.pdf  (醫一 / 醫二, 100 Q each)
  - 標準答案: pdf/115/115-1_醫學{一,二}_答案.pdf  (t=S, clean, positional)
  - 更正:  pdf/115/115-1_醫學{一,二}_更正.pdf     (t=M; 醫二 has none)

Outputs (gitignored out/115/):
  - _cache/q<book><NNN>.json   per-Q Gemini result (resume-friendly)
  - 115_explanations.json      per-Q: subject, authoritative answer, rendered 詳解, provenance, gemini raw, verdict
  - 115_flags.json             low-confidence / answer-mismatch / verdict-count items for owner review

Usage:
  python generate_115.py [--limit N] [--concurrency 5] [--book 醫學一]
"""
from __future__ import annotations
import argparse, json, os, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from parse_moex import parse_answers
from parse_moex_layout import parse_questions_layout as parse_questions  # layout-aware: fixes wrapped-line truncation
from reconcile import parse_corrections

HERE = Path(__file__).parent
OUT = HERE / "out" / "115"
CACHE = OUT / "_cache"
PROMPT = (HERE / "115_prompt.md").read_text(encoding="utf-8")
DOWNLOADS = Path(os.path.expanduser("~/Downloads"))

GEMINI_BIN = "gemini"
GEMINI_TIMEOUT = 120
GEMINI_RETRY = 1
MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"]
QUOTA_RE = re.compile(r"\b(quota|429|RESOURCE_EXHAUSTED|rate[-_ ]?limit|exhausted)\b", re.I)
_FENCE_RE = re.compile(r"```(?:json)?\s*\n?(.*?)\n?```", re.DOTALL)

# Verified subject blocks (Phase 3, boundary-checked against actual stems).
SUBJECT_BLOCKS = {
    "醫學一": [(1, 31, "解剖學"), (32, 36, "胚胎學"), (37, 46, "組織學"),
              (47, 73, "生理學"), (74, 100, "生物化學")],
    "醫學二": [(1, 28, "微生物暨免疫學"), (29, 35, "寄生蟲學"), (36, 50, "公共衛生學"),
              (51, 75, "藥理學"), (76, 100, "病理學")],
}
BOOK_FILES = {
    "醫學一": ("115020_1301.pdf", "115-1_醫學一_答案.pdf", "115-1_醫學一_更正.pdf"),
    "醫學二": ("115020_2301.pdf", "115-1_醫學二_答案.pdf", "115-1_醫學二_更正.pdf"),
}
SOURCE_CREDIT = "考選部（試題與標準答案）+ AI 生成詳解（Gemini，未經陽明審定）"


def subject_of(book: str, qn: int) -> str:
    for a, b, s in SUBJECT_BLOCKS[book]:
        if a <= qn <= b:
            return s
    return "?"


def load_book(book: str) -> list[dict]:
    qf, af, mf = BOOK_FILES[book]
    qs = parse_questions(str(DOWNLOADS / qf))
    base = parse_answers(str(HERE / "pdf" / "115" / af))   # positional, clean
    corr = parse_corrections(str(HERE / "pdf" / "115" / mf))  # {} if none
    recs = []
    for qn in sorted(qs):
        auth = base[qn - 1] if qn - 1 < len(base) else "?"
        rec = {
            "q_num": qn, "book": book, "subject": subject_of(book, qn),
            "stem": qs[qn]["stem"], "options": qs[qn]["options"],
            "authoritative": auth, "disputed": False, "accepted_answers": None,
        }
        if qn in corr:
            kind, val = corr[qn]
            if kind == "all":
                rec["disputed"] = True
            elif kind == "multi":
                rec["accepted_answers"] = list(val)
        recs.append(rec)
    return recs


def build_prompt(rec: dict) -> str:
    o = rec["options"]
    block = (f"題號：Q{rec['q_num']}\n領域：{rec['subject']}\n題幹：{rec['stem']}\n"
             f"A. {o.get('A','_(缺)_')}\nB. {o.get('B','_(缺)_')}\n"
             f"C. {o.get('C','_(缺)_')}\nD. {o.get('D','_(缺)_')}\n")
    return (f"{PROMPT}\n\n---\n\n## 任務\n依題目產出 JSON。只輸出嚴格 JSON 到 stdout。\n\n{block}")


def parse_json(s: str) -> dict:
    s = s.strip()
    m = _FENCE_RE.search(s)
    if m:
        s = m.group(1).strip()
    a, b = s.find("{"), s.rfind("}")
    if a < 0 or b <= a:
        raise ValueError(f"no JSON: {s[:120]!r}")
    o = json.loads(s[a:b + 1])
    if "haiku_correct_option" in o and "gemini_correct_option" not in o:
        o["gemini_correct_option"] = o.pop("haiku_correct_option")
    return o


def call_gemini(prompt: str) -> tuple[str, str, int]:
    last = ("", "no models", -1)
    for model in MODELS:
        try:
            p = subprocess.run([GEMINI_BIN, "-m", model], input=prompt,
                               capture_output=True, text=True, timeout=GEMINI_TIMEOUT)
        except subprocess.TimeoutExpired:
            last = ("", f"timeout {model}", -1); continue
        if p.returncode == 0 and p.stdout.strip():
            return p.stdout, (p.stderr or "").strip(), 0
        if p.returncode != 0 and QUOTA_RE.search(p.stderr or ""):
            last = (p.stdout, (p.stderr or "").strip(), p.returncode); continue
        return p.stdout, (p.stderr or "").strip(), p.returncode
    return last


def run_one(rec: dict) -> tuple[str, str]:
    key = f"q{'1' if rec['book']=='醫學一' else '2'}{rec['q_num']:03d}"
    cpath = CACHE / f"{key}.json"
    if cpath.exists():
        try:
            if "error" not in json.loads(cpath.read_text(encoding="utf-8")):
                return key, "cached"
        except Exception:
            pass
    for attempt in range(GEMINI_RETRY + 1):
        out, err, rc = call_gemini(build_prompt(rec))
        if rc == 0 and out.strip():
            try:
                o = parse_json(out)
                cpath.write_text(json.dumps(o, ensure_ascii=False, indent=2), encoding="utf-8")
                return key, "OK"
            except Exception as e:
                err = f"bad_json: {e}"
        if attempt < GEMINI_RETRY:
            time.sleep(2)
    cpath.write_text(json.dumps({"q_num": rec["q_num"], "error": err[:200]}, ensure_ascii=False), encoding="utf-8")
    return key, f"FAIL: {err[:80]}"


def verify_and_render(rec: dict, g: dict) -> dict:
    auth = rec["authoritative"]
    pick = g.get("gemini_correct_option")
    flags = []
    if rec["disputed"]:
        status = "disputed"
    elif rec["accepted_answers"]:
        if pick not in rec["accepted_answers"]:
            flags.append(f"answer-mismatch(gemini={pick}, accepted={rec['accepted_answers']})")
        status = "multi"
    else:
        if pick != auth:
            flags.append(f"answer-mismatch(gemini={pick}, 考選部={auth})")
        status = "single"
    oc = g.get("overall_confidence")
    if oc in ("P4", "P5"):
        flags.append(f"low-confidence({oc})")
    n_correct = sum(1 for v in g.get("explanations", {}).values() if v.get("verdict") == "correct")
    if n_correct != 1:
        flags.append(f"verdict-count({n_correct})")
    # render shipped 詳解 (authoritative answer = 正解)
    head = f"正解：({auth})"
    if rec["disputed"]:
        head += "（本題一律給分）"
    elif rec["accepted_answers"]:
        head += f"（{'、'.join(rec['accepted_answers'])} 均給分）"
    lines = [head, ""]
    for L in "ABCD":
        e = g.get("explanations", {}).get(L, {})
        lines.append(f"({L}) {e.get('reason','')}")
    lines += ["", "（本詳解由 AI 生成，未經陽明審定）"]
    return {"explanation": "\n".join(lines), "flags": flags, "verify_status": status,
            "gemini_pick": pick, "overall_confidence": oc}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--concurrency", type=int, default=5)
    ap.add_argument("--book", default=None)
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)

    books = [args.book] if args.book else ["醫學一", "醫學二"]
    recs = [r for b in books for r in load_book(b)]
    if args.limit:
        recs = recs[:args.limit]
    print(f"[115] {len(recs)} questions, concurrency={args.concurrency}", flush=True)

    done = 0
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futs = {pool.submit(run_one, r): r for r in recs}
        for fut in as_completed(futs):
            done += 1
            key, status = fut.result()
            if done % 10 == 0 or status.startswith("FAIL"):
                print(f"  [{done}/{len(recs)}] {key} {status}", flush=True)
    print(f"[115] generation done: {done}/{len(recs)}", flush=True)

    # assemble + verify + render
    explanations, flagged = {}, []
    for r in recs:
        key = f"q{'1' if r['book']=='醫學一' else '2'}{r['q_num']:03d}"
        cpath = CACHE / f"{key}.json"
        if not cpath.exists():
            flagged.append({**_meta(r), "flags": ["missing-cache"]}); continue
        g = json.loads(cpath.read_text(encoding="utf-8"))
        if "error" in g:
            flagged.append({**_meta(r), "flags": [f"gen-error: {g['error'][:80]}"]}); continue
        v = verify_and_render(r, g)
        rid = f"115-1-{r['book']}-{r['subject']}-Q{r['q_num']}"
        explanations[rid] = {**_meta(r), **v, "gemini_raw": g, "sourceCredit": SOURCE_CREDIT,
                             "explanationSource": "ai-generated"}
        if v["flags"]:
            flagged.append({"id": rid, **_meta(r), "flags": v["flags"],
                            "gemini_pick": v["gemini_pick"], "stem": r["stem"][:60]})
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "115_explanations.json").write_text(json.dumps(explanations, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "115_flags.json").write_text(json.dumps(flagged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[115] explanations={len(explanations)} flagged={len(flagged)} → out/115/", flush=True)
    # flag breakdown
    from collections import Counter
    cat = Counter(f.split("(")[0] for it in flagged for f in it["flags"])
    print(f"[115] flag breakdown: {dict(cat)}", flush=True)


def _meta(r: dict) -> dict:
    return {"q_num": r["q_num"], "book": r["book"], "subject": r["subject"],
            "authoritative": r["authoritative"], "disputed": r["disputed"],
            "accepted_answers": r["accepted_answers"]}


if __name__ == "__main__":
    main()
