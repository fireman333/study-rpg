"""Discover 考選部 exam codes + c/s for 104-1/104-2/105-1/105-2 醫師(一).

Probes the most-likely codes first (020=first sitting, 100=second sitting, by
analogy to 106-114), validating each via the PDF header (類科名稱 醫師(一) +
科目名稱 醫學（一）/（二）). Reuses find_cs.find_for_exam for the c/s brute force.
"""
import json, sys
from find_cs import find_for_exam

# Most-likely first, then fallbacks. 104/105 are the 舊分組 era.
CANDIDATES = {
    '104-1': ['104020', '104030', '104010', '104040'],
    '104-2': ['104100', '104090', '104101', '104110', '104080'],
    '105-1': ['105020', '105030', '105010', '105040'],
    '105-2': ['105100', '105090', '105101', '105110', '105080'],
}


def main():
    targets = sys.argv[1:] if len(sys.argv) > 1 else list(CANDIDATES)
    out = {}
    for label in targets:
        found = None
        for code in CANDIDATES[label]:
            res = find_for_exam(label, code)
            if res:
                c, s1, s2 = res
                found = {'code': code, 'c': c, 's1': s1, 's2': s2}
                print(f'{label}: code={code}  c={c}  醫學一 s={s1}  醫學二 s={s2}  ✓')
                break
            else:
                print(f'  {label}: {code} no-match')
        if not found:
            print(f'{label}: NOT FOUND across {CANDIDATES[label]} ✗')
        out[label] = found
    json.dump(out, open('cs_104_105.json', 'w'), ensure_ascii=False, indent=1)
    print('\nwrote cs_104_105.json')
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
