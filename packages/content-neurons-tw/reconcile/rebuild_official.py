#!/usr/bin/env python3
"""Rebuild data/medexam-reconciled/questions.json from 考選部 official 107-115 PDFs.

A content-swap joined to the existing reconciled corpus (the "oracle") by
(year, session, book, qNumber) — see change rebuild-neurons-corpus-from-official-pdfs
design D2/D3:
  - stem / options            ← official 試題 PDF       (parse_moex.parse_questions)
  - answer/disputed/accepted  ← official 解答 PDF       (parse_moex_official), oracle fallback
  - id / subject / meta / explanation / explanationBlocks / explanationSource /
    sourceCredit / hasImage / hasOptionImages  ← inherited from the oracle (id-stable)
  - 104 / 105 / 106 dropped; 107-115 kept.

Loud imported/dropped/total counts (No-Silent-Errors). HARD-FAIL on a missing official
question or a standard-answer conflict (official ≠ oracle where both are present).
Rewrites the source questions.json in place.
"""
import os
import re
import sys
import json
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import parse_moex as pm
import parse_moex_layout as pl
import parse_moex_official as po


def _truncated(text):
    """Heuristic: does a parsed stem/option look cut off (column-wrap detachment)?"""
    t = (text or '').rstrip()
    if not t:
        return True
    if t.endswith(('何者', '下列', '，', '、')):
        return True
    if t.count('（') != t.count('）'):
        return True
    # ends on an ASCII word not closed by a paren → a wrapped English term was cut
    if re.search(r'[A-Za-z]$', t) and not re.search(r'[）)]\s*$', t):
        return True
    return False


def _complete(q):
    """An official question is usable iff it has 4 options and nothing looks truncated."""
    opts = q.get('options', {})
    if q.get('_bad') or len(opts) != 4:
        return False
    if _truncated(q.get('stem')):
        return False
    return all(not _truncated(v) for v in opts.values())

ROOT = os.path.normpath(os.path.join(HERE, '..'))
ORACLE_PATH = os.path.join(ROOT, 'data', 'medexam-reconciled', 'questions.json')
SRC = os.path.expanduser('~/Desktop/國考/一階國考/一階國考107-115')
ANS = os.path.join(SRC, '解答')
KEEP_YEARS = set(range(107, 116))   # 107..115

# fields that come from the official PDFs; everything else is inherited verbatim
OFFICIAL_FIELDS = ('stem', 'options', 'answer', 'disputed', 'acceptedAnswers')


def _key(q):
    m = q['meta']
    return (m['year'], m['session'], m['book'], m['qNumber'])


