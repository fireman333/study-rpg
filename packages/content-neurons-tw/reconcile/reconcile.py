"""Reconcile 考選部 authoritative PDFs against 陽明 _extracted .md for one year.

Produces a diff report: OCR/text fixes, answer changes, gaps filled, orphan 陽明 Q,
詳解 cleanup preview.
"""
import os
import re
import difflib
import unicodedata
import fitz
from parse_moex import parse_questions, parse_answers

YM_ROOT = os.path.expanduser('~/Desktop/國考/一階國考/陽明國考考古/_extracted')
PDF_ROOT = 'pdf'

BOOK_SUBJECTS = {
    '醫學一': ['解剖學', '組織學', '胚胎學', '生理學', '生物化學'],
    '醫學二': ['公共衛生學', '寄生蟲學', '微生物暨免疫學', '病理學', '藥理學'],
}

# Author/credit lines to strip from 詳解 (per user: strip 解題者/審稿者, KEEP 參考資料)
CREDIT_RE = re.compile(r'^\s*(解題者|審稿者|出題者|校稿者)\b.*$', re.MULTILINE)
# A 解題者/審稿者 block often spans the label line + following name lines (M108* 姓名...).
# We strip from the label to end-of-詳解 only if what follows looks like names/IDs.


def norm(s):
    """Normalize for comparison: NFKC (fullwidth→halfwidth), drop all whitespace+punct, lowercase."""
    if not s:
        return ''
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'\s+', '', s)
    s = re.sub(r'[()\[\]{}【】「」『』，。、；：,.;:!?¡¿\-—–~～·…．│|/\\]', '', s)
    return s.lower()


def sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


# ---------- 陽明 .md parsing ----------
def parse_ym_md(path):
    raw = open(path, encoding='utf-8').read()
    m = re.match(r'^---\n(.*?)\n---\n(.*)$', raw, re.S)
    fm_text, body = (m.group(1), m.group(2)) if m else ('', raw)
    fm = {}
    for line in fm_text.split('\n'):
        if ':' in line:
            k, v = line.split(':', 1)
            fm[k.strip()] = v.strip().strip('"')
    out = {}
    blocks = re.split(r'(?m)^## Q(\d+)\s*$', body)
    # blocks: [pre, num, content, num, content, ...]
    for i in range(1, len(blocks), 2):
        qn = int(blocks[i])
        content = blocks[i + 1]
        secs = {}
        cur = None
        for line in content.split('\n'):
            hm = re.match(r'^### (.+?)\s*$', line)
            if hm:
                cur = hm.group(1)
                secs[cur] = []
            elif cur:
                secs[cur].append(line)
        def gettext(label):
            return '\n'.join(secs.get(label, [])).strip()
        stem = gettext('題幹')
        if not stem or '未從 PDF 擷取到此題' in content:
            out[qn] = {'qn': qn, 'subject': fm.get('subject', ''), 'missing': True,
                       'stem': '', 'options': {}, 'answer': '', 'explanation': ''}
            continue
        opts = {}
        for line in secs.get('選項', []):
            om = re.match(r'^- \(([A-E])\)\s*(.*)$', line)
            if om:
                opts[om.group(1)] = om.group(2).strip()
        ans = gettext('答案')
        am = re.search(r'([A-E])', ans)
        out[qn] = {'qn': qn, 'subject': fm.get('subject', ''), 'missing': False,
                   'stem': stem, 'options': opts,
                   'answer': am.group(1) if am else '',
                   'explanation': gettext('詳解')}
    return fm, out


def load_ym_paper(year, sess, book):
    """Return {qNum: ym_question} merged across the book's subject files."""
    merged = {}
    for subj in BOOK_SUBJECTS[book]:
        p = os.path.join(YM_ROOT, book, subj, f'{year}-{sess}.md')
        if not os.path.exists(p):
            continue
        _, qs = parse_ym_md(p)
        for qn, q in qs.items():
            merged[qn] = q
    return merged


# ---------- 更正答案 ----------
def parse_corrections(mod_pdf):
    # Some papers have no 更正答案 → the handler returns HTML, not a PDF. Skip gracefully.
    try:
        with open(mod_pdf, 'rb') as f:
            if f.read(4) != b'%PDF':
                return {}
    except OSError:
        return {}
    d = fitz.open(mod_pdf)
    t = '\n'.join(d[i].get_text() for i in range(d.page_count))
    m = re.search(r'備.*?註[：:]', t)
    tail = t[m.end():] if m else ''
    notes = {}
    # 第NN題一律給分 / 第NN題答Ｘ或Ｙ...均給分
    for mm in re.finditer(r'第\s*(\d+)\s*題([^第]*?給分)', tail):
        qn = int(mm.group(1)); txt = mm.group(2)
        if '一律' in txt:
            notes[qn] = ('all', txt.strip())
        else:
            letters = re.findall(r'[A-DＡ-Ｄ]', txt)
            fw = {'Ａ':'A','Ｂ':'B','Ｃ':'C','Ｄ':'D'}
            letters = [fw.get(c, c) for c in letters]
            # dedup keep order
            seen=[];
            for c in letters:
                if c not in seen: seen.append(c)
            notes[qn] = ('multi', ''.join(seen))
    return notes


