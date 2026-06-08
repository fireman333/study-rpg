## 1. Spec audit (read-only — locate the 3 consumer call sites)

- [x] 1.1 Grep `apps/neurons-tw/src/` for `db.neuronVariants.count` / `db.neuronVariants.toArray` / `await db.neuronVariants` to enumerate every site that reads the table for a distinct-count purpose. Classify each as: chip / achievement / leaderboard / collection-view-render (excluded) / fusion-internal (excluded) / other.
- [x] 1.2 Read `apps/neurons-tw/src/lib/services/achievement.ts buildAchievementStats` (or the equivalent stat-builder) and identify the line that produces `variantCount`. Note the current expression.
- [x] 1.3 Read `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts` (or wherever `pushNeuronsLeaderboardRow` is defined) and identify the line that produces `variant_count`. Note the current expression.
- [x] 1.4 Read `apps/neurons-tw/src/routes/CollectionPage.tsx` and `OverviewPage.tsx` (or wherever the `🧬 X 隻` chip is rendered) and identify the line that produces the count. Note the current expression.
- [x] 1.5 Confirm `neuronInstances` has a Dexie compound index on `(familyId, slotIndex)` (per the fusion v13 schema). If not present, scope-cut a follow-up rather than introducing it in this spec-tightening change.

## 2. Helper introduction

- [x] 2.1 Add a new pure helper `ownedSlotCount(db: NeuronsDB): Promise<number>` in `apps/neurons-tw/src/lib/services/variant-ownership.ts` (or extend `fusion.ts` if simpler). Implementation: for each `neuronVariants` row, check whether any `neuronInstances` row exists for that `(familyId, slotIndex)` with `consumedAt == null`; return the count of rows where this is true.
- [x] 2.2 Optionally also export `isSlotOwned(db, familyId, slotIndex): Promise<boolean>` if a per-slot predicate would help any consumer; defer if no consumer needs it.
- [x] 2.3 Document the function header with a one-line comment pointing at the `neuron-variant-fusion` spec's ADDED requirement.

## 3. Consumer rewires

- [x] 3.1 Replace the chip count expression found in 1.4 with `await ownedSlotCount(db)`. Verify React re-renders correctly (Dexie `useLiveQuery` on both tables, OR wrap in a single liveQuery that calls the helper).
- [x] 3.2 Replace the achievement-stat `variantCount` expression found in 1.2 with `await ownedSlotCount(db)`. Verify the trigger chain still fires correctly on subsequent variant unlocks (no off-by-one introduced).
- [x] 3.3 Replace the leaderboard adapter `variant_count` expression found in 1.3 with `await ownedSlotCount(db)`. Verify the upsert payload schema unchanged otherwise.
- [x] 3.4 Grep for any remaining `db.neuronVariants.count` / `.toArray().length` patterns that were not classified as collection-view-render or fusion-internal in 1.1 — every one of these is a regression candidate.

## 4. Tests (vitest)

- [x] 4.1 Add `apps/neurons-tw/src/__tests__/owned-slot-count.test.ts` covering:
  - 0 rows → 0
  - 1 row with 1 held instance → 1
  - 1 row with 2 held + 1 consumed → 1 (slot owned, individual count irrelevant for projection)
  - 1 row with 0 held + 3 consumed (ghost slot) → 0
  - 3 rows: A held / B consumed-all / C mixed → 2 (A and C owned, B ghost excluded)
- [x] 4.2 Add an integration test asserting the leaderboard adapter's `variant_count` field equals `ownedSlotCount(db)` for a state with one ghost slot. Mock Dexie + assert the POST body field.
- [x] 4.3 Add an integration test asserting the achievement stat's `variantCount` equals `ownedSlotCount(db)` for the same state.
- [x] 4.4 Extend the existing fusion-merge test (or add a new one) covering the cross-device race scenario: both devices share `(2 held)` starting state, each promote-consumes a different individual, merge applies, asserts both consumed AND `ownedSlotCount` returns 0 for that slot AND `neuronVariants.copies = 2` preserved.

## 5. Verification

- [x] 5.1 Run `pnpm --filter @study-rpg/neurons-tw test` — all green including new helper / consumer / race tests.
- [x] 5.2 Run `pnpm -r typecheck` — clean.
- [x] 5.3 Run `pnpm lint:dexie-fixtures` — pass (no `.version()` bump).
- [x] 5.4 Run `openspec validate unify-distinct-owned-projection-across-fusion-achievements-leaderboard` — clean.
- [x] 5.5 Run `/opsx:verify` — green on completeness / correctness / coherence.
- [x] 5.6 Chrome MCP smoke (preflight `list_connected_browsers` → boot localhost): trigger a variant pull → confirm chip + achievement stat + (if opted-in) leaderboard payload all use the new projection. Test the ghost-slot path is impractical to reproduce in MCP (requires two-device race), so rely on the unit test for that case.

## 6. Archive

- [x] 6.1 Confirm working tree is clean of unrelated changes per multi-agent git safety rule.
- [x] 6.2 `/opsx:archive` — sync 3 spec deltas into main `openspec/specs/{neuron-variant-fusion,neurons-achievements,neurons-leaderboard}/spec.md`.
- [ ] 6.3 Auto-git commit (explicit per-file add) with subject `spec(archive): merge unify-distinct-owned-projection-across-fusion-achievements-leaderboard — ownedSlotCount canonical projection`.
- [ ] 6.4 Push to origin/track-neurons. Merge to main left to user-driven sync per project workflow.
