"""Parse 考選部 醫師(一) for the 104-1 sitting (combined 醫師中醫師 exam, 試題代號 1101).

This sitting's PDFs differ from every standard c=301 paper:
  - question starts are a bare number alone on its own line (no trailing '.'),
  - option markers are private-use glyphs \\ue18c..\\ue18f (= Ⓐ..Ⓓ), not 'A.'..'D.',
  - the standard-answer grid is column-major in the embedded font and unreadable
    via fitz, but `pdftotext -layout` recovers a clean 題號/答案 table.

Stems are plain Unicode via fitz; only the option markers need PUA mapping. Output
shape matches parse_moex.parse_questions / parse_answers so it is a drop-in for the
104-1 branch of reconcile_all.load_moex.
"""
import re
import subprocess
import fitz

OPT_PUA = {'': 'A', '': 'B', '': 'C', '': 'D'}
FW = {'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E'}

_HEADER_RE = re.compile(r'^(等\s*別|類\s*科|科\s*目|考試時間|座\s*號)')


def _clean_lines(doc):
    out = []
    for pno in range(doc.page_count):
        for ln in doc[pno].get_text().split('\n'):
            s = ln.rstrip()
            if not s.strip():
                out.append('')
                continue
            if re.search(r'代\s*號[：:]', s) or re.match(r'^\s*頁次[：:]', s):
                continue
            if _HEADER_RE.match(s):
                continue
            if '專門職業及技術人員' in s or '本試題' in s and '選擇題' in s:
                continue
            if '本科目共' in s or '禁止使用' in s or s.startswith('※注意'):
                continue
            out.append(s)
    return out


def parse_questions(pdf_path):
    """Return dict {qNum: {'stem': str, 'options': {A..D: str}}} (1101 format)."""
    doc = fitz.open(pdf_path)
    lines = _clean_lines(doc)
    doc.close()
    text = '\n'.join(lines)
    # turn each PUA option marker into a line-leading sentinel so re.split is clean
    for g, L in OPT_PUA.items():
        text = text.replace(g, f'\n@@OPT_{L}@@')

    starts, expected = [], 1
    for m in re.finditer(r'(?m)^\s*(\d{1,3})\s*$', text):
        if int(m.group(1)) == expected:
            starts.append((expected, m.end()))
            expected += 1

    result = {}
    for i, (qn, s_end) in enumerate(starts):
        block_end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
        # block_end points just past the next number; trim back to its line start
        block = text[s_end:block_end]
        block = re.sub(r'\n\s*\d{1,3}\s*$', '', block)
        parts = re.split(r'@@OPT_([A-D])@@', block)
        stem = re.sub(r'\s+', ' ', parts[0]).strip()
        options = {}
        for j in range(1, len(parts) - 1, 2):
            options[parts[j]] = re.sub(r'\s+', ' ', parts[j + 1]).strip()
        if len(options) != 4:
            result[qn] = {'stem': stem, 'options': options, '_bad': True}
        else:
            result[qn] = {'stem': stem, 'options': options}
    return result


def parse_answers(pdf_path):
    """Return positional answer list (index 0 = Q1) from the 1101 標準答案 grid."""
    txt = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', pdf_path, '-'],
                         capture_output=True, text=True).stdout
    lines = txt.split('\n')
    pairs = {}
    for i, ln in enumerate(lines):
        if '題號' not in ln:
            continue
        nums = [int(x) for x in re.findall(r'第\s*(\d+)\s*題', ln)]
        if not nums:
            continue
        for j in range(i + 1, min(i + 3, len(lines))):
            if '答案' in lines[j]:
                tail = lines[j].split('答案', 1)[1]
                lets = [FW.get(c, c) for c in re.findall(r'[A-EＡ-Ｅ]', tail)]
                for n, l in zip(nums, lets):
                    pairs[n] = l
                break
    if not pairs:
        return []
    return [pairs.get(k, '?') for k in range(1, max(pairs) + 1)]


if __name__ == '__main__':
    for b in ['一', '二']:
        qs = parse_questions(f'pdf/104/104-1_醫學{b}_試題.pdf')
        ans = parse_answers(f'pdf/104/104-1_醫學{b}_答案.pdf')
        bad = [q for q, v in qs.items() if len(v.get('options', {})) != 4]
        print(f'104-1 醫學{b}: {len(qs)} Q, bad={len(bad)} {bad[:8]}, answers={len(ans)}')
        for qn in (1, 2, 100):
            if qn in qs:
                q = qs[qn]
                print(f'  Q{qn} ans={ans[qn-1] if qn-1 < len(ans) else "?"} | {q["stem"][:46]} | A:{q["options"].get("A","")[:24]} D:{q["options"].get("D","")[:24]}')
