# Validate one grader output against its packet (task 4.5). Ported from study-rpg-2nd grade-fanout/ and
# grade-r2/ check.py. Usage:
#   python3 packages/content-neurons-tw/scripts/cloze-wip/grade/check.py <group>   (e.g. r1-胚胎學-1, r2-01)
# Reads grade/<group>.packet.json and grade/grades-<group>.json. Exit 1 on any problem.
# Rules: every packet card graded, no extra ids; grade ∈ good/ordinary/bad; medicalError is a bool;
# medicalError → bad; r2 examAlignment ∈ tested/related/not-tested/conflicts/no-question and
# conflicts → bad; leak ∈ none/synonym/contrast/restatement/elimination/arithmetic/heading (required,
# design D7); a non-empty reason; r1 answers every contradiction listing.
import json, os, sys

if len(sys.argv) != 2:
    sys.exit('usage: check.py <group>')
g = sys.argv[1]
D = os.path.dirname(os.path.abspath(__file__))
pk = json.load(open(os.path.join(D, f'{g}.packet.json'), encoding='utf-8'))
out = json.load(open(os.path.join(D, f'grades-{g}.json'), encoding='utf-8'))
r2 = pk.get('round') == 'r2'
LEAKS = ('none', 'synonym', 'contrast', 'restatement', 'elimination', 'arithmetic', 'heading')
bad = []
ids = {c['cardId'] for c in pk['cards']}
gr = out.get('grades', {})
for i in sorted(ids - set(gr)): bad.append(f'missing grade {i}')
for i in sorted(set(gr) - ids): bad.append(f'unknown cardId {i}')
for i, v in gr.items():
    if v.get('grade') not in ('good', 'ordinary', 'bad'): bad.append(f'{i}: grade must be good/ordinary/bad')
    if not isinstance(v.get('medicalError'), bool): bad.append(f'{i}: medicalError must be a bool')
    if v.get('medicalError') and v.get('grade') != 'bad': bad.append(f'{i}: medicalError must be graded bad')
    if r2:
        if v.get('examAlignment') not in ('tested', 'related', 'not-tested', 'conflicts', 'no-question'): bad.append(f'{i}: examAlignment')
        if v.get('examAlignment') == 'conflicts' and v.get('grade') != 'bad': bad.append(f'{i}: conflicts must be graded bad')
    if v.get('leak') not in LEAKS: bad.append(f'{i}: leak must be one of {"/".join(LEAKS)}')
    if not v.get('reason'): bad.append(f'{i}: empty reason')
for n, h in enumerate(out.get('handoutIssues', [])):
    for k in ('anchorId', 'sentence', 'problem'):
        if not h.get(k): bad.append(f'handoutIssues[{n}]: missing {k}')
if not r2:
    ci = {c['index'] for c in pk.get('contradictions', [])}
    cv = {c.get('index'): c for c in out.get('contradictions', [])}
    for i in sorted(ci - set(cv)): bad.append(f'missing contradiction verdict {i}')
    for i, c in cv.items():
        if c.get('verdict') not in ('not-a-contradiction', 'real'): bad.append(f'contradiction {i}: verdict must be not-a-contradiction/real')
print('\n'.join(bad))
print(f'{g}: {len(gr)}/{len(ids)} graded, {len(bad)} problem(s)')
sys.exit(1 if bad else 0)
