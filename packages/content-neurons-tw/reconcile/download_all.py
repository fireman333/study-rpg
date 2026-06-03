"""Download all 36 papers (Q/S/M) per manifest, validate each 試題 parses to ~100 Q."""
import json, os, subprocess, sys
from parse_moex import parse_questions, parse_answers

UA = 'Mozilla/5.0'
REF = 'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx'
BASE = 'https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx'
man = json.load(open('manifest.json'))


def dl(code, c, s, t, out):
    url = f'{BASE}?t={t}&code={code}&c={c}&s={s}&q=1'
    subprocess.run(['curl', '-skS', '-L', '--max-time', '90', '-A', UA, '-e', REF,
                    '-o', out, url], capture_output=True)
    with open(out, 'rb') as f:
        return f.read(4) == b'%PDF'


def main():
    only = sys.argv[1:] if len(sys.argv) > 1 else list(man)
    problems = []
    for lbl in only:
        m = man[lbl]
        year, sess = lbl.split('-')
        d = f'pdf/{year}'
        os.makedirs(d, exist_ok=True)
        for bshort, s in [('一', m['s1']), ('二', m['s2'])]:
            for t, tn in [('Q', '試題'), ('S', '答案'), ('M', '更正答案')]:
                out = f'{d}/{year}-{sess}_醫學{bshort}_{tn}.pdf'
                ok = dl(m['code'], m['c'], s, t, out)
                if not ok:
                    problems.append(f'{out} (not PDF)')
            # validate 試題 parses
            qp = f'{d}/{year}-{sess}_醫學{bshort}_試題.pdf'
            try:
                qs = parse_questions(qp)
                nbad = sum(1 for q in qs.values() if len(q.get('options', {})) != 4)
                na = len(parse_answers(f'{d}/{year}-{sess}_醫學{bshort}_答案.pdf'))
                flag = '' if (len(qs) >= 95 and nbad == 0 and na >= 95) else '  ⚠'
                print(f'  {lbl} 醫學{bshort}: {len(qs)}Q bad={nbad} ans={na}{flag}')
                if flag:
                    problems.append(f'{lbl} 醫學{bshort}: {len(qs)}Q bad={nbad} ans={na}')
            except Exception as e:
                print(f'  {lbl} 醫學{bshort}: PARSE FAIL {e}')
                problems.append(f'{lbl} 醫學{bshort}: parse fail')
    print(f'\n=== problems: {len(problems)} ===')
    for p in problems:
        print(' ', p)


if __name__ == '__main__':
    main()
