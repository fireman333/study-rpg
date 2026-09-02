"""Build the 115 年第二次 (115-2) base records from the 考選部 PDFs.

考選部 has 試題 + 標準答案 + 更正答案 for 115-2; 陽明 has not published 詳解 for it, so the
explanation path is the AI one 115-1 used before its real 詳解 landed (see generate_115.py /
finalize.py `load_115_records`): `explanationSource: 'ai-generated'` + its own sourceCredit.

Sources (owner's Desktop; PDFs not in git):
  試題    115090_{1301,2301}.pdf
  標準答案 解答/115090_ANS{1,2}301.pdf
  更正答案 解答/115090_MOD{1,2}301.pdf

Text: `-layout` for the corpus's established spacing, with the fields the span-aware parse
disagrees on swapped in (detached super/subscripts — 8 questions in this sitting).
Answers: the ANS grid read sequentially and cross-checked against the conservative spatial
grid, then the MOD 備註 decoded (一律給分 → disputed, 答X或Y均給分 → acceptedAnswers). The MOD
grid only replaces the adjusted cells with ＃; it changes no letter, which this asserts.

  python3 ingest_115_2.py            # writes out/115-2/base.json
"""
from __future__ import annotations
import json
import os
import re
import sys
from pathlib import Path

import fitz

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from parse_moex_layout import parse_questions_layout            # noqa: E402
from parse_moex_spans import detached_superscript_fields, merge_spacing  # noqa: E402
from parse_moex_official import parse_answer_grid, parse_remarks        # noqa: E402

SRC = Path(os.path.expanduser('~/Desktop/國考/一階國考/一階國考107-115'))
OUT = HERE / 'out' / '115-2'
YEAR, SESSION = 115, 2
CODE = '115090'
AI_CREDIT = '考選部（試題與標準答案）+ AI 生成詳解（Gemini，未經陽明審定）'

BOOKS = {
    '醫學一': {'q': f'{CODE}_1301.pdf', 'ans': f'{CODE}_ANS1301.pdf', 'mod': f'{CODE}_MOD1301.pdf',
              'paper': 'medexam-1'},
    '醫學二': {'q': f'{CODE}_2301.pdf', 'ans': f'{CODE}_ANS2301.pdf', 'mod': f'{CODE}_MOD2301.pdf',
              'paper': 'medexam-2'},
}

# Contiguous 科目 blocks. 陽明 (the usual `subject` authority) has no 115-2 booklet, so these were
# boundary-checked against the actual stems and match every sitting 113-1…115-1 unchanged.
SUBJECT_BLOCKS = {
    '醫學一': [(1, 31, '解剖學'), (32, 36, '胚胎學'), (37, 46, '組織學'),
              (47, 73, '生理學'), (74, 100, '生物化學')],
    '醫學二': [(1, 28, '微生物暨免疫學'), (29, 35, '寄生蟲學'), (36, 50, '公共衛生學'),
              (51, 75, '藥理學'), (76, 100, '病理學')],
}
# build.ts splits 微生物暨免疫學 into two player-facing families; without a 陽明 per-Q 科目 tag it
# would fall back to 微生物學 for all 28. The paper orders the block 微生物 then 免疫 (verified
# against the stems; identical 17/11 split to 114-1 and 114-2), so bake it.
MICRO_IMMUNE_SPLIT = 17  # Q1..17 微生物學, Q18..28 免疫學

FW = {'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E'}


def answer_sequence(pdf_path: Path) -> list[str]:
    """Answer cells in 題號 order. '#' marks a 更正-adjusted cell (MOD files only)."""
    doc = fitz.open(pdf_path)
    cells = []
    for page in doc:
        for w in page.get_text('words'):
            s = w[4].strip()
            if s in FW:
                cells.append((w[1], w[0], FW[s]))
            elif len(s) >= 2 and s[-1] in FW:      # '答案Ｄ' label glued to the first cell of a row
                cells.append((w[1], w[0], FW[s[-1]]))
            elif s in ('＃', '#'):
                cells.append((w[1], w[0], '#'))
    cells.sort(key=lambda t: (round(t[0], 1), t[1]))
    return [c for _, _, c in cells]


def subject_of(book: str, qn: int) -> str:
    for a, b, s in SUBJECT_BLOCKS[book]:
        if a <= qn <= b:
            return s
    raise ValueError(f'{book} Q{qn} falls outside the 科目 blocks')


