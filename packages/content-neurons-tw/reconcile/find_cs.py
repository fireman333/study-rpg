"""Brute-force the 醫師(一) 醫學(一)/(二) c/s for each exam code, validating via PDF header.

The header line '類科名稱：醫師(一)' (NOT 中醫師/牙醫師) + '科目名稱：醫學（一）/（二）' is the
ground-truth. We try a small set of (c, s-pair) candidates and keep the first that validates.
"""
import subprocess, re, sys, json, os
import fitz

UA = 'Mozilla/5.0'
REF = 'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx'
BASE = 'https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx'

C_CANDIDATES = ['301', '201', '101', '401', '501', '601', '303', '317', '321']
S_PAIRS = [('11', '22'), ('0101', '0102'), ('55', '66'), ('01', '02'),
           ('0201', '0202'), ('1', '2'), ('21', '22'), ('0301', '0302')]

CODES = {
    '107-1': '107020', '107-2': '107100', '108-1': '108030', '108-2': '108100',
    '109-1': '109020', '109-2': '109100', '110-1': '110020', '110-2': '110101',
    '111-1': '111020', '111-2': '111100', '112-1': '112020', '112-2': '112100',
    '113-1': '113020', '113-2': '113090',
}


def fetch(code, c, s, out='/tmp/probe.pdf'):
    url = f'{BASE}?t=Q&code={code}&c={c}&s={s}&q=1'
    r = subprocess.run(['curl', '-skS', '-L', '--max-time', '40', '-A', UA, '-e', REF,
                        '-o', out, url], capture_output=True)
    return out


def header_of(path):
    if not os.path.exists(path):
        return None
    try:
        with open(path, 'rb') as f:
            if f.read(4) != b'%PDF':
                return None
        d = fitz.open(path)
        t = d[0].get_text()
        d.close()
        cls = re.search(r'類科名稱[：:]\s*([^\n]+)', t)
        subj = re.search(r'科目名稱[：:]\s*(醫學[（(][一二][）)])', t)
        return (cls.group(1).strip() if cls else '', subj.group(1) if subj else '')
    except Exception:
        return None


def is_medexam1(hdr, want_book):
    """hdr=(類科, 科目). Require 類科 starts with 醫師(一) (not 中/牙) and 科目=醫學(want)."""
    if not hdr:
        return False
    cls, subj = hdr
    if not re.match(r'^醫師[（(]一[）)]', cls):  # excludes 中醫師/牙醫師
        return False
    return bool(subj) and want_book in subj


def find_for_exam(label, code):
    for c in C_CANDIDATES:
        for s1, s2 in S_PAIRS:
            h1 = header_of(fetch(code, c, s1))
            if is_medexam1(h1, '一'):
                # verify 醫學二 with paired s
                h2 = header_of(fetch(code, c, s2))
                if is_medexam1(h2, '二'):
                    return c, s1, s2
                # try other s for 醫學二 with same c
                for _, alt in S_PAIRS:
                    h2 = header_of(fetch(code, c, alt))
                    if is_medexam1(h2, '二'):
                        return c, s1, alt
    return None


if __name__ == '__main__':
    targets = sys.argv[1:] if len(sys.argv) > 1 else list(CODES)
    out = {}
    for label in targets:
        code = CODES[label]
        res = find_for_exam(label, code)
        if res:
            c, s1, s2 = res
            out[label] = {'code': code, 's1': f'{c}/{s1}', 's2': f'{c}/{s2}'}
            print(f'{label} ({code}): 醫學一 {c}/{s1}  醫學二 {c}/{s2}  ✓')
        else:
            out[label] = {'code': code, 's1': 'NOTFOUND', 's2': 'NOTFOUND'}
            print(f'{label} ({code}): NOT FOUND ✗')
    json.dump(out, open('cs_found.json', 'w'), ensure_ascii=False, indent=1)
    print('\nwrote cs_found.json')
