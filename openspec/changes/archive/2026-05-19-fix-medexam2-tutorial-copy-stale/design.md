## Context

Pure copy-edit hotfix. Two string literals in `packages/content-medexam2-tw/src/tutorial.ts` are replaced with new wording that was finalized through a 4-turn interactive grill with the project owner (tutorial inventory → option A/B/C → option A picked → rename pointer added). No new code paths, no schema migration, no cross-cutting impact.

This `design.md` exists only to satisfy the `/opsx:propose` workflow's dependency graph (`tasks` requires `design` + `specs`). It would normally be omitted per the design-doc inclusion criteria ("cross-cutting / new dep / data model / security / migration / ambiguity") — none apply here.

## Goals / Non-Goals

**Goals:**

- Replace `TUTORIAL_STEPS[2].body` so onboarding step 3 reflects shipped click-room-then-pick UX (no longer drag-and-drop).
- Expand `SURFACE_HINTS[2].body` so the `/hospital` surface hint covers assignment + shelf identity + rename pointer, serving as a self-contained safety net for skip-tutorial players.
- Match owner-approved wording verbatim (already pinned in `proposal.md` § What Changes).

**Non-Goals:**

- Touching component code (`TutorialOnboarding.tsx`, `SurfaceHint.tsx`, etc.) — copy lives in the content pack and is consumed by these components via `@study-rpg/content-medexam2-tw` exports; no behavior changes.
- Refreshing `TUTORIAL_STEPS[6].done` feature listing — owner judged it should stay generic.
- Adding a `fate-cards` surface-hint update about targeted tickets — owner judged epic/legendary tier is too deep for new-player tutorial.
- Adding new tutorial surfaces (e.g., a dedicated `/roster` first-visit hint) — would expand `TutorialSurfaceId` type + `tutorial.firstVisit[id]` plumbing; explicitly rejected during grill (option B).
- Refactoring the existing tutorial component or three-layer architecture.

## Decisions

### D1: Edit existing strings in place; do not introduce new tutorial surface

**Decision:** Replace the two existing strings in `tutorial.ts`. Do not add a new `TutorialSurfaceId = 'roster'` first-visit hint to teach the rename feature separately.

**Rationale:** During grill, owner explicitly picked option A (single hospital hint covers 4 concerns) over option B (split into hospital + new roster hint). Adding a new surface id would require:
- Extending `TutorialSurfaceId` union type
- Wiring `tutorial.firstVisit.roster` flag plumbing in the `useSurfaceHint` hook (or equivalent)
- Adding a sync-engine adapter entry for the new flag column
- All of which exceeds the "5-minute copy hotfix" envelope agreed during grill.

**Alternatives considered:**
- (B) Split into 2 hints — rejected on scope grounds above.
- (C) Keep hint minimal, rely on onboarding Step 3 — rejected because skip-tutorial flow bypasses Step 3 entirely.

### D2: Hint copy density acceptable for owner-as-dogfood-user phase

**Decision:** Accept the ~95-character three-sentence hospital hint despite higher density than peer hints (~50-80 chars).

**Rationale:** Owner is the primary player during dogfood phase; density tradeoff is favorable for completeness. If post-dogfood telemetry shows real new players (post M3 npm publish, post external fork adoption) struggle with the dense hint, a follow-up change can split it (see D1's option B as documented escape hatch).

**Alternatives considered:**
- Use shorter copy and accept incomplete coverage — rejected because then skip-tutorial users still miss assignment/rename info.

### D3: Spec deltas MODIFY existing requirements rather than ADD new ones

**Decision:** The `hospital-tutorial` delta uses `## MODIFIED Requirements` for both touched requirements (onboarding flow + surface hints), copying the entire requirement block with updated step 3 text and updated `/hospital` row + new skip-tutorial safety-net sub-clause.

**Rationale:** Both spec edits are refinements of existing requirements (Step 3 description got more precise; surface-hint table cell got more detailed). No new behavior is introduced — only the wording of documentation-style requirements changes. Per the `/opsx:propose` instruction guidance, MODIFIED is correct when changing existing behavior/documentation; ADDED would create duplicate requirements.

## Risks / Trade-offs

- **[Risk]** Hint body becomes too dense for true new-player audience post-M3 (npm publish → external forks) → **Mitigation**: telemetry-driven follow-up that splits hint per D1's option B; clear escape hatch documented.
- **[Risk]** Future owners forget shelf/rename were added 2026-05-19 and revert hint to old generic copy during another refactor → **Mitigation**: spec delta added a skip-tutorial-safety-net sub-clause naming both source changes (`redesign-doctor-roster-as-shelf` + `add-doctor-rename`) inline, so anyone reading the spec sees provenance.
- **[Risk]** Step 3 copy still mismatches if the assignment UX changes again (e.g. drag returns, or a new approval gate is added) → **Mitigation**: spec scenario "Step 3 body describes click-then-pick UX" makes the wording requirement testable; any future change to the UX must update both code and spec scenario together.

## Migration Plan

- No runtime migration. Already-completed players retain `tutorial.completedSteps[*] = true` and never re-trigger. Mid-onboarding players see the new copy on next render of step 3 (or next first-visit of `/hospital`).
- Rollback strategy: revert the single commit; no DB migration to undo. The two string-literal changes are pure data with no dependents.
- Deploy steps:
  1. Edit `packages/content-medexam2-tw/src/tutorial.ts` (two string replacements).
  2. `pnpm --filter @study-rpg/content-medexam2-tw build` to rebuild content pack `dist/`.
  3. `pnpm --filter @study-rpg/medexam2-hospital-tw dev` smoke-test:
     - Open `__db.gameCounters.clear()` in DevTools to fake fresh save.
     - Refresh; advance through onboarding to step 3; verify body reads「點「門診」房間 → 從清單選一位醫師指派…」.
     - Skip rest; manually trigger first-visit hospital hint (or set `tutorial.firstVisit.hospital = undefined`); verify body covers assignment + facility + shelf + ✏️ rename pointer.
  4. Commit on `track-m2`; merge to `main` in next batch sync per `openspec/project.md` § Sync protocol.

## Open Questions

None. Wording, scope, and verification approach were all locked during grill.
