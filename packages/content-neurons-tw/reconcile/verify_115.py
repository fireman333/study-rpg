"""Cross-model adversarial verification of the 115 AI explanations.

A DIFFERENT model (gemini-2.5-flash critic, vs the gemini-3-flash generator)
reads each question + 考選部 authoritative answer + the generated per-option
reasons and HUNTS for errors (wrong answer, wrong mechanism, reversed direction,
misleading claims). Only confident errors are reported (minimize false positives).
Output is a real flag list for owner review (and Claude adjudication of flags).

Reuses generate_115's question loading + cache discipline.

Usage: python verify_115.py [--limit N] [--concurrency 5]
"""
from __future__ import annotations
import argparse, json, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generate_115 import load_book, OUT, _FENCE_RE  # reuse loaders + paths

VOUT = OUT / "_verify_cache"
CRITIC_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"]  # cross-model vs 3-flash generator
GEMINI_TIMEOUT = 120
QUOTA_RE = re.compile(r"\b(quota|429|RESOURCE_EXHAUSTED|rate[-_ ]?limit|exhausted)\b", re.I)

CRITIC_PROMPT = """你是台灣醫師一階國考（基礎醫學）的嚴格審稿者。下面給你一題單選題、考選部標準答案、以及一份 AI 生成的逐選項詳解。你的任務是「挑錯」：先自己獨立判斷，再檢查這份詳解有無錯誤。

檢查項目：
1. 考選部標準答案在醫學上是否真的成立？（若你「強烈」認為標準答案本身有誤，answer_ok=false）
2. 每個選項的詳解 reason 是否有事實錯誤、機轉講錯、方向講反、張冠李戴、或會誤導醫學生？
3. 注意「何者錯誤 / 最不適當」型題目：正解是「錯誤的敘述」，詳解應說明該選項為何錯。

只回報你「有把握」的錯誤。寧可漏報模糊的，也不要製造假陽性（詳解只是寫法不同、但醫學上正確 → 視為 sound）。

輸出嚴格 JSON（不要 code fence、不要前後敘述）：
{"verdict":"sound"|"has_issues","answer_ok":true|false,"issues":[{"option":"A|B|C|D|answer","problem":"具體錯在哪，<=80字"}],"severity":"P1|P2|P3|P4|P5"}

severity：P1=會誤導/答案錯（最嚴重）… P5=輕微。verdict=sound 時 issues=[] 且 severity=P5。"""


def critic_block(rec: dict, expl: dict) -> str:
    o = rec["options"]
    g = expl["gemini_raw"]["explanations"]
    auth = rec["authoritative"]
    note = ""
    if rec["disputed"]:
        note = "（本題一律給分）"
    elif rec["accepted_answers"]:
        note = f"（{'、'.join(rec['accepted_answers'])} 均給分）"
    lines = [f"題幹：{rec['stem']}"]
    for L in "ABCD":
        lines.append(f"{L}. {o.get(L,'_(缺)_')}")
    lines.append(f"\n考選部標準答案：{auth} {note}")
    lines.append("\nAI 詳解（逐選項）：")
    for L in "ABCD":
        lines.append(f"({L}) {g.get(L,{}).get('reason','')}")
    return "\n".join(lines)


def call_critic(prompt: str) -> tuple[str, str, int]:
    last = ("", "no models", -1)
    for model in CRITIC_MODELS:
        try:
            p = subprocess.run(["gemini", "-m", model], input=prompt,
                               capture_output=True, text=True, timeout=GEMINI_TIMEOUT)
        except subprocess.TimeoutExpired:
            last = ("", f"timeout {model}", -1); continue
        if p.returncode == 0 and p.stdout.strip():
            return p.stdout, "", 0
        if p.returncode != 0 and QUOTA_RE.search(p.stderr or ""):
            last = (p.stdout, (p.stderr or "").strip(), p.returncode); continue
        return p.stdout, (p.stderr or "").strip(), p.returncode
    return last


def parse_json(s: str) -> dict:
    s = s.strip()
    m = _FENCE_RE.search(s)
    if m:
        s = m.group(1).strip()
    a, b = s.find("{"), s.rfind("}")
    if a < 0 or b <= a:
        raise ValueError("no json")
    return json.loads(s[a:b + 1])


def run_one(rec: dict, expl: dict) -> tuple[str, str]:
    key = f"q{'1' if rec['book']=='醫學一' else '2'}{rec['q_num']:03d}"
    cpath = VOUT / f"{key}.json"
    if cpath.exists():
        try:
            if "error" not in json.loads(cpath.read_text(encoding="utf-8")):
                return key, "cached"
        except Exception:
            pass
    prompt = CRITIC_PROMPT + "\n\n---\n\n" + critic_block(rec, expl)
    for attempt in range(2):
        out, err, rc = call_critic(prompt)
        if rc == 0 and out.strip():
            try:
                cpath.write_text(json.dumps(parse_json(out), ensure_ascii=False, indent=2), encoding="utf-8")
                return key, "OK"
            except Exception as e:
                err = f"bad_json: {e}"
        if attempt < 1:
            time.sleep(2)
    cpath.write_text(json.dumps({"error": err[:200]}, ensure_ascii=False), encoding="utf-8")
    return key, f"FAIL: {err[:80]}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--concurrency", type=int, default=5)
    args = ap.parse_args()
    VOUT.mkdir(parents=True, exist_ok=True)
    expls = json.loads((OUT / "115_explanations.json").read_text(encoding="utf-8"))
    recs = [r for b in ["醫學一", "醫學二"] for r in load_book(b)]
    pairs = []
    for r in recs:
        rid = f"115-1-{r['book']}-{r['subject']}-Q{r['q_num']}"
        if rid in expls:
            pairs.append((r, expls[rid]))
    if args.limit:
        pairs = pairs[:args.limit]
    print(f"[verify] {len(pairs)} questions, critic={CRITIC_MODELS[0]}, concurrency={args.concurrency}", flush=True)

    done = 0
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futs = {pool.submit(run_one, r, e): r for r, e in pairs}
        for fut in as_completed(futs):
            done += 1
            key, status = fut.result()
            if done % 20 == 0 or status.startswith("FAIL"):
                print(f"  [{done}/{len(pairs)}] {key} {status}", flush=True)

    # aggregate flags
    flagged = []
    from collections import Counter
    sev = Counter()
    for r, e in pairs:
        key = f"q{'1' if r['book']=='醫學一' else '2'}{r['q_num']:03d}"
        cpath = VOUT / f"{key}.json"
        if not cpath.exists():
            continue
        v = json.loads(cpath.read_text(encoding="utf-8"))
        if "error" in v:
            flagged.append({"id": f"115-1-{r['book']}-{r['subject']}-Q{r['q_num']}",
                            "subject": r["subject"], "critic_error": v["error"]})
            continue
        if v.get("verdict") == "has_issues" or v.get("answer_ok") is False:
            sev[v.get("severity", "?")] += 1
            flagged.append({
                "id": f"115-1-{r['book']}-{r['subject']}-Q{r['q_num']}",
                "subject": r["subject"], "authoritative": r["authoritative"],
                "answer_ok": v.get("answer_ok"), "severity": v.get("severity"),
                "issues": v.get("issues", []), "stem": r["stem"][:70],
            })
    flagged.sort(key=lambda x: (x.get("severity", "P9"), x["id"]))
    (OUT / "115_verify_flags.json").write_text(json.dumps(flagged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[verify] flagged {len(flagged)}/{len(pairs)} | severity: {dict(sev)} → out/115/115_verify_flags.json", flush=True)


if __name__ == "__main__":
    main()