def main():
    oracle = json.load(open(ORACLE_PATH, encoding='utf-8'))

    # ---- parse official questions + answers, keyed by (year, session, book, qNumber) ----
    qpdfs = [f for f in os.listdir(SRC) if re.fullmatch(r'\d{6}_\d301\.pdf', f)]
    apdfs = [f for f in os.listdir(ANS) if re.fullmatch(r'\d{6}_(?:MOD|ANS)\d301\.pdf', f)]
    qsess = po.session_map(qpdfs)
    asess = po.session_map(apdfs)

    # Layout-aware parse (pdftotext -layout) is primary — it keeps wrapped 2nd lines
    # attached (parse_moex.parse_questions detaches them on 2-column papers, truncating
    # ~stems). Where the layout parse of a question is incomplete, fall back to the
    # simple parser, then to a per-question completeness gate at assembly time.
    official_q = {}
    for f in qpdfs:
        y, sit, book = po.parse_official_filename(f)
        se = qsess[(y, sit)]
        layout = pl.parse_questions_layout(os.path.join(SRC, f))
        simple = pm.parse_questions(os.path.join(SRC, f))
        for qn in range(1, 101):
            lq = layout.get(qn)
            sq = simple.get(qn)
            # prefer the complete one; default to layout
            if lq and _complete(lq):
                official_q[(y, se, book, qn)] = lq
            elif sq and _complete(sq):
                official_q[(y, se, book, qn)] = sq
            elif lq:
                official_q[(y, se, book, qn)] = lq
            elif sq:
                official_q[(y, se, book, qn)] = sq

    official_a = {}
    for f in apdfs:
        p = po.parse_official_filename(f)
        if not p or p[0] not in KEEP_YEARS:
            continue   # skip stray 106 answer files
        y, sit, book = p
        se = asess[(y, sit)]
        for qn, rec in po.parse_official_answers(os.path.join(ANS, f)).items():
            official_a[(y, se, book, qn)] = rec
    answer_file_papers = {(po.parse_official_filename(f)[0], asess[(po.parse_official_filename(f)[0],
                          po.parse_official_filename(f)[1])], po.parse_official_filename(f)[2])
                          for f in apdfs if po.parse_official_filename(f)[0] in KEEP_YEARS}

    # ---- assemble ----
    out = []
    dropped = collections.Counter()
    kept_overlap = new_115 = 0
    missing_official = []
    answer_conflicts = []
    answer_fixes = []          # 送分/更正 the oracle missed
    oracle_fallback_answer = 0
    stem_kept_oracle = 0       # official parse incomplete → oracle stem kept (no regression)
    no_answer_file_papers = set()

    for q in oracle:
        y = q['meta']['year']
        if y not in KEEP_YEARS:
            dropped[y] += 1
            continue
        key = _key(q)
        oq = official_q.get(key)
        if oq is None:
            missing_official.append(q['id'])
            continue

        new = dict(q)                       # inherit id/subject/meta/explanation/... verbatim
        if _complete(oq):
            new['stem'] = oq['stem']        # clean official content
            new['options'] = oq['options']
        else:
            stem_kept_oracle += 1           # official parse looked truncated → keep oracle stem (no regression)

        paper = (key[0], key[1], key[2])
        oa = official_a.get(key)
        old_answer = q.get('answer')
        old_disp = bool(q.get('disputed'))
        old_acc = sorted(q.get('acceptedAnswers') or [])

        if paper in answer_file_papers:
            # official answer file is authoritative for this paper
            ans = oa.get('answer') if oa else None
            if ans is None:
                ans = old_answer                       # grid cell unread → oracle fallback
                oracle_fallback_answer += 1
            elif old_answer is not None and ans != old_answer:
                answer_conflicts.append((q['id'], ans, old_answer))
            new['answer'] = ans
            disp = bool(oa.get('disputed')) if oa else False
            acc = sorted(oa.get('acceptedAnswers') or []) if oa else []
        else:
            # no official answer file (113-1-醫學二 / 115-1-醫學二) → keep oracle answer
            no_answer_file_papers.add(paper)
            new['answer'] = old_answer
            disp = old_disp
            acc = old_acc

        if disp:
            new['disputed'] = True
        else:
            new.pop('disputed', None)
        if acc:
            new['acceptedAnswers'] = acc
        else:
            new.pop('acceptedAnswers', None)

        if disp != old_disp or acc != old_acc:
            answer_fixes.append((q['id'], f'disputed {old_disp}->{disp}', f'accepted {old_acc}->{acc}'))

        if key[0] == 115:
            new_115 += 1
        else:
            kept_overlap += 1
        out.append(new)

    # ---- hard gates ----
    if missing_official:
        print(f'HARD STOP: {len(missing_official)} oracle 107-115 questions had no matching '
              f'official question. e.g. {missing_official[:10]}', file=sys.stderr)
        sys.exit(1)
    if answer_conflicts:
        print(f'HARD STOP: {len(answer_conflicts)} standard-answer conflicts (official ≠ oracle). '
              f'e.g. {answer_conflicts[:10]}', file=sys.stderr)
        sys.exit(1)

    # ---- write in place ----
    with open(ORACLE_PATH, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False)

    # ---- loud report ----
    total_dropped = sum(dropped.values())
    print('=== rebuild_official: questions.json rebuilt from 考選部 official PDFs ===')
    print(f'  imported (107-115)     : {len(out)}')
    print(f'    kept 107-114 overlap : {kept_overlap}  (id-stable; player progress carries over)')
    print(f'    new 115              : {new_115}')
    print(f'  dropped 104-106        : {total_dropped}  {dict(sorted(dropped.items()))}')
    print(f'  stems kept from oracle (official parse truncated): {stem_kept_oracle}')
    print(f'  oracle-fallback answers (grid cell unread): {oracle_fallback_answer}')
    print(f'  no-official-answer-file papers (oracle answer kept): {sorted(no_answer_file_papers)}')
    print(f'  送分/更正 fixes vs oracle: {len(answer_fixes)}')
    for f in answer_fixes:
        print(f'      {f[0]}: {f[1]}, {f[2]}')
    print(f'  standard-answer conflicts: 0  | missing official: 0')
    print(f'  TOTAL written          : {len(out)}')


if __name__ == '__main__':
    main()