# --- 詳解 furniture patterns (page header/footer bleed) — strip, but KEEP 參考資料 refs ---
# School FOOTER = entire line is just "<校名>大學醫學系<n>級" (nothing after 級).
# A reference citation like "陽明交通大學醫學系116級-藥理學共筆" has text after 級 → NOT matched → kept.
_SCHOOL_FOOTER = re.compile(r'^\s*[國私]?[立]?[一-鿿⾧]{1,8}大學醫學系\s*\d+\s*級\s*$')
_EXAM_HEADER = re.compile(r'\d+\s*年第[一二]次醫師考試')          # page header bleed
_BARE_CLASS = re.compile(r'^\s*醫師[（(][一二][）)]\s*$')          # standalone 醫師(一)/(二)
_CREDIT_LABEL = re.compile(r'^\s*(解題者|審稿者|出題者|校稿者|解題|審稿)\b')
_PAGENO = re.compile(r'^\s*\d{1,3}\s*$')                            # lone page number


def clean_explanation(exp):
    """Strip credit signatures + page header/footer furniture; KEEP 參考資料 + reference citations."""
    lines = exp.split('\n')
    furniture = [False] * len(lines)
    i = 0
    while i < len(lines):
        ln = lines[i]
        if _CREDIT_LABEL.match(ln):
            furniture[i] = True
            # following name/id lines (short, no sentence punctuation, not 參考資料)
            j = i + 1
            while j < len(lines):
                s = lines[j].strip()
                if s == '' or re.match(r'^(M\d|[A-Z]\d)', s) or (
                        len(s) < 22 and not re.search(r'[。，？!]', s)
                        and not s.startswith('參考')):
                    furniture[j] = True
                    j += 1
                else:
                    break
            i = j
            continue
        if _SCHOOL_FOOTER.match(ln) or _EXAM_HEADER.search(ln) or _BARE_CLASS.match(ln):
            furniture[i] = True
        i += 1
    # page numbers: strip only if adjacent to other furniture (footer context)
    for i, ln in enumerate(lines):
        if furniture[i] or not _PAGENO.match(ln):
            continue
        prev_fur = any(furniture[k] for k in range(max(0, i - 2), i))
        next_fur = any(furniture[k] for k in range(i + 1, min(len(lines), i + 3)))
        if prev_fur or next_fur:
            furniture[i] = True
    out = [ln for i, ln in enumerate(lines) if not furniture[i]]
    cleaned = '\n'.join(out)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned


# ---------- reconcile one year ----------
def reconcile_year(year):
    report = {'year': year, 'papers': []}
    for sess in [1, 2]:
        for book in ['醫學一', '醫學二']:
            bshort = book[-1]  # 一/二
            qpdf = f'{PDF_ROOT}/{year}/{year}-{sess}_醫學{bshort}_試題.pdf'
            apdf = f'{PDF_ROOT}/{year}/{year}-{sess}_醫學{bshort}_答案.pdf'
            mpdf = f'{PDF_ROOT}/{year}/{year}-{sess}_醫學{bshort}_更正答案.pdf'
            if not os.path.exists(qpdf):
                continue
            moex_q = parse_questions(qpdf)
            moex_a = parse_answers(apdf)
            corr = parse_corrections(mpdf) if os.path.exists(mpdf) else {}
            ym = load_ym_paper(year, sess, book)

            # match by qNum first (modern years align); verify with similarity
            paper = {'sess': sess, 'book': book, 'n_moex': len(moex_q), 'n_ym': len(ym),
                     'matched': 0, 'qnum_aligned': 0, 'stem_fixes': [], 'answer_diffs': [],
                     'gaps_filled': [], 'orphan_ym': [], 'low_sim': [], 'corrections': corr}
            for qn in sorted(moex_q):
                mq = moex_q[qn]
                official_ans = moex_a[qn - 1] if qn - 1 < len(moex_a) else '?'
                yq = ym.get(qn)
                if yq is None or yq.get('missing'):
                    paper['gaps_filled'].append(qn)
                    continue
                s = sim(mq['stem'], yq['stem'])
                paper['matched'] += 1
                if s > 0.55:
                    paper['qnum_aligned'] += 1
                else:
                    paper['low_sim'].append((qn, round(s, 2), yq['subject']))
                # stem/options diff
                if norm(mq['stem']) != norm(yq['stem']):
                    paper['stem_fixes'].append((qn, round(s, 2)))
                # answer diff: 陽明 vs official (S). corrections noted separately.
                if yq['answer'] and yq['answer'] != official_ans:
                    paper['answer_diffs'].append((qn, yq['answer'], official_ans,
                                                  'CORR' if qn in corr else ''))
            # orphan 陽明 questions (qNum not in moex — shouldn't happen for 100Q papers)
            for qn in ym:
                if qn not in moex_q and not ym[qn].get('missing'):
                    paper['orphan_ym'].append(qn)
            report['papers'].append(paper)
    return report


if __name__ == '__main__':
    import sys
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 114
    rep = reconcile_year(year)
    print(f'\n=== Reconcile report: 民國 {year} ===')
    for p in rep['papers']:
        print(f"\n● {year}-{p['sess']} {p['book']}: 考選部 {p['n_moex']}題 / 陽明 {p['n_ym']}題")
        print(f"   matched={p['matched']}  qNum對齊(sim>.55)={p['qnum_aligned']}")
        print(f"   缺題補洞 gaps_filled={len(p['gaps_filled'])} {p['gaps_filled'][:15]}")
        print(f"   題幹有差異(需以考選部為準) stem_fixes={len(p['stem_fixes'])}")
        print(f"   答案 陽明≠考選部 answer_diffs={len(p['answer_diffs'])}: {p['answer_diffs'][:12]}")
        print(f"   官方更正答案 corrections={p['corrections']}")
        print(f"   低相似(可能對位錯) low_sim={p['low_sim'][:8]}")
        print(f"   陽明孤兒題 orphan_ym={p['orphan_ym'][:8]}")
