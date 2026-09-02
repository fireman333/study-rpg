"""Generate AI 詳解 for 115-2 (陽明 has published no 詳解 for this sitting).

Same contract as `generate_115.py` — per question the model INDEPENDENTLY picks the answer
and explains all four options with a confidence grade, and we then cross-check its pick
against the 考選部 authoritative answer so a disagreement becomes a flag rather than a
silently shipped wrong 詳解. The shipped 詳解 always states the 考選部 answer, never the
model's.

Only the subprocess layer differs: `generate_115.py` shells out to the bare `gemini` CLI,
retired 2026-06-18. This one drives Gemini through `agy` (Antigravity CLI, headless, no API
key) and NEVER passes --dangerously-skip-permissions.

Input:  out/115-2/base.json  (ingest_115_2.py)
Output: out/115-2/_cache/<id>.json   per-question raw result (resume-friendly)
        out/115-2/explanations.json  rendered 詳解 + provenance + verdict
        out/115-2/flags.json         answer-mismatch / low-confidence / verdict-count

  python3 generate_115_2.py [--limit N] [--concurrency 4] [--book 醫學一]
"""
from __future__ import annotations
import argparse
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / 'out' / '115-2'
CACHE = OUT / '_cache'
PROMPT = (HERE / '115_prompt.md').read_text(encoding='utf-8')

AGY = os.path.expanduser('~/.local/bin/agy')
MODELS = ['Gemini 3.7 Flash (Medium)', 'Gemini 3.6 Flash (Medium)', 'Gemini 3.1 Pro (Low)']
TIMEOUT = 300
RETRY = 1
QUOTA_RE = re.compile(r'\b(quota|429|RESOURCE_EXHAUSTED|rate[-_ ]?limit|exhausted|unavailable)\b', re.I)
_FENCE_RE = re.compile(r'```(?:json)?\s*\n?(.*?)\n?```', re.DOTALL)
SOURCE_CREDIT = '考選部（試題與標準答案）+ AI 生成詳解（Gemini，未經陽明審定）'


def build_prompt(rec: dict) -> str:
    o = rec['options']
    block = (f"題號：Q{rec['meta']['qNumber']}\n領域：{rec['subject']}\n題幹：{rec['stem']}\n"
             f"A. {o.get('A', '_(缺)_')}\nB. {o.get('B', '_(缺)_')}\n"
             f"C. {o.get('C', '_(缺)_')}\nD. {o.get('D', '_(缺)_')}\n")
    return f'{PROMPT}\n\n---\n\n## 任務\n依題目產出 JSON。只輸出嚴格 JSON 到 stdout。\n\n{block}'


def parse_json(s: str) -> dict:
    s = s.strip()
    m = _FENCE_RE.search(s)
    if m:
        s = m.group(1).strip()
    a, b = s.find('{'), s.rfind('}')
    if a < 0 or b <= a:
        raise ValueError(f'no JSON: {s[:160]!r}')
    o = json.loads(s[a:b + 1])
    for legacy in ('haiku_correct_option', 'agy_correct_option', 'correct_option'):
        if legacy in o and 'gemini_correct_option' not in o:
            o['gemini_correct_option'] = o.pop(legacy)
    return o


