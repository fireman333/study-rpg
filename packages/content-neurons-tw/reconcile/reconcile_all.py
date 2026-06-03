"""Unified reconciler: 考選部 authoritative + 陽明 詳解 → clean dataset for one year.

Strategy per 考選部 question (book, qNum):
  1. qNum-direct: 陽明 question at same (book, qNum); accept if sim>=0.55 (modern-grouping years).
  2. content fallback: best-sim 陽明 question in the year-session pool (handles old grouping / drift).
  3. gap: no 陽明 match -> empty 詳解; subject inferred from neighbouring block.

id = {year}-{sess}-{考選部 book}-{subject}-Q{qNum}  (true exam coordinate)
answer = 考選部 standard answer (S); acceptedAnswers from 更正答案 (M).
explanation = cleaned 陽明 詳解.
"""
import os, sys, re, json
from reconcile import (parse_ym_md, norm, sim, clean_explanation, parse_corrections,
                       YM_ROOT, BOOK_SUBJECTS)
from parse_moex import parse_questions, parse_answers

MATCH_THRESHOLD = 0.55


def load_ym_pool(year, sess):
    """All 陽明 non-missing questions for a year-session, tagged with book/subject/qn."""
    pool = []
    for book, subs in BOOK_SUBJECTS.items():
        for subj in subs:
            p = os.path.join(YM_ROOT, book, subj, f'{year}-{sess}.md')
            if not os.path.exists(p):
                continue
            _, qs = parse_ym_md(p)
            for qn, q in qs.items():
                if q.get('missing'):
                    continue
                pool.append({'book': book, 'subject': subj, 'qn': qn, 'stem': q['stem'],
                             'answer': q['answer'], 'explanation': q['explanation'],
                             'norm': norm(q['stem'])})
    return pool


def load_moex(year, sess, bshort):
    base = f'pdf/{year}/{year}-{sess}_醫學{bshort}'
    if not os.path.exists(base + '_試題.pdf'):
        return None
    mq = parse_questions(base + '_試題.pdf')
    ma = parse_answers(base + '_答案.pdf')
    corr = parse_corrections(base + '_更正答案.pdf') if os.path.exists(base + '_更正答案.pdf') else {}
    return mq, ma, corr


def reconcile_session(year, sess, pool, used):
    """Return list of reconciled records for both books of one session."""
    records = []
    # quick index for qNum-direct lookup
    by_key = {}
    for i, q in enumerate(pool):
        by_key.setdefault((q['book'], q['qn']), []).append(i)

    for bshort, book in [('一', '醫學一'), ('二', '醫學二')]:
        loaded = load_moex(year, sess, bshort)
        if not loaded:
            continue
        mq, ma, corr = loaded
        recs_this_book = []
        for qn in sorted(mq):
            stem = mq[qn]['stem']
            nstem = norm(stem)
            official = ma[qn - 1] if qn - 1 < len(ma) else '?'
            # 1. qNum-direct
            match_i, match_s, mode = None, -1.0, ''
            for i in by_key.get((book, qn), []):
                if used[i]:
                    continue
                s = sim(stem, pool[i]['stem'])
                if s > match_s:
                    match_s, match_i = s, i
            if match_i is not None and match_s >= MATCH_THRESHOLD:
                mode = 'qnum'
            else:
                # 2. content fallback over whole pool
                best_i, best_s = None, -1.0
                for i, q in enumerate(pool):
                    if used[i]:
                        continue
                    s = sim(stem, q['stem'])
                    if s > best_s:
                        best_s, best_i = s, i
                if best_i is not None and best_s >= MATCH_THRESHOLD:
                    match_i, match_s, mode = best_i, best_s, 'content'
                else:
                    match_i, match_s, mode = None, best_s, 'gap'
            # build record
            subject = None
            explanation = ''
            if match_i is not None:
                used[match_i] = True
                subject = pool[match_i]['subject']
                explanation = clean_explanation(pool[match_i]['explanation'])
            # answer + acceptedAnswers
            accepted = None
            if qn in corr:
                kind, val = corr[qn]
                accepted = list('ABCD') if kind == 'all' else list(val)
            answer = official if official in 'ABCDE' else (accepted[0] if accepted else '?')
            recs_this_book.append({
                'year': year, 'sess': sess, 'book': book, 'qNum': qn,
                'subject': subject, 'stem': stem, 'options': mq[qn]['options'],
                'answer': answer, 'acceptedAnswers': accepted,
                'explanation': explanation,
                'hasImage': bool(re.search(r'[下如附本左右上]圖|圖[示中所]|如下圖', stem)),
                'matchMode': mode, 'matchSim': round(match_s, 2),
            })
        # infer subjects for gaps from neighbouring block (same book)
        last_subj = None
        for r in recs_this_book:
            if r['subject']:
                last_subj = r['subject']
            else:
                r['subject'] = last_subj  # fill from previous; back-fill below
        nxt = None
        for r in reversed(recs_this_book):
            if r['matchMode'] != 'gap' and r['subject']:
                nxt = r['subject']
            elif r['subject'] is None:
                r['subject'] = nxt
        records.extend(recs_this_book)
    return records


def reconcile_year(year):
    all_recs = []
    stats = {'total': 0, 'qnum': 0, 'content': 0, 'gap': 0, 'corrections': 0,
             'exp_present': 0, 'exp_empty': 0, 'low_conf': []}
    for sess in [1, 2]:
        pool = load_ym_pool(year, sess)
        used = [False] * len(pool)
        recs = reconcile_session(year, sess, pool, used)
        for r in recs:
            r['id'] = f"{r['year']}-{r['sess']}-{r['book']}-{r['subject']}-Q{r['qNum']}"
            stats['total'] += 1
            stats[r['matchMode']] = stats.get(r['matchMode'], 0) + 1
            if r['acceptedAnswers']:
                stats['corrections'] += 1
            if r['explanation'].strip():
                stats['exp_present'] += 1
            else:
                stats['exp_empty'] += 1
            if r['matchMode'] == 'content' and r['matchSim'] < 0.7:
                stats['low_conf'].append((r['id'], r['matchSim']))
        all_recs.extend(recs)
    return all_recs, stats


if __name__ == '__main__':
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 114
    recs, st = reconcile_year(year)
    print(f"\n=== reconcile_all {year}: {st['total']} 題 ===")
    print(f"  qNum直配={st.get('qnum',0)}  內容比對={st.get('content',0)}  缺題補洞(無陽明詳解)={st.get('gap',0)}")
    print(f"  有詳解={st['exp_present']}  詳解空白={st['exp_empty']}  更正答案={st['corrections']}")
    print(f"  低信心內容比對(<0.7) {len(st['low_conf'])}: {st['low_conf'][:10]}")
    # sample one fully reconciled record
    import random
    ex = next(r for r in recs if r['explanation'] and r['acceptedAnswers'] is None)
    print('\n--- 範例 reconciled record ---')
    print('id:', ex['id'], '| subject:', ex['subject'], '| answer:', ex['answer'])
    print('stem:', ex['stem'][:80])
    print('explanation(清理後):', ex['explanation'][:120])
    if len(sys.argv) > 2 and sys.argv[2] == 'dump':
        os.makedirs('out', exist_ok=True)
        json.dump(recs, open(f'out/reconciled_{year}.json', 'w'), ensure_ascii=False)
        print(f'\nwrote out/reconciled_{year}.json ({len(recs)} records)')
