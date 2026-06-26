## Context

`normalizeExplanation` (build.ts) is the single chokepoint every question's `explanation` passes through at build time. It already strips page furniture, trailing whitespace, and collapses blank-line runs. The existing `neurons-corpus-ingestion` spec (Requirement: *Explanation whitespace SHALL be normalized at build time (safe subset)*) **deliberately excluded auto-rejoin**: "Vertical single-character-per-line extraction runs (e.g. `依\n栓\n塞`) SHALL be left intact … auto-rejoining risks corrupting content." That exclusion was correct for its target (single-char vertical runs = table-column cells + word-splits).

But a distinct, larger problem remains untouched: **long prose lines hard-wrapped at the PDF column width** (`增加合\n成`, `作⽤機\n制`). With `white-space: pre-wrap` these render as broken mid-sentence/mid-word breaks across ~3,277 questions. A scratch prototype on real source confirmed a width-guarded rejoin fixes the prose cleanly (4,065/4,600 improved) while leaving short lines (table cells) and single-char runs untouched.

## Goals / Non-Goals

**Goals:**
- Rejoin PDF-column hard-wraps in prose so explanations read as continuous paragraphs.
- Strictly whitespace-only: never add/remove/alter any character; never touch `id`/`answer`/`stem`/`options`.
- Preserve structure: 簡解/詳解 `────` separators, numbered/lettered lists, section headers, flattened tables, single-char vertical runs.
- One deterministic build-time rule applied uniformly; testable; trivially reversible.

**Non-Goals:**
- NOT fixing flattened tables (owned by `neurons-explanation-table-images` crop pipeline).
- NOT rejoining single-char vertical runs (kept excluded per prior decision).
- NOT editing source `data/medexam-reconciled/questions.json` (build-time only).
- NOT touching runtime/Dexie/R2/API.
- NOT perfect prose — residual marker-less false-joins are acceptable (cosmetic, no content loss) and handled by the audit pass.

## Decisions

**D1 — Width guard is what makes rejoin safe (resolves the prior exclusion).** Join only when the *previous* line's visual width ≥ ~28 (a CJK-aware width, tunable). PDF wraps happen at full column width → wrapped lines are long; table cells (`Na`, `✓`, `舊藥`) and single-char runs are short → below threshold → never joined. This threads the exact needle the old spec worried about: the operation it excluded (single-char runs) stays excluded; long prose wraps become a new, safe addition to the subset. *Alt considered:* AI/agent rejoin per-question — rejected (token cost, content-mutation risk, the warning in `~/.claude/imports`; agents are better as auditors).

**D2 — Structural guards decide where NOT to join.** Keep the break when: prev line ends with sentence-final punctuation (`。！？!?：:；;…`) or a closing bracket (`）)】」』]`); OR next line starts a new structural item (`(A)`/`A.`/`1.`/`1°`/`①`/`•`/`→`/`Ref`/`圖`/`表`/heading brackets); OR either side is a separator line (all box-drawing/dash); OR either side is blank. Everything else with a long prev line is treated as a wrap → joined.

**D3 — Joiner character by script.** CJK↔anything → join with no character (Chinese has no inter-word space). ASCII-alnum ↔ ASCII-alnum → join with a single space (English words split across a wrap). This avoids fusing `GABA` + `提升` wrong and avoids gluing two English words.

**D4 — Order: rejoin runs LAST, after existing junk-strip + blank-collapse.** Page-number/footer lines must be removed first (so they don't get fused into prose), and blank-collapse first (so blanks remain reliable join-blockers).

**D5 — Agents audit, never edit.** After the deterministic pass, batch agents review built outputs and return a structured list of suspected residual false-joins / table damage / structure loss. Their output feeds either a new deterministic guard or a tiny hand-fix set — agents do not write the corpus.

## Risks / Trade-offs

- **Residual marker-less false-joins (~10%)** (two sub-clauses with no list marker / punctuation get fused) → Mitigation: cosmetic only (no content loss); audit agents flag the worst; tune guards (e.g. keep break after `) →` patterns).
- **Flattened-table corruption** (the spec's original fear) → Mitigation: width guard keeps short cells untouched; audit agents specifically check table-bearing questions; tables are slated for image-crop replacement anyway.
- **Over-join hides an intended line break** (e.g. a deliberate short-but-unpunctuated line) → Mitigation: width guard means only long lines join; short deliberate lines are below threshold.
- **Coordination**: dirty work tree from other sessions → Mitigation: edit only `build.ts`+test; defer rebuild/commit until tree clean or coordinated; explicit per-file `git add`.

## Migration Plan

1. Add rejoin to `normalizeExplanation` + unit test (pure source change; no rebuild yet).
2. Validate via test + scratch before/after on representative cases (prose, table, list, separator, single-char run).
3. Audit-agent sweep over a built sample; tune guards from findings.
4. When tree is clean/coordinated: `pnpm run build:neurons-content` + copy-content → rebuild `public/questions.json`; verify counts; `/opsx:verify` → archive → explicit per-file commit.
- **Rollback**: revert the `build.ts` diff + rebuild — explanations return to current state (no data migration, no schema, fully reversible).

## Open Questions

- Final wrap-width threshold (start ~28, confirm against built sample during the audit pass).
- Whether any whole sitting/subject should be excluded if its tables dominate (decide from audit findings, not upfront).
