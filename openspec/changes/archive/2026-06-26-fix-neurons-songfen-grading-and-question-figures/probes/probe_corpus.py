#!/usr/bin/env python3
"""Phase-0 probes for rebuild-neurons-corpus-from-official-pdfs (READ-ONLY).

0.1 id-mapping cross-validation (filename-map + SUBJECT_MAP vs oracle ids)
0.4 question-image volume (scan official PDFs for raster images per question)
plus PDF-content sanity (does each official PDF really hold Q1..Q100?).
"""
import os, re, sys, json, collections

SRC = os.path.expanduser("~/Desktop/國考/一階國考/一階國考107-115")
ANS = os.path.join(SRC, "解答")
ORACLE = os.path.join(os.path.dirname(__file__), "..")  # placeholder, set below
ROOT = "/Users/kangweiling/coding-scratch/study-rpg-neurons"
ORACLE = os.path.join(ROOT, "packages/content-neurons-tw/data/medexam-reconciled/questions.json")

sys.path.insert(0, os.path.join(ROOT, "packages/content-neurons-tw/reconcile/healthcheck"))
import detect_figures as df  # SUBJECT_MAP

BOOKCODE = {"1": "醫學一", "5": "醫學一", "2": "醫學二", "6": "醫學二"}

def parse_official(name):
    """107020_5301.pdf -> (year=107, sitting='020', bookcode='5', book='醫學一')."""
    m = re.match(r"(\d{3})(\d{3})_(\d+)301\.pdf$", name)
    if not m:
        return None
    year = int(m.group(1)); sitting = m.group(2); bookcode = m.group(3)
    book = BOOKCODE.get(bookcode)
    if not book:
        return None
    return year, sitting, bookcode, book

def subject_of(book, qn):
    for subj, lo, hi in df.SUBJECT_MAP.get(book, []):
        if lo <= qn <= hi:
            return subj
    return None

# ---- enumerate official question PDFs, assign session by within-year sitting order ----
qpdfs = [f for f in os.listdir(SRC) if f.lower().endswith(".pdf")]
parsed = {}
by_year_sittings = collections.defaultdict(set)
for f in qpdfs:
    p = parse_official(f)
    if not p:
        print("UNPARSED question pdf:", f); continue
    parsed[f] = p
    by_year_sittings[p[0]].add(p[1])
# session rank: ascending sitting code within year -> 1,2
sess_rank = {}
for y, sits in by_year_sittings.items():
    for rank, s in enumerate(sorted(sits), start=1):
        sess_rank[(y, s)] = rank

# expected id set per (year,session,book) from filename-map + SUBJECT_MAP over Q1..100
def expected_ids(year, session, book):
    ids = []
    for qn in range(1, 101):
        subj = subject_of(book, qn)
        ids.append(f"{year}-{session}-{book}-{subj}-Q{qn}")
    return ids

# ---- oracle ----
oracle = json.load(open(ORACLE))
oracle_ids = set(q["id"] for q in oracle)
oracle_by_paper = collections.defaultdict(set)
for q in oracle:
    m = q["meta"]
    oracle_by_paper[(m["year"], m["session"], m["book"])].add(q["id"])

print("=== 0.1 ID-MAPPING CROSS-VALIDATION (official filename-map + SUBJECT_MAP vs oracle) ===")
print(f"{'paper':22} {'sess':4} {'exp':>4} {'inOracle?':9} {'match':>5} {'missGen':>7} {'missOra':>7}")
total_match = total_exp = 0
mismatch_papers = []
for f in sorted(parsed):
    year, sitting, bookcode, book = parsed[f]
    session = sess_rank[(year, sitting)]
    exp = set(expected_ids(year, session, book))
    ora = oracle_by_paper.get((year, session, book), set())
    inter = exp & ora
    miss_gen = exp - ora   # generated but not in oracle (id drift)
    miss_ora = ora - exp   # oracle has but we didn't generate
    total_match += len(inter); total_exp += len(exp)
    flag = "yes" if ora else "NO(115?)"
    print(f"{year}-{session}-{book:7}({bookcode}) s{session:<3}{len(exp):>4} {flag:9} {len(inter):>5} {len(miss_gen):>7} {len(miss_ora):>7}")
    if miss_gen or miss_ora:
        mismatch_papers.append((f, year, session, book, sorted(miss_gen)[:6], sorted(miss_ora)[:6]))
print(f"\nTOTAL expected ids: {total_exp}  matched-in-oracle: {total_match}  ({100*total_match/total_exp:.1f}%)")
print(f"papers with any id drift: {len(mismatch_papers)}")
for f, y, s, b, mg, mo in mismatch_papers:
    print(f"  [{y}-{s}-{b}] gen-not-in-oracle e.g. {mg}")
    print(f"            oracle-not-gen   e.g. {mo}")
