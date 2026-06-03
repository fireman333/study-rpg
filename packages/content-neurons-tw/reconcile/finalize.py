"""Finalize dataset: hardcode 106-1 subject blocks (user-confirmed), emit app-schema artifacts.

Also bakes the 微生物暨免疫學 → 微生物學/免疫學 split into a `microImmune` field so the
content-neurons-tw build is self-contained in CI (no dependency on Desktop _extracted, which
was leaving the 免疫學 neuron family empty on every CI deploy).
"""
import json, os, re
from reconcile_all import reconcile_year
from reconcile import YM_ROOT

# User-confirmed 106-1 contiguous subject blocks (old grouping)
OLD_106_1 = {
    '醫學一': [(1, 28, '解剖學'), (29, 32, '胚胎學'), (33, 41, '組織學'),
              (42, 74, '微生物暨免疫學'), (75, 82, '寄生蟲學'), (83, 100, '公共衛生學')],
    '醫學二': [(1, 25, '生理學'), (26, 50, '生物化學'), (51, 76, '藥理學'), (77, 100, '病理學')],
}


def subject_106_1(book, qn):
    for a, b, s in OLD_106_1[book]:
        if a <= qn <= b:
            return s
    return None


# ── 微生物暨免疫學 → 微生物學 / 免疫學 split (baked, self-contained) ──
_micro_file_cache = {}


def _ym_micro_tag(year, session, qn):
    """Look up 陽明's per-Q `**科目**：` tag in the 微免 source file (modern years align by qNum)."""
    path = os.path.join(YM_ROOT, '醫學二', '微生物暨免疫學', f'{year}-{session}.md')
    if path not in _micro_file_cache:
        _micro_file_cache[path] = open(path, encoding='utf-8').read() if os.path.exists(path) else None
    content = _micro_file_cache[path]
    if not content:
        return None
    m = re.search(rf'^## Q{qn}\b', content, re.M)
    if not m:
        return None
    rest = content[m.start():]
    nxt = re.search(r'^## Q\d+', rest[1:], re.M)
    block = rest[: nxt.start() + 1] if nxt else rest
    tm = re.search(r'\*\*科目\*\*[：:]\s*(.+?)\r?$', block, re.M)
    return tm.group(1).strip() if tm else None


_IMMUNE_RE = re.compile(
    r'免疫|微免|抗體|抗原|[TB]\s*細胞|補體|過敏|移植|排斥|Treg|調節型T|輔助性T|Ig[EMGDA]|HLA|MHC|'
    r'淋巴球|細胞激素|interleukin|class\s*switch|FoxP3|TH17|naive|tumor antigen|自體免疫|疫苗')
_MICRO_RE = re.compile(r'微生物|微⽣物|細菌|病毒|桿菌|球菌|黴菌|真菌|孢子|披衣菌|prion|rabies|HIV|dengue|抗生素')


def micro_immune(year, session, book, qn, stem):
    """Return '微生物學' | '免疫學' for a 微生物暨免疫學 question. Self-contained at finalize time."""
    if (year, session) == (106, 1):
        # old-grouping paper: 微免 block = 醫學一 Q42-74; Q42-61 microbiology, Q62-74 immunology
        return '免疫學' if qn >= 62 else '微生物學'
    tag = _ym_micro_tag(year, session, qn)
    src = tag or stem
    if _IMMUNE_RE.search(src):
        return '免疫學'
    if _MICRO_RE.search(src):
        return '微生物學'
    return '微生物學'


SUBJECT_COLOR = {
    '解剖學': '#c44d4d', '生物化學': '#6a8c3f', '生理學': '#6a9bc4', '胚胎學': '#d4a04d',
    '組織學': '#a06ac4', '藥理學': '#c46a8c', '微生物暨免疫學': '#4d8cc4', '病理學': '#8c5a3f',
    '公共衛生學': '#5fa57e', '寄生蟲學': '#7a8c4d',
}
SUBJECT_GROUP = {  # modern canonical grouping (subjects.json `group`)
    '解剖學': '醫學一', '生物化學': '醫學一', '生理學': '醫學一', '胚胎學': '醫學一', '組織學': '醫學一',
    '藥理學': '醫學二', '微生物暨免疫學': '醫學二', '病理學': '醫學二', '公共衛生學': '醫學二', '寄生蟲學': '醫學二',
}
SOURCE_CREDIT = '考選部（試題與標準答案）+ 陽明國考考古題小組（詳解，CC-BY-NC）'


