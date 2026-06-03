"""Extract 104/105 陽明 詳解 PDFs → _extracted/ markdown (explanation source for reconcile).

Three 陽明 formats (Phase 0 confirmed):
  - inline:     `N <stem>` / `(A)..(D)` / `Ans：(X)...` / `Key：<expl>` / `Ref：<ref>`
                → 104-1 醫一/醫二, 105-1 醫一/醫二. No per-Q 科目.
  - structured: per page `N` / `撰寫人` / `題目 <stem>` / `A.B.C.D.` / `答案 <X>` /
                `科目 <subj>` / `答題要訣 <tips>` / `參考詳解 <expl>`
                → 105-2 醫一/醫二 (text) + 104-2 醫一/醫二 (via OCR). HAS per-Q 科目.

104/105 are OLD grouping (醫一 holds 微免/寄生/公衛; 醫二 = 生理/生化/藥理/病理) — like 106-1.
Output is filed under ONE bucket subject folder per book; finalize.py OLD blocks set the
canonical subject. The 陽明 科目 (structured only) is preserved as `**科目**：` for block-building.

Usage: python parse_ym_104_105.py <out_dir>   (defaults to a test dir; pass the real _extracted to write there)
"""
from __future__ import annotations
import fitz, os, re, subprocess, sys
from pathlib import Path

BASE = Path(os.path.expanduser("~/Desktop/國考/一階國考/陽明國考考古"))
BUCKET = {"醫學一": "解剖學", "醫學二": "生理學"}  # single valid modern folder; finalize OLD overrides
FW = {"Ａ": "A", "Ｂ": "B", "Ｃ": "C", "Ｄ": "D", "Ｅ": "E"}

# 8 PDFs: (filename, year, session, book, kind). 104-2 = OCR.
PDFS = [
    ("104-1醫學(一).pdf", 104, 1, "醫學一", "inline"),
    ("104-1醫學(二).pdf", 104, 1, "醫學二", "inline"),
    ("104-2醫學(一).pdf", 104, 2, "醫學一", "ocr"),
    ("104-2醫學(二).pdf", 104, 2, "醫學二", "ocr"),
    ("105-1醫學(一).pdf", 105, 1, "醫學一", "inline"),
    ("105-1醫學(二).pdf", 105, 1, "醫學二", "inline"),
    ("105-2醫學(一).pdf", 105, 2, "醫學一", "structured"),
    ("105-2醫學(二).pdf", 105, 2, "醫學二", "structured"),
]

_FURN_INLINE = [
    re.compile(r"中華民國.*國考詳解"), re.compile(r"^醫學\s*[（(][一二][）)]\s*撰寫"),
    re.compile(r"^校稿[：:]"), re.compile(r"^\s*$"),
    # 105-1 furniture
    re.compile(r"聲明[：:]"), re.compile(r"內含|内含"), re.compile(r"營利|追究權"),
    re.compile(r"^Page\s*\d"), re.compile(r"^\d+[（(][一二][）)]醫學"), re.compile(r"學術交流"),
]
_FURN_STRUCT = [
    re.compile(r"歷屆國考詳解"), re.compile(r"陽明醫學"), re.compile(r"版權所有"),
    re.compile(r"^撰寫人[：:]"), re.compile(r"^審稿人[：:]"), re.compile(r"嚴禁盜用"),
]


_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")  # C0/C1 control chars (keep \n,\t)


def _doc_text(pdf):
    d = fitz.open(pdf)
    return _CTRL.sub("", "\n".join(d[i].get_text() for i in range(d.page_count)))


def _ocr_text(pdf):
    """104-2: render each page @300dpi → macOS Vision OCR → joined text."""
    from ocrmac import ocrmac
    d = fitz.open(pdf)
    out = []
    for p in range(d.page_count):
        png = f"/tmp/_ym_ocr_{os.getpid()}.png"
        d[p].get_pixmap(dpi=300).save(png)
        res = ocrmac.OCR(png, language_preference=["zh-Hant", "en-US"]).recognize()
        res = sorted(res, key=lambda r: -r[2][1])  # top-to-bottom
        out.append("\n".join(t for t, c, b in res))
    os.remove(f"/tmp/_ym_ocr_{os.getpid()}.png") if os.path.exists(f"/tmp/_ym_ocr_{os.getpid()}.png") else None
    return "\n".join(out)


