#!/usr/bin/env python3
"""
Second-pass page resolver for the born-digital questions that `resolve_all_pages.py`
left in its agent worklist (disagree / suspect / unresolved). Reuses the trusted
detector primitives, but with stronger signals than the single-token cross-check
of the base resolver:

  * CLEAN-CJK booklets: multi-token stem voting (up to 5 distinctive CJK runs,
    each ≥6 chars) — a stem run appearing on a page is a near-unique content
    fingerprint — constrained to the within-booklet monotonic window inferred
    from the base map's true start-pages.
  * GARBLED-CJK booklets (broken custom-font text layer, e.g. 104-2 醫學(二)):
    CJK extraction is mojibake, but the Latin/English terms AND the per-card
    question NUMBER survive in the text layer. Resolve by numeric anchor
    (standalone qnum after the card header) cross-checked by Latin tokens from
    the stem.

A resolution is kept ONLY when it is unambiguous + monotonic; everything else is
emitted to `residual-agent-worklist.json` for the agent pass (which reads the PDF
— rendered pages for garbled booklets — and returns {id, page0}). Agent results
are folded back deterministically via `--agent-results`, with the same monotonic
content gate applied, so a wrong page is never shipped.

This is a SEPARATE committed layer (`provenance/question-page-map-residual.json`)
from the base `question-page-map.json`, so re-running `resolve_all_pages.py` never
clobbers the residual coverage, and re-running this never clobbers the base.

Pages are 0-based (PyMuPDF doc[page]); the JS builder adds +1 for #page=N.

Run:  .venv-fitz/bin/python resolve_residual.py \
        --source-root "~/Desktop/國考/一階國考/陽明國考考古"
      # after the agent pass:
      .venv-fitz/bin/python resolve_residual.py --agent-results agent-resolved.json
"""
import argparse, json, os, re
from collections import defaultdict
import fitz
fitz.TOOLS.mupdf_display_errors(False)  # 114-1 PDFs have benign broken xref entries
from detect_figures import build_full_text_and_pagemap, offset_to_page

HERE = os.path.dirname(__file__)
PKG = os.path.join(HERE, "..", "..")
CORPUS = os.path.join(PKG, "data", "medexam-reconciled", "questions.json")
MANIFEST = os.path.join(PKG, "explanation-figures", "manifest.json")
BASE_MAP = os.path.join(PKG, "provenance", "question-page-map.json")
BASE_REPORT = os.path.join(PKG, "provenance", "resolve-report.json")
OUT_MAP = os.path.join(PKG, "provenance", "question-page-map-residual.json")
OUT_WORKLIST = os.path.join(PKG, "provenance", "residual-agent-worklist.json")


def _norm(s):
    return re.sub(r"\s+", "", s or "")


def cjk_tokens(stem):
    """Up to 5 longest distinct CJK runs (≥6 chars) — distinctive content fingerprints."""
    n = _norm(stem)
    return [r[:20] for r in sorted(set(re.findall(r"[一-鿿]{6,}", n)), key=len, reverse=True)[:5]]


def latin_tokens(stem):
    """Distinct Latin/English terms ≥5 chars — survive a garbled CJK text layer."""
    return [t for t in sorted(set(re.findall(r"[A-Za-z][A-Za-z\-]{4,}", stem or "")), key=len, reverse=True)[:6]]


def longest_stem_run(stem, page_text):
    """Length of the longest contiguous (whitespace-tolerant) run of the question's stem
    that appears on a page. A page printing the question's 題目 line scores ≥ ~12; a page
    that merely cross-references a keyword scores low. Caps at 24 (enough to be decisive)."""
    sn = _norm(stem)
    pn = _norm(page_text)
    for L in range(min(len(sn), 24), 4, -1):
        for st in range(0, min(len(sn) - L + 1, 40)):
            if sn[st:st + L] in pn:
                return L
    return 0


def token_page_hits(toks, full, offs):
    """page -> set of distinct tokens that appear on it (whitespace-tolerant)."""
    pp = defaultdict(set)
    for tok in toks:
        pat = re.compile(r"\s*".join(map(re.escape, tok)))
        for m in pat.finditer(full):
            pp[offset_to_page(m.start(), offs)].add(tok)
    return pp


def page_text_cache(pdf_path):
    doc = fitz.open(pdf_path)
    pages = [(i, doc[i].get_text(), None) for i in range(doc.page_count)]
    doc.close()
    full, offs = build_full_text_and_pagemap(pages)
    return pages, full, offs


