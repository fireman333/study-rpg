# Design — restore-neurons-jianjie-key

## Context

`reconcile.py:83` does `'explanation': gettext('詳解')`. The `parse_ym_md` parser already collects
every `### <label>` section under each `## Q<n>` block into `secs`, but only the 詳解 label is
emitted — so the 陽明 author's `### Key` (簡解 / 答題要訣) is parsed and then discarded. The corpus
is now hand-maintained (subject reclass, content-bug fixes, OCR-garble, recovered empty 詳解), so a
full `reconcile_all.py` regen is forbidden — the fix must be a targeted by-id merge on the current
file. The `### Key` content survives untouched in the source `.md` at
`~/Desktop/國考/一階國考/陽明國考考古/_extracted/<book>/<subject>/<year>-<sess>.md`.

## Goals / Non-Goals

**Goals**
- Restore the 簡解 (answering tips) for every 陽明-path question that has a non-empty, meaningful
  source `### Key`, above the existing 詳解.
- Faithful: `id` / `answer` untouched; the original 詳解 preserved verbatim; Key text only
  NFKC-normalized (canonical-form fix for compatibility radicals like ⼤→大, already an accepted
  transform in this corpus's prose gate).
- Idempotent + re-runnable; no full regen.

**Non-Goals**
- No re-run of `reconcile_all.py`; no change to `id` / `answer` / stems / options.
- No app / core / Dexie / sync / economy change.
- Not every question gets a 簡解: questions whose source has no Key, or only a degenerate one, stay
  as-is.

## Decisions

### Decision 1 — Targeted by-id merge, never regen
Map source → corpus by `(book, year, session, qNumber)` (verified collision-free: qNumbers are
global 1..100 per book in both corpus and source, each subject owning a non-overlapping range).
Write back with the file's exact serialization
(`json.dumps(data, ensure_ascii=False, separators=(', ', ': '))`, no trailing newline) so only the
changed `explanation` values differ. Count asserted to stay 4600.

### Decision 2 — Owner-decided format (簡解 label + divider)
`簡解：\n<Key>\n\n────────────────\n\n<existing explanation>`. Renders as plain `pre-wrap` text;
`簡解：` doubles as the idempotency sentinel. The 詳解 keeps no extra label (owner: 「用分隔線隔開
兩者」). 42 questions previously restored with a `簡解：…詳解：…` label style are reformatted to this
divider format for consistency.

### Decision 3 — Skip degenerate Keys and already-present
- **Idempotent**: an explanation already starting with `簡解：` is skipped (or, if it uses the old
  `詳解：` label and no divider, reformatted once).
- **Already verbatim**: a Key ≥ 8 stripped chars already contained in the 詳解 is not duplicated
  (short keys are too collision-prone to trust as a containment signal, so they are restored).
- **Noise**: empty / pure-punctuation / digit-only / 「見詳解」/「無」/「見上」/「同上」/「略」/「見補充」
  Keys are dropped (they restore nothing).

### Decision 4 — Pooled-note bleed guard
The parser only reads `secs['Key']` under each `## Q<n>` block, so cross-question bleed is
structurally unlikely. As a guard, a Key referencing ≥ 2 question numbers (`Q\d+`) is flagged
`ambiguous` and skipped (dry-run found 0).

### Decision 5 — Root cause documented, not code-patched
`reconcile.py` is dormant (the build reads `questions.json` directly; regen is forbidden), so the
Key-drop is fixed in the data via the repair script and a cross-reference comment is left at
`reconcile.py:83`. This mirrors how the corpus's other one-time fixes (subject relabel, OCR garble)
live in the hand-maintained file rather than in reconcile code.

## Risks / Open Questions

- **Short-key false skips**: a long-key verbatim-containment skip is safe; short keys are always
  restored, so no legit tip is lost (worst case a terse tip is shown that also appears in 詳解).
- **NFKC scope**: applied to the Key only (not the 詳解), limited to canonical-form normalization.
- **42 reformat touches already-good content**: low-risk — a single regex replacement of the first
  `詳解：` boundary with the divider; verified to match all 42.

## Decisions (resume context)

Full handoff: `/Users/kangweiling/.claude/scratch/handoff-neurons-detail-tables-and-jianjie-2026-06-25.md`.
Sibling change: `add-neurons-explanation-tables-image-tail` (Part A image-tail) shares the same
hand-maintained `questions.json`; edits are serialized.