def load_answers(book: str) -> dict[int, dict]:
    cfg = BOOKS[book]
    ans = answer_sequence(SRC / '解答' / cfg['ans'])
    if len(ans) != 100:
        raise ValueError(f'{book}: standard-answer PDF yielded {len(ans)} cells, expected 100')
    # cross-check against the conservative spatial grid — it skips ambiguous cells but every
    # cell it does read must agree, or the sequential read is not trustworthy.
    grid = parse_answer_grid(str(SRC / '解答' / cfg['ans']))
    bad = [(n, v, ans[n - 1]) for n, v in grid.items() if ans[n - 1] != v]
    if bad:
        raise ValueError(f'{book}: sequential vs spatial answer disagreement: {bad[:5]}')

    mod = answer_sequence(SRC / '解答' / cfg['mod'])
    mod = mod[1:] if len(mod) == 101 else mod   # leading ＃ of the 備註 legend
    if len(mod) != 100:
        raise ValueError(f'{book}: 更正 PDF yielded {len(mod)} cells, expected 100')
    changed = [(i + 1, ans[i], mod[i]) for i in range(100) if ans[i] != mod[i] and mod[i] != '#']
    if changed:
        raise ValueError(f'{book}: 更正 PDF changes an answer letter, not just ＃: {changed}')

    remarks = parse_remarks(str(SRC / '解答' / cfg['mod']))
    hashed = {i + 1 for i in range(100) if mod[i] == '#'}
    if hashed != set(remarks):
        raise ValueError(f'{book}: ＃ cells {sorted(hashed)} ≠ 備註 questions {sorted(remarks)}')

    out = {}
    for qn in range(1, 101):
        rec = {'answer': ans[qn - 1]}
        r = remarks.get(qn)
        if r and r.get('disputed'):
            rec['disputed'] = True
        if r and r.get('accepted'):
            rec['acceptedAnswers'] = r['accepted']
        out[qn] = rec
    return out


def load_questions(book: str) -> dict[int, dict]:
    path = str(SRC / BOOKS[book]['q'])
    qs = parse_questions_layout(path)
    if len(qs) != 100:
        raise ValueError(f'{book}: parsed {len(qs)} questions, expected 100')
    bad = [n for n, v in qs.items() if len(v.get('options', {})) != 4]
    if bad:
        raise ValueError(f'{book}: questions without 4 options: {bad}')
    repaired = 0
    for qn, field, layout_txt, spans_txt in detached_superscript_fields(path):
        fixed = merge_spacing(layout_txt, spans_txt)
        if field == 'stem':
            qs[qn]['stem'] = fixed
        else:
            qs[qn]['options'][field] = fixed
        repaired += 1
    print(f'  {book}: 100 questions, {repaired} field(s) repaired from the span-aware parse')
    return qs


def build_book(book: str) -> list[dict]:
    qs = load_questions(book)
    answers = load_answers(book)
    recs = []
    for qn in range(1, 101):
        subject = subject_of(book, qn)
        rec = {
            'id': f'{YEAR}-{SESSION}-{book}-{subject}-Q{qn}',
            'subject': subject,
            'stem': qs[qn]['stem'],
            'options': qs[qn]['options'],
            'answer': answers[qn]['answer'],
            'hasImage': False,          # neither 115-2 booklet contains a figure (verified)
            'hasOptionImages': False,
            'meta': {'year': YEAR, 'session': SESSION, 'book': book,
                     'paper': BOOKS[book]['paper'], 'qNumber': qn},
            'sourceCredit': AI_CREDIT,
        }
        if answers[qn].get('disputed'):
            rec['disputed'] = True
        if answers[qn].get('acceptedAnswers'):
            rec['acceptedAnswers'] = answers[qn]['acceptedAnswers']
        if subject == '微生物暨免疫學':
            rec['microImmune'] = '微生物學' if qn <= MICRO_IMMUNE_SPLIT else '免疫學'
        recs.append(rec)
    return recs


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    recs = []
    for book in BOOKS:
        recs += build_book(book)
    disputed = [r['id'] for r in recs if r.get('disputed')]
    accepted = [(r['id'], r['acceptedAnswers']) for r in recs if r.get('acceptedAnswers')]
    (OUT / 'base.json').write_text(json.dumps(recs, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'[115-2] {len(recs)} base records → {OUT / "base.json"}')
    print(f'[115-2] 一律給分 (disputed): {disputed}')
    print(f'[115-2] 多答案給分: {accepted}')


if __name__ == '__main__':
    main()
