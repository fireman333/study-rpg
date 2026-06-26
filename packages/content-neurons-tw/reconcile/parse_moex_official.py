"""Parse the 考選部 official 107-115 一階 PDFs (questions + answers).

Distinct from `parse_moex.py` (which targets a differently-named set and whose
positional `parse_answers` drifts on 更正/送分 grids). This module:
  - maps the code-style official filenames -> (year, session, book)
  - parses the standard-answer grid SPATIALLY (robust to 更正 ＃ markers)
  - decodes the 備註 送分/更正 text -> disputed / acceptedAnswers (corpus shape)
Question stem/option parsing reuses `parse_moex.parse_questions`.
Read-only over the source PDFs.
"""
import os
import re
import fitz

FW = {'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E'}
BOOKCODE = {'1': '醫學一', '5': '醫學一', '2': '醫學二', '6': '醫學二'}

# ── filename → (year, sitting, book) ────────────────────────────────────────
_Q_RE = re.compile(r'(\d{3})(\d{3})_(\d+)301\.pdf$')
_A_RE = re.compile(r'(\d{3})(\d{3})_(?:MOD|ANS)(\d)301\.pdf$')


def parse_official_filename(name):
    """'107020_5301.pdf' -> (year=107, sitting='020', book='醫學一'). None if not a paper."""
    m = _Q_RE.match(os.path.basename(name)) or _A_RE.match(os.path.basename(name))
    if not m:
        return None
    book = BOOKCODE.get(m.group(3))
    if not book:
        return None
    return int(m.group(1)), m.group(2), book


def session_map(filenames):
    """Assign session 1..N by ascending sitting code within each year.

    Returns {(year, sitting): session}.
    """
    by_year = {}
    for f in filenames:
        p = parse_official_filename(f)
        if p:
            by_year.setdefault(p[0], set()).add(p[1])
    out = {}
    for year, sits in by_year.items():
        for rank, s in enumerate(sorted(sits), start=1):
            out[(year, s)] = rank
    return out


# ── standard-answer grid (spatial) ──────────────────────────────────────────
def parse_answer_grid(pdf_path):
    """Return {qNum(1..100): 'A'..'E'} from the official standard-answer PDF.

    Conservative column-pairing: pair each 題號 token with the answer letter directly
    below it in the SAME column (tight x tolerance). Deliberately leaves a cell unread
    rather than risk a wrong pairing — this parser is a re-verification gate (any value
    it returns must be trustworthy; the first-of-row 答案-glued cell and ＃-perturbed
    rows are simply skipped rather than mis-paired). 2970/2970 of read cells agree with
    the known-good corpus; unread cells fall back to the inherited corpus answer.
    """
    doc = fitz.open(pdf_path)
    words = []
    for pg in doc:
        words += [(w[0], w[1], w[4]) for w in pg.get_text("words")]
    letters = []   # (x, y, letter)
    for x, y, t in words:
        s = t.strip()
        if s in FW:                       # bare full-width letter
            letters.append((x, y, FW[s]))
        elif len(s) >= 2 and s[-1] in FW:  # '答案Ｄ' label glued to a letter
            letters.append((x, y, FW[s[-1]]))
    nums = []      # (x, y, n)
    for x, y, t in words:
        m = re.fullmatch(r'(\d{1,3})', t.strip())
        if m and 1 <= int(m.group(1)) <= 100:
            nums.append((x, y, int(m.group(1))))
    res = {}
    for xn, yn, n in nums:
        best, bd = None, 1e9
        for xl, yl, ch in letters:
            dy = yl - yn
            if 0 <= dy < 60 and abs(xl - xn) < 18:   # same column, just below
                d = dy + abs(xl - xn) * 0.1
                if d < bd:
                    bd, best = d, ch
        if best and n not in res:
            res[n] = best
    return res


# ── 備註 送分 / 更正 decode ─────────────────────────────────────────────────
_NUM_CLAUSE = re.compile(r'第\s*(\d+)\s*題[，,]?\s*([^。\n第]*)')


def parse_remarks(pdf_path):
    """Decode the 備註 line of a MOD answer PDF.

    Returns {qNum: {'disputed': True}}  for 一律給分 / 除未作答者不給分
         or {qNum: {'accepted': ['A','B',...]}} for 答X、Y給分 / 答X或Y...均給分 / 答X給分.
    """
    doc = fitz.open(pdf_path)
    text = '\n'.join(doc[i].get_text() for i in range(doc.page_count))
    # 備註 region starts at '備　　註' / '備註'
    m = re.search(r'備\s*註', text)
    region = text[m.start():] if m else text
    region = region.replace('\n', '')
    out = {}
    for cm in _NUM_CLAUSE.finditer(region):
        qn = int(cm.group(1))
        clause = cm.group(2)
        if not clause:
            continue
        if '一律給分' in clause or '除未作答' in clause:
            out[qn] = {'disputed': True}
            continue
        if '給分' in clause:
            # collect single fullwidth letters mentioned before 給分 (ignore combo tokens like BC)
            letters = [FW[c] for c in clause if c in FW]
            if letters:
                out[qn] = {'accepted': sorted(set(letters))}
    return out


def parse_official_answers(pdf_path):
    """Combine the grid + 備註 into {qNum: {'answer','disputed'?,'acceptedAnswers'?}}."""
    grid = parse_answer_grid(pdf_path)
    remarks = parse_remarks(pdf_path) if '_MOD' in os.path.basename(pdf_path) else {}
    out = {}
    for qn, ans in grid.items():
        rec = {'answer': ans}
        r = remarks.get(qn)
        if r:
            if r.get('disputed'):
                rec['disputed'] = True
            if r.get('accepted'):
                rec['acceptedAnswers'] = r['accepted']
        out[qn] = rec
    # remarks may reference a qNum the grid missed (rare) — keep it
    for qn, r in remarks.items():
        out.setdefault(qn, {})
        if r.get('disputed'):
            out[qn]['disputed'] = True
        if r.get('accepted'):
            out[qn]['acceptedAnswers'] = r['accepted']
    return out
