# Merge grader outputs into scripts/cloze-wip/pilot-grades.json (playbook 3.10). Later files win per
# cardId, so pass round 1 first, then round 2, then re-grades:
#   python3 packages/content-neurons-tw/scripts/cloze-wip/grade/merge-grades.py grade/grades-r1-*.json grade/grades-r2-*.json
# The result is ALWAYS `grader: "agent-pregrade"` — it can never promote. Only the owner turns it into
# owner grades, by hand: set `"grader": "owner"` and `"adoptedFrom": "agent-pregrade"` (spec: the file
# records that agent grades were adopted). Cards graded before and not in these files are kept.
import glob, json, os, sys

WIP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = os.path.join(WIP, 'pilot-grades.json')
files = [f for a in sys.argv[1:] for f in sorted(glob.glob(a))]
if not files:
    sys.exit('usage: merge-grades.py <grades-*.json> ...')
prev = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {'grades': {}}
if prev.get('grader') == 'owner':
    sys.exit('pilot-grades.json is already owner-adopted; refusing to overwrite it with agent grades')
grades = dict(prev.get('grades', {}))
admitted = {c['card']['cardId'] for c in json.load(open(os.path.join(WIP, 'admitted.json'), encoding='utf-8'))['cards']}
for f in files:
    for cid, v in json.load(open(f, encoding='utf-8')).get('grades', {}).items():
        grades[cid] = {**v, 'from': os.path.basename(f)}
stale = sorted(set(grades) - admitted)
json.dump({'grader': 'agent-pregrade', 'grades': grades}, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(grades)} graded ({len(admitted - set(grades))} admitted cards ungraded; {len(stale)} graded ids no longer admitted) → {path}')