def _strip(text, pats):
    return "\n".join(ln for ln in text.split("\n") if not any(p.search(ln.strip()) for p in pats))


def _opts_any(block):
    """Parse options in either `(A)` or `A.` style; return (stem, {A..D}) or None."""
    for pat in [r"[（(]([A-DＡ-Ｄ])[）)]", r"(?m)^\s*([A-DＡ-Ｄ])\."]:
        seen = {}
        for m in re.finditer(pat, block):
            L = FW.get(m.group(1), m.group(1))
            if L not in seen:
                seen[L] = m.start()
        if all(k in seen for k in "ABCD") and seen["A"] < seen["B"] < seen["C"] < seen["D"]:
            stem = block[: seen["A"]].strip()
            opts, order = {}, "ABCD"
            for i, L in enumerate(order):
                end = seen[order[i + 1]] if i + 1 < len(order) else len(block)
                txt = re.sub(r"^[\s（(]*[A-DＡ-Ｄ][）).]?\s*", "", block[seen[L]:end])
                opts[L] = re.sub(r"\s+", " ", txt).strip()
            return stem, opts
    return None


def parse_inline(text):
    text = _strip(text, _FURN_INLINE)
    # Anchor on Ans：(X) — one per question, reliable (≈100/book). qNum = order.
    anchors = list(re.finditer(r"Ans[：:]\s*[（(]?([A-DＡ-Ｄ])", text))
    # candidate question-number markers: `N ` or `N.` at line start
    nummarks = [(int(m.group(1)), m.start()) for m in re.finditer(r"(?m)^\s*(\d{1,3})[.\s]\s*(?=\S)", text)]
    out = {}
    for i, am in enumerate(anchors):
        qn = i + 1
        a_pos = am.start()
        prev_a = anchors[i - 1].end() if i > 0 else 0
        next_a = anchors[i + 1].start() if i + 1 < len(anchors) else len(text)
        # stem start = number marker == qn in (prev_a, a_pos); else nearest num marker before a_pos
        cands = [p for (n, p) in nummarks if prev_a <= p < a_pos and n == qn]
        if not cands:
            cands = [p for (n, p) in nummarks if prev_a <= p < a_pos]
        stem_start = max(cands) if cands else prev_a
        # explanation ends at next question's stem-number marker (before next Ans)
        nxt = [p for (n, p) in nummarks if a_pos < p < next_a and n == qn + 1]
        if not nxt:
            nxt = [p for (n, p) in nummarks if a_pos < p < next_a]
        expl_end = min(nxt) if nxt else next_a
        pre = text[stem_start:a_pos]
        pre = re.sub(r"(?m)^\s*\d{1,3}[.\s]", "", pre, count=1)  # drop leading number
        parsed = _opts_any(pre)
        ans = FW.get(am.group(1), am.group(1))
        post = text[am.end():expl_end]
        km = re.search(r"(Key|詳解)\s*[：:]", post)
        expl = (post[km.end():] if km else post).strip()
        if not parsed:
            out[qn] = {"stem": re.sub(r"\s+", " ", pre).strip()[:200], "options": {}, "answer": ans,
                       "explanation": expl, "subject": None, "_bad": True}
            continue
        stem, opts = parsed
        out[qn] = {"stem": re.sub(r"\s+", " ", stem).strip(), "options": opts, "answer": ans,
                   "explanation": expl, "subject": None}
    return out


