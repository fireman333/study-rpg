"""Layout-aware 考選部 試題 parser — fixes wrapped-line detachment.

PyMuPDF's default get_text() detaches wrapped (2nd) lines of long stems/options
on some 考選部 PDFs (e.g. 115), truncating ~24% of questions. `pdftotext -layout`
preserves reading order so wrapped lines stay adjacent. This module re-runs the
same option-splitting logic on the -layout text.

Drop-in: parse_questions_layout(pdf) returns the same {qNum: {stem, options}} shape
as parse_moex.parse_questions.
"""
from __future__ import annotations
import re, subprocess
from parse_moex import _split_options  # reuse the A./B./C./D. splitter

_HEADER_PATS = [
    re.compile(r'代\s*號[：:]\s*\d'),
    re.compile(r'^類科名稱'), re.compile(r'^科目名稱'), re.compile(r'^考試時間'),
    re.compile(r'^座號'), re.compile(r'禁止使用電子計算器'), re.compile(r'單一選擇題'),
    re.compile(r'專門職業及技術人員高等考試.*醫師'),
    re.compile(r'^\s*頁次[：:]'), re.compile(r'^\s*第\s*\d+\s*頁'),
    re.compile(r'^\s*\d+\s*[-－]\s*\d+\s*$'),
]


def _layout_text(pdf_path: str) -> str:
    out = subprocess.run(["pdftotext", "-layout", pdf_path, "-"],
                         capture_output=True, text=True, timeout=60)
    lines = []
    for ln in out.stdout.split("\n"):
        s = ln.rstrip()
        if not s.strip():
            lines.append(""); continue
        if any(p.search(s) for p in _HEADER_PATS):
            continue
        lines.append(s)
    return "\n".join(lines)


def parse_questions_layout(pdf_path: str) -> dict:
    text = _layout_text(pdf_path)
    # collapse intra-line runs of spaces (layout indentation) but keep newlines
    # so the sequential-N. and option detection still works.
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
            result[qn] = {"stem": re.sub(r"\s+", " ", block).strip(), "options": {}, "_bad": True}
            continue
        stem, options = split
        result[qn] = {"stem": re.sub(r"\s+", " ", stem).strip(), "options": options}
    return result


if __name__ == "__main__":
    import sys
    for f, book in [("/Users/kangweiling/Downloads/115020_1301.pdf", "醫一"),
                    ("/Users/kangweiling/Downloads/115020_2301.pdf", "醫二")]:
        mq = parse_questions_layout(f)
        bad4 = [qn for qn, q in mq.items() if len(q.get("options", {})) != 4]
        def trunc(t):
            t = t.rstrip()
            return t.endswith(("何者", "下列")) or t.count("（") > t.count("）") or bool(re.search(r"[A-Za-z]$", t)) and not re.search(r"[）)]\s*$", t)
        truncs = [qn for qn, q in mq.items() if trunc(q["stem"]) or any(trunc(v) for v in q["options"].values())]
        print(f"{book}: parsed={len(mq)} non-4-opt={bad4} truncated={truncs}")
        print(f"   Q34/Q62 sample:" if book == "醫一" else "   Q10 sample:")
        for qn in ([34, 62] if book == "醫一" else [10]):
            if qn in mq:
                print(f"     Q{qn} stem: {mq[qn]['stem'][:80]}")
                for L in "ABCD":
                    print(f"       {L}. {mq[qn]['options'].get(L,'?')[:60]}")