def main():
    all_recs = []
    for year in range(106, 115):
        recs, _ = reconcile_year(year)
        for r in recs:
            if (r['year'], r['sess']) == (106, 1):
                r['subject'] = subject_106_1(r['book'], r['qNum'])
                r['subjectSource'] = 'manual-block'
            r['id'] = f"{r['year']}-{r['sess']}-{r['book']}-{r['subject']}-Q{r['qNum']}"
        all_recs.extend(recs)

    # emit app-schema questions.json
    out_q = []
    for r in all_recs:
        rec = {
            'id': r['id'], 'subject': r['subject'], 'stem': r['stem'], 'options': r['options'],
            'answer': r['answer'], 'explanation': r['explanation'],
            'hasImage': r['hasImage'], 'hasOptionImages': False,
            'meta': {'year': r['year'], 'session': r['sess'], 'book': r['book'],
                     'paper': 'medexam-1' if r['book'] == '醫學一' else 'medexam-2',
                     'qNumber': r['qNum']},
            'sourceCredit': SOURCE_CREDIT,
        }
        acc = r.get('acceptedAnswers')
        if acc:
            if len(acc) >= 4:
                rec['disputed'] = True  # 一律給分 → reuse existing core field (any selection correct)
            else:
                rec['acceptedAnswers'] = acc  # 多選給分 → only the listed letters accepted
        if r['subject'] == '微生物暨免疫學':
            rec['microImmune'] = micro_immune(r['year'], r['sess'], r['book'], r['qNum'], r['stem'])
        out_q.append(rec)

    # subjects.json
    counts = {}
    for r in all_recs:
        counts[r['subject']] = counts.get(r['subject'], 0) + 1
    order = ['解剖學', '生理學', '生物化學', '組織學', '胚胎學',
             '微生物暨免疫學', '病理學', '藥理學', '公共衛生學', '寄生蟲學']
    out_s = [{'id': s, 'displayName': s, 'group': SUBJECT_GROUP[s], 'color': SUBJECT_COLOR[s],
              'iconKey': f'subject:{s}', 'totalQuestions': counts.get(s, 0)}
             for s in order if s in counts]

    # meta.json
    out_m = {
        'id': 'medexam-tw', 'displayName': '台灣一階醫師國考', 'locale': 'zh-TW',
        'builtAt': '2026-05-30T00:00:00.000Z',
        'sourceCredit': SOURCE_CREDIT,
        'sourceUrl': 'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx',
        'license': 'CC-BY-NC-4.0',
        'stats': {'totalQuestions': len(out_q), 'papers': 36, 'subjects': len(out_s),
                  'withExplanation': sum(1 for q in out_q if q['explanation'].strip()),
                  'gapsFilled': sum(1 for q in out_q if not q['explanation'].strip()),
                  'disputed': sum(1 for q in out_q if q.get('disputed')),
                  'multiAnswer': sum(1 for q in out_q if 'acceptedAnswers' in q)},
    }

    os.makedirs('out/artifacts', exist_ok=True)
    json.dump(out_q, open('out/artifacts/questions.json', 'w'), ensure_ascii=False)
    json.dump(out_s, open('out/artifacts/subjects.json', 'w'), ensure_ascii=False, indent=2)
    json.dump(out_m, open('out/artifacts/meta.json', 'w'), ensure_ascii=False, indent=2)
    print(f"questions={len(out_q)}  subjects={len(out_s)}")
    print('subject counts:', {s: counts[s] for s in order if s in counts})
    print('meta.stats:', json.dumps(out_m['stats'], ensure_ascii=False))
    # sanity: 106-1 Q74 should now be 微免
    q74 = next(q for q in out_q if q['id'].startswith('106-1-') and q['meta']['qNumber'] == 74 and q['meta']['book'] == '醫學一')
    print('106-1 醫一 Q74 →', q74['id'], '|', q74['subject'])


if __name__ == '__main__':
    main()