def parse_structured(text):
    text = _strip(text, _FURN_STRUCT)
    # Anchor on 題目 markers — one per question (≈100/book). qNum = order.
    anchors = [m.end() for m in re.finditer(r"(?m)^\s*題目\s*$", text)]
    if len(anchors) < 5:  # OCR may render 題目 inline, not own-line
        anchors = [m.end() for m in re.finditer(r"題目", text)]
    out = {}
    for i, a in enumerate(anchors):
        qn = i + 1
        end = anchors[i + 1] if i + 1 < len(anchors) else len(text)
        block = "題目\n" + text[a:end]
        def sect(label, nxt):
            # label may be alone on its line OR followed by inline content (105-2 mixes both)
            m = re.search(rf"(?m)^\s*{label}\s*", block)
            if not m:
                return ""
            tail = block[m.end():]
            n = re.search(rf"(?m)^\s*(?:{nxt})\b", tail)
            return (tail[: n.start()] if n else tail).strip()
        stem_raw = sect("題目", "答案|科目|答題要訣|參考詳解")
        ans_raw = sect("答案", "科目|答題要訣|參考詳解")
        subj = sect("科目", "答題要訣|參考詳解|資料出處").strip() or None
        expl = (sect("答題要訣", "參考詳解|資料出處") + "\n" + sect("參考詳解", "資料出處")).strip()
        # split stem vs A.B.C.D. options
        om = list(re.finditer(r"(?m)^\s*([A-D])\.\s*(.*)$", stem_raw))
        opts = {}
        stem = stem_raw
        if len(om) >= 4:
            stem = stem_raw[: om[0].start()].strip()
            for j, mm in enumerate(om[:4]):
                L = mm.group(1)
                oend = om[j + 1].start() if j + 1 < len(om) else len(stem_raw)
                opts[L] = re.sub(r"\s+", " ", stem_raw[mm.start(): oend].split(".", 1)[-1]).strip()
        ans_m = re.search(r"([A-DＡ-Ｄ])", ans_raw)
        ans = FW.get(ans_m.group(1), ans_m.group(1)) if ans_m else "?"
        out[qn] = {"stem": re.sub(r"\s+", " ", stem).strip(), "options": opts, "answer": ans,
                   "explanation": expl.strip(), "subject": subj}
    return out


def extract(fname, kind):
    pdf = str(BASE / fname)
    if kind == "ocr":
        return parse_structured(_ocr_text(pdf))
    if kind == "structured":
        return parse_structured(_doc_text(pdf))
    return parse_inline(_doc_text(pdf))


def write_md(qmap, year, sess, book, out_dir):
    folder = Path(out_dir) / book / BUCKET[book]
    folder.mkdir(parents=True, exist_ok=True)
    lines = [f"---\nyear: {year}\nsession: {sess}\nbook: {book}\nsubject: {BUCKET[book]}\n"
             f"question_range: \"1-{max(qmap)}\"\nextracted_from: \"{year}-{sess}陽明\"\n"
             f"extracted_at: \"2026-06-03\"\n---\n\n# {year}-{sess} {book} 陽明詳解\n"]
    for qn in sorted(qmap):
        q = qmap[qn]
        lines.append(f"\n## Q{qn}\n")
        if q.get("subject"):
            lines.append(f"\n**科目**：{q['subject']}\n")
        lines.append("\n### 題幹\n" + q["stem"] + "\n")
        lines.append("\n### 選項\n" + "\n".join(f"- ({L}) {q['options'].get(L,'')}" for L in "ABCD") + "\n")
        lines.append("\n### 答案\n(" + q["answer"] + ")\n")
        lines.append("\n### 詳解\n" + (q.get("explanation") or "") + "\n")
    (folder / f"{year}-{sess}.md").write_text("".join(lines), encoding="utf-8")
    return folder / f"{year}-{sess}.md"


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "/tmp/_extracted_test"
    for fname, year, sess, book, kind in PDFS:
        qmap = extract(fname, kind)
        bad = [qn for qn, q in qmap.items() if q.get("_bad") or len(q.get("options", {})) != 4 or not q["stem"]]
        nsubj = sum(1 for q in qmap.values() if q.get("subject"))
        p = write_md(qmap, year, sess, book, out_dir)
        print(f"{fname} [{kind}]: {len(qmap)}Q, bad={len(bad)}{bad[:8]}, with-科目={nsubj} → {p}")


if __name__ == "__main__":
    main()
