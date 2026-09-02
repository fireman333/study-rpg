"""Span-aware 考選部 試題 parser — recovers super/subscripts that `-layout` detaches.

`pdftotext -layout` (parse_moex_layout) renders a raised span (Na⁺, Cr⁶⁺, [¹⁸F], ³²P)
as its own output row, which lands at the END of the preceding line. The ion charge or
isotope number therefore leaves the word it belongs to and reappears as an orphan token
at the tail of the previous stem/option — silently. 115-2 had 8 such questions
(醫一 Q52/63/86/87/97/98, 醫二 Q43/64); e.g. option A read 「Cr 的毒性通常較 Cr 強」
with 「6+ 3+」 stranded on the stem.

This module rebuilds each VISUAL line from PyMuPDF spans: lines whose bounding boxes
overlap vertically by >60% are one line, and spans inside it are ordered by x. A raised
span therefore rejoins its base word in the right position.

Use it as the oracle, not the default: `-layout` reproduces the corpus's established
CJK/ASCII spacing, so the ingest keeps `-layout` text and swaps in the span-aware text
only for the fields the two disagree on (whitespace-insensitively).

  parse_questions_spans(pdf) -> {qNum: {stem, options}}   (same shape as the siblings)
  detached_superscript_fields(pdf) -> [(qNum, field, layout_text, spans_text)]
"""
from __future__ import annotations
import difflib
import re
import fitz

from parse_moex import _split_options
from parse_moex_layout import parse_questions_layout

_HEADER_PATS = [
    re.compile(r'代\s*號[：:]\s*\d'),
    re.compile(r'^類科名稱'), re.compile(r'^科目名稱'), re.compile(r'^考試時間'),
    re.compile(r'^座號'), re.compile(r'禁止使用電子計算器'), re.compile(r'單一選擇題'),
    re.compile(r'專門職業及技術人員高等考試.*醫師'),
    re.compile(r'^\s*頁次[：:]'), re.compile(r'^\s*第\s*\d+\s*頁'),
    re.compile(r'^\s*\d+\s*[-－]\s*\d+\s*$'),
]


def _page_lines(page) -> list[str]:
    raw = []
    for blk in page.get_text('dict')['blocks']:
        for ln in blk.get('lines', []):
            if not ''.join(s['text'] for s in ln['spans']).strip():
                continue
            raw.append({'y0': ln['bbox'][1], 'y1': ln['bbox'][3], 'x0': ln['bbox'][0],
                        'spans': [(s['bbox'][0], s['text']) for s in ln['spans']]})
    raw.sort(key=lambda r: (r['y0'], r['x0']))
    merged: list[dict] = []
    for r in raw:
        for m in merged:
            overlap = min(m['y1'], r['y1']) - max(m['y0'], r['y0'])
            if overlap > 0.6 * min(m['y1'] - m['y0'], r['y1'] - r['y0']):
                m['spans'] += r['spans']
                m['y0'] = min(m['y0'], r['y0'])
                m['y1'] = max(m['y1'], r['y1'])
                break
        else:
            merged.append(dict(r))
    merged.sort(key=lambda m: m['y0'])
    out = []
    for m in merged:
        m['spans'].sort(key=lambda s: s[0])
        out.append(''.join(t for _, t in m['spans']))
    return out


def spans_text(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    lines = []
    for page in doc:
        for ln in _page_lines(page):
            s = ln.rstrip()
            if not s.strip() or any(p.search(s) for p in _HEADER_PATS):
                continue
            lines.append(s)
    return '\n'.join(lines)


def parse_questions_spans(pdf_path: str) -> dict:
    text = spans_text(pdf_path)
    starts, expected = [], 1
    for m in re.finditer(r'(?m)^\s*(\d{1,3})\.', text):
        if int(m.group(1)) == expected:
            starts.append((expected, m.start(), m.end()))
            expected += 1
    result = {}
    for i, (qn, s_idx, s_end) in enumerate(starts):
        block = text[s_end:starts[i + 1][1] if i + 1 < len(starts) else len(text)]
        split = _split_options(block)
        if split is None:
            result[qn] = {'stem': re.sub(r'\s+', ' ', block).strip(), 'options': {}, '_bad': True}
            continue
        stem, options = split
        result[qn] = {'stem': re.sub(r'\s+', ' ', stem).strip(), 'options': options}
    return result



_CJK = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf]')


def merge_spacing(layout: str, spans: str) -> str:
    """Content from the span-aware parse, whitespace convention from `-layout`.

    `-layout` reproduces the corpus's established CJK/ASCII spacing but drops the raised
    span, leaving a gap where it used to sit; the span-aware text has the character but
    the PDF's own (tighter) spacing. Align the two whitespace-free strings and take a
    space when EITHER the span text has one, OR `-layout` has one that is not the gap the
    extracted superscript left behind (i.e. right after an inserted run and not before a
    CJK ideograph).
    """
    def strip_spaces(s):
        chars, flags, pending = [], [], False
        for ch in s:
            if ch.isspace():
                pending = True
                continue
            chars.append(ch)
            flags.append(pending)
            pending = False
        return chars, flags

    l_ns, l_sp = strip_spaces(layout)
    s_ns, s_sp = strip_spaces(spans)
    inserted = [True] * len(s_ns)
    layout_sp = [False] * len(s_ns)
    sm = difflib.SequenceMatcher(a=''.join(l_ns), b=''.join(s_ns), autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag != 'equal':
            continue
        for k in range(i2 - i1):
            layout_sp[j1 + k] = l_sp[i1 + k]
            inserted[j1 + k] = False
    out = ''
    for i, ch in enumerate(s_ns):
        space = s_sp[i]
        if not space and layout_sp[i]:
            space = not (i > 0 and inserted[i - 1] and not _CJK.match(ch))
        if space and out:
            out += ' '
        out += ch
    return out.strip()


def _nospace(s: str) -> str:
    return re.sub(r'\s+', '', s)


def detached_superscript_fields(pdf_path: str):
    """Fields where -layout and the span-aware parse disagree beyond whitespace.

    Every such disagreement observed so far is a detached super/subscript, and the
    span-aware text is the correct one.
    """
    layout = parse_questions_layout(pdf_path)
    spans = parse_questions_spans(pdf_path)
    out = []
    for qn in sorted(layout):
        if qn not in spans:
            continue
        for field in ['stem', 'A', 'B', 'C', 'D']:
            a = layout[qn]['stem'] if field == 'stem' else layout[qn]['options'].get(field, '')
            b = spans[qn]['stem'] if field == 'stem' else spans[qn]['options'].get(field, '')
            if _nospace(a) != _nospace(b):
                out.append((qn, field, a, b))
    return out


if __name__ == '__main__':
    import sys
    for path in sys.argv[1:]:
        rows = detached_superscript_fields(path)
        print(f'{path}: {len(rows)} field(s) differ')
        for qn, field, a, b in rows:
            print(f'  Q{qn} {field}\n    layout: {a}\n    spans : {b}')