def leading_qnums(pages):
    """For garbled booklets: page -> qnum read from the standalone number line that
    follows the (mojibake) card header in the first ~240 chars of the page."""
    qpage = {}
    for p, t, _ in pages:
        for n in re.findall(r"\n\s*(\d{1,3})\s*\n", t[:240]):
            if 1 <= int(n) <= 100:
                qpage.setdefault(int(n), p)
                break
    return qpage


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-root", default=os.path.expanduser("~/Desktop/國考/一階國考/陽明國考考古"))
    ap.add_argument("--agent-results", help="JSON {id: page0} (or [{id,page0}]) of agent-resolved pages to fold in")
    ap.add_argument("--blocklist", help="JSON [id,...] of questions an audit flagged wrong → force-exclude (button stays hidden)")
    args = ap.parse_args()

    corpus = json.load(open(CORPUS, encoding="utf-8"))
    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    base_map = json.load(open(BASE_MAP, encoding="utf-8"))
    report = json.load(open(BASE_REPORT, encoding="utf-8"))

    corpus_ids = set(q["id"] for q in corpus)
    manifest_ids = set(manifest.keys())
    base_ids = set(base_map.keys())
    dis = {d["id"] for d in report["disagreements"]}
    sus = {s["id"] for s in report["suspects"]}
    unresolved = corpus_ids - manifest_ids - base_ids - dis - sus
    # residual to resolve = everything without an authoritative page (manifest figure pages win)
    residual_ids = (unresolved | sus | dis) - manifest_ids

    meta = {q["id"]: q.get("meta", {}) for q in corpus}
    stems = {q["id"]: q.get("stem", "") for q in corpus}

    # base map true start-pages → monotonic anchors per booklet
    anchor = defaultdict(dict)  # booklet -> {qnum: page0}
    for qid, ent in base_map.items():
        m = meta[qid]
        anchor[(m["year"], m["session"], m["book"])][m["qNumber"]] = ent["page"]

    notext = set(report["report"]["notextBooklets"])
    bfiles = {k: report["perBooklet"][k]["file"] for k in report["perBooklet"]}

    def bkstr(y, s, book):
        return f"{y}-{s}{'一' if book == '醫學一' else '二'}"

    # fold-in agent results
    agent_pages = {}
    if args.agent_results:
        raw = json.load(open(args.agent_results, encoding="utf-8"))
        items = raw.items() if isinstance(raw, dict) else ((r["id"], r["page0"]) for r in raw)
        for qid, p in items:
            if p is not None:
                agent_pages[qid] = int(p)

    blocklist = set()
    if args.blocklist:
        blocklist = set(json.load(open(args.blocklist, encoding="utf-8")))

    by_booklet = defaultdict(list)
    for qid in residual_ids:
        m = meta[qid]
        by_booklet[(m["year"], m["session"], m["book"])].append(qid)

    resolved = {}   # qid -> {file, page, method}
    worklist = []   # uncertain → agent pass

    for bk in sorted(by_booklet):
        y, s, book = bk
        ks = bkstr(y, s, book)
        fname = bfiles.get(ks)
        scanned = ks in notext
        no_source = fname is None
        res = sorted(by_booklet[bk], key=lambda q: meta[q]["qNumber"])

        if no_source:
            for qid in res:
                worklist.append({"id": qid, "qn": meta[qid]["qNumber"], "file": None,
                                 "booklet": ks, "reason": "no-source-pdf"})
            continue

        path = os.path.join(args.source_root, fname)
        pages, full, offs = page_text_cache(path)
        npages = len(pages)
        kp = anchor.get(bk, {})  # base true-start anchors for windowing
        garbled = not cjk_present(full)

        # numeric anchors for garbled booklets
        lq = leading_qnums(pages) if (garbled or scanned) else {}

        # ---- resolve candidates ----
        cand = {}  # qid -> (page or None, method, ambiguous)
        for qid in res:
            qn = meta[qid]["qNumber"]
            if qid in blocklist:
                cand[qid] = (None, "audit-blocked", True)  # audit said wrong, no correction → hide
                continue
            # agent override first (already PDF-verified by a human-equivalent reader)
            if qid in agent_pages:
                cand[qid] = (agent_pages[qid], "agent", False)
                continue
            # NB: a booklet flagged `notext` (here `scanned`) was excluded by the base resolver
            # only because find_question_starts matched <30 anchors in its layout — it is NOT
            # necessarily image-only. 4 of the 5 (104-1一/二, 105-1一/二) carry a clean CJK text
            # layer and resolve fine via stem-run; the 5th (104-2一) is garbled-font like 104-2二.
            # So we DON'T skip them — they flow through the clean / garbled paths below. A truly
            # textless page just yields no token hit → worklist (safe), never a guessed page.
            lo = max([kp[q] for q in kp if q < qn], default=0)
            hi = min([kp[q] for q in kp if q > qn], default=npages - 1)
            if garbled:
                p = lq.get(qn)
                lt = latin_tokens(stems[qid])
                ok = False
                if p is not None and lt:
                    plat = set(re.findall(r"[A-Za-z][A-Za-z\-]{4,}", pages[p][1]))
                    ok = bool(set(lt) & plat)
                cand[qid] = (p if ok else None, "numeric+latin" if ok else "garbled", not ok)
                continue
            # clean CJK: multi-token vote within window
            cjk = token_page_hits(cjk_tokens(stems[qid]), full, offs)
            lat = token_page_hits(latin_tokens(stems[qid]), full, offs)
            votes = defaultdict(int)
            for pp, toks in cjk.items():
                votes[pp] += len(toks)
            for pp, toks in lat.items():
                votes[pp] += len(toks)
            inwin = {pp: v for pp, v in votes.items() if lo - 1 <= pp <= hi + 1}
            pool = inwin if inwin else votes
            if not pool:
                cand[qid] = (None, "no-token-hit", True)
                continue
            mx = max(pool.values())
            tops = sorted(pp for pp, v in pool.items() if v == mx)
            best = tops[0]
            # ambiguous if >1 page ties for the max AND they straddle different cards (>1 apart)
            ambiguous = len(tops) > 1 and (tops[-1] - tops[0] > 1)
            method = "cjk-vote" if cjk.get(best) else ("latin-vote" if lat.get(best) else "vote")
            cand[qid] = (best, method, ambiguous)

        # ---- validation gate ----
        # PRIMARY (clean booklets): the question's own 題目 stem must appear on the chosen page as
        # a long contiguous run (≥8). This is authoritative — it directly proves the card is there —
        # and immune to 陽明's quirky internal card numbering + multi-card pages that fool a pure
        # monotonicity heuristic. A page that merely cross-references one keyword scores low, so this
        # rejects the cross-ref off-by-one that token-count voting can pick.
        # FALLBACK: monotonicity — used for garbled booklets (mojibake text, vision/numeric-resolved)
        # and for reworded-stem questions an agent located by 題號/options (no verbatim run on page).
        picks = {qn_of(meta, qid): cand[qid][0] for qid in res if cand[qid][0] is not None}
        merged = dict(kp)
        merged.update(picks)
        order = sorted(merged)

        def mono_ok(qn, p):
            prevs = [merged[q] for q in order if q < qn and merged[q] is not None]
            nexts = [merged[q] for q in order if q > qn and merged[q] is not None]
            return (not prevs or p >= max(prevs) - 1) and (not nexts or p <= min(nexts) + 1)

        for qid in res:
            qn = meta[qid]["qNumber"]
            p, method, ambiguous = cand[qid]
            reason = None
            if p is None:
                reason = method
            elif garbled:
                # mojibake text layer → can't content-check; rely on monotonic ordering of the
                # numeric-anchor / vision resolution.
                if not mono_ok(qn, p):
                    reason = "mono-violation"
            else:
                run = longest_stem_run(stems[qid], pages[p][1]) if 0 <= p < npages else 0
                if run >= 8:
                    pass  # verbatim 題目 stem on the page → accept (authoritative)
                elif method == "agent" and mono_ok(qn, p):
                    pass  # agent located a reworded-stem card by 題號/options; ordering consistent
                else:
                    reason = "agent-unverified" if method == "agent" else (
                        "ambiguous-multi-page" if ambiguous else "content-weak")
            if reason:
                worklist.append({"id": qid, "qn": qn, "file": fname, "booklet": ks,
                                 "candidatePage": p, "method": method, "reason": reason,
                                 "garbled": garbled, "scanned": scanned})
            else:
                resolved[qid] = {"file": fname, "page": p, "v": method}

    # write residual map (sorted, 0-based) + worklist
    ordered = {k: {"file": resolved[k]["file"], "page": resolved[k]["page"]} for k in sorted(resolved)}
    json.dump(ordered, open(OUT_MAP, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    json.dump(worklist, open(OUT_WORKLIST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    from collections import Counter
    print("=== resolve_residual REPORT ===")
    print(f"  residual born-digital + scanned + no-source : {len(residual_ids)}")
    print(f"  resolved (residual map)                     : {len(resolved)}")
    print(f"    by method: {dict(Counter(r['v'] for r in resolved.values()))}")
    print(f"  agent worklist                              : {len(worklist)}")
    print(f"    by reason: {dict(Counter(w['reason'] for w in worklist))}")


def qn_of(meta, qid):
    return meta[qid]["qNumber"]


def cjk_present(full):
    """Heuristic: does the text layer carry real CJK? Garbled custom-font PDFs map
    Chinese glyphs to PUA / Latin-extended code points, so a real-CJK ratio check
    distinguishes them. Sample the first 20k chars."""
    sample = full[:20000]
    cjk = len(re.findall(r"[一-鿿]", sample))
    return cjk >= 200


if __name__ == "__main__":
    main()