def call_agy(prompt: str) -> tuple[str, str, int]:
    last = ('', 'no models', -1)
    for model in MODELS:
        try:
            p = subprocess.run([AGY, '-p', prompt, '--model', model, '--print-timeout', '240s'],
                               capture_output=True, text=True, timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            last = ('', f'timeout {model}', -1)
            continue
        if p.returncode == 0 and p.stdout.strip():
            return p.stdout, (p.stderr or '').strip(), 0
        if QUOTA_RE.search((p.stderr or '') + (p.stdout or '')):
            last = (p.stdout, (p.stderr or '').strip(), p.returncode)
            continue
        return p.stdout, (p.stderr or '').strip(), p.returncode
    return last


def run_one(rec: dict) -> tuple[str, str]:
    cpath = CACHE / f"{rec['id'].replace('/', '_')}.json"
    if cpath.exists():
        try:
            if 'error' not in json.loads(cpath.read_text(encoding='utf-8')):
                return rec['id'], 'cached'
        except Exception:
            pass
    err = 'unknown'
    for attempt in range(RETRY + 1):
        out, err_s, rc = call_agy(build_prompt(rec))
        err = err_s or 'empty stdout'
        if rc == 0 and out.strip():
            try:
                o = parse_json(out)
                cpath.write_text(json.dumps(o, ensure_ascii=False, indent=2), encoding='utf-8')
                return rec['id'], 'OK'
            except Exception as e:
                err = f'bad_json: {e}'
        if attempt < RETRY:
            time.sleep(3)
    cpath.write_text(json.dumps({'id': rec['id'], 'error': err[:300]}, ensure_ascii=False), encoding='utf-8')
    return rec['id'], f'FAIL: {err[:100]}'


def verify_and_render(rec: dict, g: dict) -> dict:
    auth = rec['answer']
    accepted = rec.get('acceptedAnswers')
    pick = g.get('gemini_correct_option')
    flags = []
    if rec.get('disputed'):
        status = 'disputed'
    elif accepted:
        status = 'multi'
        if pick not in accepted:
            flags.append(f'answer-mismatch(model={pick}, accepted={accepted})')
    else:
        status = 'single'
        if pick != auth:
            flags.append(f'answer-mismatch(model={pick}, 考選部={auth})')
    oc = g.get('overall_confidence')
    if oc in ('P4', 'P5'):
        flags.append(f'low-confidence({oc})')
    n_correct = sum(1 for v in (g.get('explanations') or {}).values() if v.get('verdict') == 'correct')
    if n_correct != 1:
        flags.append(f'verdict-count({n_correct})')

    head = f'正解：({auth})'
    if rec.get('disputed'):
        head += '（本題一律給分）'
    elif accepted:
        head += f"（{'、'.join(accepted)} 均給分）"
    lines = [head, '']
    for letter in 'ABCD':
        e = (g.get('explanations') or {}).get(letter) or {}
        lines.append(f"({letter}) {e.get('reason', '')}")
    lines += ['', '（本詳解由 AI 生成，未經陽明審定）']
    return {'explanation': '\n'.join(lines), 'flags': flags, 'verify_status': status,
            'model_pick': pick, 'overall_confidence': oc}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--concurrency', type=int, default=4)
    ap.add_argument('--book', default=None)
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)

    recs = json.loads((OUT / 'base.json').read_text(encoding='utf-8'))
    if args.book:
        recs = [r for r in recs if r['meta']['book'] == args.book]
    if args.limit:
        recs = recs[:args.limit]
    print(f'[115-2] {len(recs)} questions, concurrency={args.concurrency}', flush=True)

    done = 0
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futs = [pool.submit(run_one, r) for r in recs]
        for fut in as_completed(futs):
            done += 1
            qid, status = fut.result()
            if done % 10 == 0 or status.startswith('FAIL'):
                print(f'  [{done}/{len(recs)}] {qid} {status}', flush=True)
    print(f'[115-2] generation done: {done}/{len(recs)}', flush=True)

    explanations, flagged = {}, []
    for r in recs:
        cpath = CACHE / f"{r['id'].replace('/', '_')}.json"
        if not cpath.exists():
            flagged.append({'id': r['id'], 'flags': ['missing-cache']})
            continue
        g = json.loads(cpath.read_text(encoding='utf-8'))
        if 'error' in g:
            flagged.append({'id': r['id'], 'flags': [f"gen-error: {g['error'][:120]}"]})
            continue
        v = verify_and_render(r, g)
        explanations[r['id']] = {
            'id': r['id'], 'subject': r['subject'], 'authoritative': r['answer'],
            'disputed': bool(r.get('disputed')), 'acceptedAnswers': r.get('acceptedAnswers'),
            **v, 'raw': g, 'sourceCredit': SOURCE_CREDIT, 'explanationSource': 'ai-generated',
        }
        if v['flags']:
            flagged.append({'id': r['id'], 'subject': r['subject'], 'flags': v['flags'],
                            'model_pick': v['model_pick'], 'authoritative': r['answer'],
                            'stem': r['stem'][:70]})

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'explanations.json').write_text(json.dumps(explanations, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'flags.json').write_text(json.dumps(flagged, ensure_ascii=False, indent=2), encoding='utf-8')
    from collections import Counter
    cat = Counter(f.split('(')[0] for it in flagged for f in it['flags'])
    print(f'[115-2] explanations={len(explanations)} flagged={len(flagged)} → {OUT}')
    print(f'[115-2] flag breakdown: {dict(cat)}', flush=True)


if __name__ == '__main__':
    main()
