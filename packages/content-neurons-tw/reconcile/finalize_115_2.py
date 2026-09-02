"""Merge the 115-2 AI 詳解 into the base records and append them to the reconciled corpus.

Append-only and byte-safe: `questions.json` is a single-line array whose exact serialization
is `json.dumps(..., ensure_ascii=False, separators=(', ', ': '))`, so the 200 new records are
spliced in before the closing bracket and NOT a single existing byte is rewritten (a whole-file
`json.dump` would reflow all 4600 into a spurious diff). `subjects.json` / `meta.json` stats are
re-derived from the resulting corpus rather than hand-copied.

  python3 finalize_115_2.py [--apply]      # dry-run unless --apply
"""
from __future__ import annotations
import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / 'out' / '115-2'
DATA = HERE.parent / 'data' / 'medexam-reconciled'
QUESTIONS = DATA / 'questions.json'
SUBJECTS = DATA / 'subjects.json'
META = DATA / 'meta.json'

DUMP = dict(ensure_ascii=False, separators=(', ', ': '))
# Key order the corpus uses, so a 115-2 record is byte-shaped like every other one.
KEY_ORDER = ['id', 'subject', 'stem', 'options', 'answer', 'explanation', 'explanationSource',
             'hasImage', 'hasOptionImages', 'meta', 'sourceCredit',
             'disputed', 'acceptedAnswers', 'microImmune']


def ordered(rec: dict) -> dict:
    out = {k: rec[k] for k in KEY_ORDER if k in rec}
    extra = [k for k in rec if k not in out]
    if extra:
        raise ValueError(f'{rec["id"]}: unexpected key(s) {extra}')
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    base = json.loads((OUT / 'base.json').read_text(encoding='utf-8'))
    expl = json.loads((OUT / 'explanations.json').read_text(encoding='utf-8'))
    missing = [r['id'] for r in base if r['id'] not in expl]
    if missing:
        raise SystemExit(f'✗ {len(missing)} record(s) have no 詳解 — rerun generate_115_2.py: {missing[:10]}')

    raw = QUESTIONS.read_text(encoding='utf-8')
    corpus = json.loads(raw)
    if json.dumps(corpus, **DUMP) != raw:
        raise SystemExit('✗ questions.json is not in the expected single-line serialization — abort')
    existing = {q['id'] for q in corpus}

    new_recs = []
    for r in base:
        if r['id'] in existing:
            raise SystemExit(f'✗ {r["id"]} already in the corpus — 115-2 appears to be ingested already')
        e = expl[r['id']]
        text = (e.get('explanation') or '').strip()
        if len(text) < 40:
            raise SystemExit(f'✗ {r["id"]}: 詳解 is empty/too short — never ship a blank')
        rec = dict(r)
        rec['explanation'] = e['explanation']
        rec['explanationSource'] = 'ai-generated'
        new_recs.append(ordered(rec))

    merged = corpus + [json.loads(json.dumps(r, **DUMP)) for r in new_recs]
    stats = {
        'totalQuestions': len(merged),
        'papers': len({(q['meta']['year'], q['meta']['session'], q['meta']['book']) for q in merged}),
        'sittings': len({(q['meta']['year'], q['meta']['session']) for q in merged}),
        'subjects': len({q['subject'] for q in merged}),
        'withExplanation': sum(1 for q in merged if (q.get('explanation') or '').strip()),
        'aiGenerated': sum(1 for q in merged if q.get('explanationSource') == 'ai-generated'),
        'disputed': sum(1 for q in merged if q.get('disputed')),
        'multiAnswer': sum(1 for q in merged if len(q.get('acceptedAnswers') or []) > 1),
    }
    per_subject = Counter(q['subject'] for q in merged)
    subjects = json.loads(SUBJECTS.read_text(encoding='utf-8'))
    unknown = set(per_subject) - {s['id'] for s in subjects}
    if unknown:
        raise SystemExit(f'✗ subject(s) not in subjects.json: {sorted(unknown)}')
    for s in subjects:
        s['totalQuestions'] = per_subject[s['id']]

    meta = json.loads(META.read_text(encoding='utf-8'))
    meta['builtAt'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    meta['sourceCredit'] = (meta['sourceCredit'] + '；115-2 詳解為 AI 生成（未經陽明審定）'
                            if 'AI' not in meta['sourceCredit'] else meta['sourceCredit'])
    meta['stats'] = stats

    print(f'115-2 records to append: {len(new_recs)}')
    print(f'  corpus {len(corpus)} → {len(merged)}')
    print(f'  stats: {json.dumps(stats, ensure_ascii=False)}')
    print(f'  per-subject: {json.dumps(dict(sorted(per_subject.items())), ensure_ascii=False)}')
    flags = json.loads((OUT / 'flags.json').read_text(encoding='utf-8')) if (OUT / 'flags.json').exists() else []
    print(f'  explainer flags: {len(flags)}')
    if not args.apply:
        print('\n(dry run — pass --apply to write)')
        return

    tail = ', ' + ', '.join(json.dumps(r, **DUMP) for r in new_recs) + ']'
    QUESTIONS.write_text(raw[:-1] + tail, encoding='utf-8')
    check = json.loads(QUESTIONS.read_text(encoding='utf-8'))
    if len(check) != len(merged) or json.dumps(check[:len(corpus)], **DUMP) != json.dumps(corpus, **DUMP):
        raise SystemExit('✗ post-write verification failed — existing records were not left byte-identical')
    SUBJECTS.write_text(json.dumps(subjects, ensure_ascii=False, indent=2), encoding='utf-8')
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n✅ appended {len(new_recs)} records; {len(corpus)} existing records byte-identical')


if __name__ == '__main__':
    main()
