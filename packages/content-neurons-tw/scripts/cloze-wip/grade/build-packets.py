# Grading packets from admitted.json (add-neurons-handout-cloze-corpus D6, task 4.5). Ported from
# study-rpg-2nd `_cloze-wip/grade-fanout/build-packets.py` (round 1) and `grade-r2/build-packets.py`
# (round 2). Re-run after every admit.mjs run.
#
#   python3 packages/content-neurons-tw/scripts/cloze-wip/grade/build-packets.py r1 [--size=60]
#       round 1 (quality): one packet per subject (split into chunks of <= size cards),
#       with that subject's numeric-contradiction listings → grade/r1-<subject>-<k>.packet.json
#   python3 packages/content-neurons-tw/scripts/cloze-wip/grade/build-packets.py r2 [--size=40]
#       round 2 (exam-aligned): every card + the <= 3 linked questions whose stem+options share the most
#       character bigrams with the card's bullet (stem, options, answer, acceptedAnswers,
#       optionExplanations) → grade/r2-<nn>.packet.json
#   --ids=<json array file>  only these cardIds (re-grade changed cards only, playbook 3.10)
#
# Grader instructions: prompt-r1.txt / prompt-r2.txt next to this file. Grades go to
# grade/grades-<packet>.json; validate each with check.py.
import collections, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WIP = os.path.dirname(HERE)
DIST = os.path.join(WIP, '..', '..', 'dist')

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
if not args or args[0] not in ('r1', 'r2'):
    sys.exit('usage: build-packets.py r1|r2 [--size=N] [--ids=<json file>]')
ROUND = args[0]
SIZE = int(opts.get('size', 60 if ROUND == 'r1' else 40))

d = json.load(open(os.path.join(WIP, 'admitted.json'), encoding='utf-8'))
cards = d['cards']
if 'ids' in opts:
    want = set(json.load(open(opts['ids'], encoding='utf-8')))
    missing = want - {c['card']['cardId'] for c in cards}
    if missing:
        sys.exit(f'--ids names {len(missing)} cardId(s) not in admitted.json: {sorted(missing)[:5]}')
    cards = [c for c in cards if c['card']['cardId'] in want]
if not cards:
    sys.exit('admitted.json has no cards to grade (run select → pick → admit first)')

for f in os.listdir(HERE):  # a stale packet from a previous run must not be graded again
    if f.startswith(ROUND + '-') and f.endswith('.packet.json'):
        os.remove(os.path.join(HERE, f))


stale = [c['card']['cardId'] for c in cards for h in c.get('hint', []) if h in c['face']]
if stale:  # a hint must render as 【…】 on the face (admit-lib maskFace); a visible one = stale admitted.json
    sys.exit(f'{len(stale)} card(s) show a hint phrase on the face (re-run admit.mjs): {stale[:5]}')


def base(c):
    return {'cardId': c['card']['cardId'], 'subjectId': c['subjectId'], 'heading': c['heading'], 'tier': c['tier'],
            'kind': c['card'].get('kind'), 'face': c['face'], 'answer': c['answer'], 'gloss': c['gloss'],
            # pick-v4 hint masks, listed apart from the gloss; the face shows both as 【…】 (design D7)
            'hint': c.get('hint', []),
            'sentence': c['sentence'], 'why': c['why']}


def chunks(xs, n):
    return [xs[i:i + n] for i in range(0, len(xs), n)] or [[]]


if ROUND == 'r1':
    bysub = collections.OrderedDict()
    for c in cards:
        bysub.setdefault(c['subjectId'], []).append(c)
    cons = collections.defaultdict(list)
    for i, c in enumerate(d.get('contradictions', [])):
        sub = c['file'].rsplit('/', 1)[-1].removesuffix('.json')
        cons[sub].append({'index': i, **c})
    for sub, cs in bysub.items():
        parts = chunks(cs, SIZE)
        for k, part in enumerate(parts, 1):
            g = f'r1-{sub}-{k}'
            pk = {'group': g, 'round': 'r1', 'contradictions': cons[sub] if k == 1 else [],
                  'cards': [{**base(c), 'linkedQuestionIds': c['card'].get('linkedQuestionIds', [])[:6]} for c in part]}
            json.dump(pk, open(os.path.join(HERE, f'{g}.packet.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            print(g, len(pk['cards']), 'cards', len(pk['contradictions']), 'contradictions')
else:
    Q = {q['id']: q for q in json.load(open(os.path.join(DIST, 'questions.json'), encoding='utf-8'))}

    def bg(s):
        s = ''.join(str(s).split()).lower()
        return {s[i:i + 2] for i in range(len(s) - 1)}

    def qtext(q):
        o = q['options']
        return q['stem'] + ' ' + (' '.join(o.values()) if isinstance(o, dict) else str(o))

    out, missing_q = [], 0
    for c in cards:
        S = bg(c['sentence'])
        scored = []
        for qid in c['card'].get('linkedQuestionIds', []):
            q = Q.get(qid)
            if not q:
                missing_q += 1
                continue
            scored.append((len(S & bg(qtext(q))) / max(1, len(S)), qid))
        scored.sort(key=lambda x: (-x[0], x[1]))
        qs = [{'id': qid, 'stem': Q[qid]['stem'][:400], 'options': Q[qid]['options'], 'answer': Q[qid]['answer'],
               'acceptedAnswers': Q[qid].get('acceptedAnswers'), 'optionExplanations': Q[qid].get('optionExplanations')}
              for _, qid in scored[:3]]
        out.append({**base(c), 'linkedQuestions': qs})
    if missing_q:
        print(f'WARNING: {missing_q} linked question id(s) not found in dist/questions.json', file=sys.stderr)
    for k, part in enumerate(chunks(out, SIZE), 1):
        g = f'r2-{k:02d}'
        json.dump({'group': g, 'round': 'r2', 'cards': part}, open(os.path.join(HERE, f'{g}.packet.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        print(g, len(part), 'cards', sorted({c['subjectId'] for c in part}))
    print('total', len(out), 'with >=1 linked question', sum(1 for c in out if c['linkedQuestions']))
