"""Parse 考選部 醫師(一) PDFs: 試題 (Q) / 答案 (S) / 更正答案 (M).

Text-based PDFs (PyMuPDF). Output authoritative {qNum, stem, options, answer}.
"""
import re
import fitz

FULLWIDTH_LETTER = {'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E'}


def _page_lines(doc):
    """Yield all text lines, stripping per-page header/footer boilerplate."""
    out = []
    for pno in range(doc.page_count):
        raw = doc[pno].get_text()
        lines = raw.split('\n')
        for ln in lines:
            s = ln.rstrip()
            if not s.strip():
                out.append('')  # keep blank as separator
                continue
            # strip known header/footer lines
            if re.search(r'代\s*號[：:]\s*\d', s):
                continue
            if s.startswith('類科名稱') or s.startswith('科目名稱') or s.startswith('考試時間'):
                continue
            if s.startswith('座號') or '禁止使用電子計算器' in s or '單一選擇題' in s:
                continue
            if '專門職業及技術人員高等考試' in s and '醫師' in s:
                continue
            if re.match(r'^\s*頁次[：:]', s) or re.match(r'^\s*第\s*\d+\s*頁', s):
                continue
            if re.match(r'^\s*\d+\s*[-－]\s*\d+\s*$', s):  # bare "N-M" page marker
                continue
            out.append(s)
    return out


def _split_options(block):
    """Given a question block (text after 'N.'), return (stem, {A..D: text}) or None.

    Options are A. B. C. D. (半形 dot), letter at word boundary. Scan markers from
    the END (D→C→B→A) so a stray 'A.' inside the stem won't capture the option block.
    """
    markers = [(m.group(1), m.start(1), m.end())
               for m in re.finditer(r'(?:(?<=\s)|^)([ABCD])\.', block)]
    if not markers:
        return None
    picks = {}
    target = 'D'
    for letter, sidx, eidx in reversed(markers):
        if letter == target:
            picks[target] = (sidx, eidx)
            target = chr(ord(target) - 1)
            if target < 'A':
                break
    if len(picks) != 4:
        return None
    ordered = [picks[L] for L in 'ABCD']  # (start, endOfMarker)
    stem = block[:ordered[0][0]].strip()
    options = {}
    for i, L in enumerate('ABCD'):
        text_start = ordered[i][1]
        text_end = ordered[i + 1][0] if i + 1 < 4 else len(block)
        options[L] = re.sub(r'\s+', ' ', block[text_start:text_end]).strip()
    return stem, options


def parse_questions(pdf_path):
    """Return dict {qNum: {'stem': str, 'options': {A..D: str}}}."""
    doc = fitz.open(pdf_path)
    lines = _page_lines(doc)
    text = '\n'.join(lines)

    # Question-start markers: sequential N. at (optionally space-indented) line start.
    starts = []
    expected = 1
    for m in re.finditer(r'(?m)^\s*(\d{1,3})\.', text):
        if int(m.group(1)) == expected:
            starts.append((expected, m.start(), m.end()))
            expected += 1

    result = {}
    for i, (qn, s_idx, s_end) in enumerate(starts):
        block_end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
        block = text[s_end:block_end]
        split = _split_options(block)
        if split is None:
            result[qn] = {'stem': re.sub(r'\s+', ' ', block).strip(), 'options': {}, '_bad': True}
            continue
        stem, options = split
        result[qn] = {'stem': re.sub(r'\s+', ' ', stem).strip(), 'options': options}
    return result


def parse_answers(pdf_path):
    """Return dict {qNum: 'A'..'E'} from standard-answer PDF."""
    doc = fitz.open(pdf_path)
    text = '\n'.join(doc[i].get_text() for i in range(doc.page_count))
    # The answer grid lists letters (full-width) in question order after '答案'.
    # Strategy: take everything after the first '標準答案' / '答案' header region,
    # collect full-width letters in document order.
    letters = [FULLWIDTH_LETTER[c] for c in text if c in FULLWIDTH_LETTER]
    return letters  # positional; caller maps to 1..N


if __name__ == '__main__':
    import sys, json
    qs = parse_questions('pdf/114/114-1_醫學一_試題.pdf')
    print(f'parsed {len(qs)} questions')
    bad = [qn for qn, q in qs.items() if len(q['options']) != 4]
    print(f'questions without exactly 4 options: {bad}')
    for qn in [1, 2, 50, 99, 100]:
        if qn in qs:
            q = qs[qn]
            print(f'--- Q{qn} ({len(q["options"])} opts) ---')
            print('  stem:', q['stem'][:90])
            for k in sorted(q['options']):
                print(f'  {k}.', q['options'][k][:60])
    print()
    ans = parse_answers('pdf/114/114-1_醫學一_答案.pdf')
    print(f'answer letters extracted: {len(ans)}')
    print('first 20:', ''.join(ans[:20]))
    print('last 10:', ''.join(ans[-10:]))
