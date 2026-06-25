# Restore the dropped 簡解 (### Key) author tips into 陽明-path explanations

## Why

The reconcile parser (`packages/content-neurons-tw/reconcile/reconcile.py:83`) builds each
question's `explanation` from only the `### 詳解` section, **silently dropping the `### Key`
section** the 陽明 國考考古 authors wrote — their 簡解 / 答題要訣 / 關鍵字 (first-person "how I
tackled this" tips, e.g. 「要記住一個大原則：腦幹層次的損傷…」、「考試當下看到覺得很幹，這就是死背送分題」).
That section *is* captured into `secs` but never emitted. Result: ~2,800 questions lost a study
aid the players (medical students) value. A read-only audit confirmed 3,001 source `### Key`
sections exist; 2,810 are currently missing from the corpus and 100% losslessly recoverable from
the source `.md`. 104/105 use a different parser and have no `### Key` (already merged via
答題要訣); 107-1 / 108-2 (no independent Key) and 115-1 (AI single-section) are out of scope.

## What Changes

A **targeted, by-id merge** repairs the hand-maintained corpus
`packages/content-neurons-tw/data/medexam-reconciled/questions.json` in place — it does **NOT**
re-run `reconcile_all.py` (which would wipe prior hand fixes: 29 subject reclassifications, 6
content-bug fixes, OCR-garble corrections, recovered empty 詳解). `id` and `answer` are never
touched.

- **Prepend a 簡解 block** above the existing 詳解, owner-decided format (renders as plain
  `pre-wrap` text in `Explanation.tsx`):

  ```
  簡解：
  <Key text (NFKC-normalized)>

  ────────────────

  <existing explanation>
  ```

- **Reformat 42 pre-existing** questions whose 簡解 was previously restored with a `簡解：…詳解：…`
  label style to the same divider format, for visual consistency.
- **Skip** questions that already contain their 簡解 (sentinel or verbatim, idempotent),
  degenerate Keys (empty / punctuation / 「見詳解」/「無」), and the excluded sittings above.
- A repeatable, dry-run-first script (`reconcile/restore_jianjie_key.py`) performs the merge and
  emits an `already / prepend / reformatted / noise / excluded / no_key` report.

Dry-run scope (4600 total): **2810 prepend + 42 reformat = 2852 changed**, 140 already-present,
9 noise, 600 excluded (107-1/108-2/115-1), 999 no-source-Key (incl. 104/105). 0 ambiguous.

## Capabilities

### Modified Capabilities
- `neurons-corpus-ingestion`: add a requirement that 陽明-path explanations retain the 簡解
  (`### Key`) author tips, presented above the 詳解 with a divider; degenerate Keys and the
  excluded sittings are left out. (Mirrors the existing one-time-fix requirements such as subject
  relabelling and OCR-garble correction — the hand-maintained corpus is the source of truth, not
  an ongoing reconcile run.)

## Impact

- **Content data only**: `packages/content-neurons-tw/data/medexam-reconciled/questions.json`
  (2852 `explanation` strings changed; round-trips byte-for-byte via
  `json.dumps(..., ensure_ascii=False, separators=(', ', ': '))` so only changed values differ) +
  the `reconcile/restore_jianjie_key.py` repair tool + a root-cause comment at `reconcile.py:83`.
  Rebuild outputs to `apps/neurons-tw/public/content/neurons-tw/`.
- **No** change to `id` / `answer`, `@study-rpg/core`, any `apps/` component, Dexie, R2 bundle /
  sync engine, the sync Worker, D1, leaderboard, or any game economy. No `dexie-fixture-lint`
  concern.
- **Deploy**: neurons Cloudflare Pages only (content rebuild).
- **Coordination**: shares the hand-maintained `questions.json` with the image-tail change; edits
  are serialized. A concurrent session is editing the R2 sync engine (disjoint files) — staging is
  explicit per-file, never `git add -A`.
