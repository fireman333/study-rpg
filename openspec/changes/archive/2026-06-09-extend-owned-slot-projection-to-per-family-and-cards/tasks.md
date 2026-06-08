## 1. Helper introduction (variant-ownership.ts)

- [x] 1.1 Refactor the held-slot-key computation in `computeOwnedSlotCount` into a shared private `heldSlotKeySet(instances)` core (no behaviour change to the global projection).
- [x] 1.2 Add `computeOwnedSlotCountByFamily(variants, instances): Map<string, number>` (pure) — for each variant slot with ≥ 1 held individual, increment its family's count. Ghost slots excluded family-wise.
- [x] 1.3 Add `ownedSlotCountForFamily(db, familyId): Promise<number>` — family-scoped `where('familyId').equals(familyId)` read of both tables, then `computeOwnedSlotCountByFamily(...).get(familyId) ?? 0`. Both tables index `familyId`.
- [x] 1.4 Update the file header comment to note the per-family projection is part of the same canonical family.

## 2. Consumer rewires

- [x] 2.1 `character-card.ts buildCharacterCardPayload`: add `db.neuronInstances.toArray()` to the Promise.all; set `variantCount: computeOwnedSlotCount(variants, instances)`. Keep `variants` for reps + `familiesComplete` (unchanged).
- [x] 2.2 `character-card.ts`: `VariantShareState` gains `ownedCount: number`; `loadVariantShareState` loads `neuronInstances` and sets `ownedCount = computeOwnedSlotCount(variants, instances)`. Picker list `variants` stays the full collected-row list.
- [x] 2.3 `components/ShareCardModal.tsx`: the 變體 card passes `variantCount: vs.ownedCount` (was `vs.variants.length`).
- [x] 2.4 `components/VariantCollectionChip.tsx`: `refresh` uses `ownedSlotCountForFamily(db, familyId)` (was `db.neuronVariants.where('familyId').equals(familyId).count()`).
- [x] 2.5 `routes/CollectionPage.tsx`: add `ownedSlotCountByFamily: Map<string, number>` to `PageState`; compute it via `computeOwnedSlotCountByFamily(rows, instanceRows)` in the existing liveQuery; the per-family `🧬 X 隻` chip + the `totalIndividuals > …` secondary use `state.ownedSlotCountByFamily.get(family.id) ?? 0` (was `familyRows.length`). `familyRows` stays for card rendering.
- [x] 2.6 Grep `apps/neurons-tw/src` confirmed no in-scope display left: residual raw reads are `main.tsx` (DEV boot diagnostic), `bug-report.ts` (diagnostic snapshot), `variant-gacha.ts` (DEV debug handle), `economy.ts collectedCountForFamily` (maze **speed-buff** game-loop input — NOT a distinct-owned display/sync count; out of scope per spec wording + game-loop-number principle). Noted as an optional follow-up, not changed.

## 3. Tests (vitest)

- [x] 3.1 Update `__tests__/character-card.test.ts`: the `aggregates counts/stats` fixture now seeds one held `neuronInstances` row per `neuronVariants` row so `variantCount` (now the projection) still equals 21. (Ghost-slot exclusion for the card is asserted in `owned-slot-count.test.ts` where the ghost fixture lives, to keep the projection assertions centralized.)
- [x] 3.2 Extend `__tests__/owned-slot-count.test.ts`:
  - `computeOwnedSlotCountByFamily` pure core — per-family ghost exclusion + multi-family map.
  - `ownedSlotCountForFamily(db, familyId)` — family-scoped ghost exclusion.
  - character-card `buildCharacterCardPayload().variantCount` excludes a ghost slot (2, not 3).
  - variant share-card `loadVariantShareState().ownedCount` excludes a ghost slot (2, not 3).

## 4. Verification

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw test` — all green (73 files / 492 tests).
- [x] 4.2 `pnpm -r typecheck` — clean.
- [x] 4.3 `pnpm lint:dexie-fixtures` — pass (no `.version()` bump).
- [x] 4.4 `openspec validate extend-owned-slot-projection-to-per-family-and-cards` — clean (strict).
- [x] 4.5 Chrome MCP smoke (localhost:5175): seeded 藥理學 = 1 owned + 1 ghost slot + 解剖學 = 1 owned → `/collection` per-family chip 藥理學(VTA Dopaminergic) = `1 隻` (ghost excluded, not 2); global = `已收集 2`; 變體 share card = `變體收集 2 / 220`; 戰績 stats card = `變體收集 2 / 220`. Console clean. Seed cleaned up after. Ghost-slot two-device race is unit-test-only.

## 5. Archive (user-gated)

- [ ] 5.1 Confirm working tree is clean of unrelated changes per multi-agent git safety rule (worktree currently carries other sessions' WIP — explicit per-file `git add` only).
- [ ] 5.2 `/opsx:archive` — sync the `neuron-variant-fusion` delta into the main spec. **Awaits user confirmation.**
- [ ] 5.3 Auto-git commit (explicit per-file add) — subject `spec(archive): merge extend-owned-slot-projection-to-per-family-and-cards — per-family + share-card consumers`. **Awaits user confirmation.**
