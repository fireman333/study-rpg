## 1. Catalog + rarity decoupling (content-neurons-tw)

- [x] 1.1 In `packages/content-neurons-tw/src/variants.ts`: widen `SlotIndex` from the `0|1|2|3|4|5` literal union to `number`; add explicit `rarity` to each `NeuronVariantDef` entry (stop deriving from `SLOT_RARITY`). Remove `SLOT_RARITY` as the rarity *source* (keep only if still needed for the slot-0=P0 convention helper; otherwise delete).
- [x] 1.2 Restructure `NEURON_VARIANT_CATALOG` into the per-family pyramid per design.md **D3a** (recommended: P5:2 / P4:1 / P3:1 / P2:1 / P1:1 / P0:1 = 7 per family, 77 total — one extra P5 base variant per family). Existing 5 base + P0 keep their `slotIndex`/`displayName`/`description`; the new P5 variant gets a placeholder sprite key + authored displayName/description.
- [x] 1.3 Replace `assertCatalogShape` (was: exactly 66, `rarity === SLOT_RARITY[slotIndex]`) with the pyramid guard: exactly one P0 at slot 0 per family; contiguous unique `slotIndex 0..N-1`; `rarity ∈ {P0..P5}`; pyramid invariant (rarer tier ≤ commoner tier count); spriteKey convention. Update `scripts/verify-*` fixtures if any assert the count 66.
- [x] 1.4 Add/extend unit tests for the catalog shape (pyramid invariant, one-P0-per-family, explicit-rarity-not-derived).

## 2. Gacha within-tier roll (neurons-tw service)

- [x] 2.1 In `apps/neurons-tw/src/lib/services/variant-gacha.ts`: after the existing `rollRarityWithP0Pity` tier roll, add a within-tier variant selection — gather the family's catalog variants of the rolled tier, pick uniformly at random; resolve owned→dupe (`copies += 1`) vs new row. P0 still resolves to the single slot-0 variant and is excluded once owned (unchanged).
- [x] 2.2 Update the "fully collected" check to compare against the family's catalog total `N` (derived), not the literal 6.
- [x] 2.3 Unit-test the within-tier roll: multi-variant tier yields one of its variants; dupe path increments copies; P0 path unchanged.

## 3. Persistence — Dexie v11 full reset (neurons-tw)

- [x] 3.1 In `apps/neurons-tw/src/lib/db.ts`: add `.version(11)` with a `.upgrade()` callback that clears `neuronVariants`, resets every `familyAccrual.pullCount` to 0 and `unlockedSlots` to `[]`; PRESERVE `neuralEnergyEarned`/`neuralEnergySpent` + all study tables. No PK change (`[familyId+slotIndex]` retained).
- [x] 3.2 Add `apps/neurons-tw/src/__tests__/db-v10-to-v11-migration.test.ts`: open v10, seed `neuronVariants` rows + non-zero AP/synapses + non-zero energy counters + non-zero pullCount; reopen at v11; assert `neuronVariants` empty + pullCount 0, AND AP/synapses/energy preserved. (Satisfies `dexie-fixture-lint`; canonical pattern = `retirement-tombstone.test.ts`.)
- [x] 3.3 Run `pnpm lint:dexie-fixtures` locally — confirm v11 fixture is detected (no SKIP escape hatch).

## 4. R2 bundle SCHEMA_VERSION 9 → 10 (neurons-tw)

- [x] 4.1 In `apps/neurons-tw/src/lib/sync/r2/bundles.ts`: bump `SCHEMA_VERSION` 9 → 10; append a history-comment line. Confirm `validateBundleMeta` already tolerates `schema_version > SCHEMA_VERSION` (forward-compat). No Worker change.
- [x] 4.2 Confirm the `neuronVariants` adapter `copies` MAX-merge + immutable-row-identity carve-out still holds with explicit `rarity` (merge logic unchanged; rarity is part of immutable row content).
- [x] 4.3 Update / add a cross-version bundle test (v9 client tolerates v10 bundle; v10 reading v9 preserves-on-omission) if a sibling test exists; otherwise extend the existing bundle test.

## 5. Sprite wiring (theme-pixel-neurons)

- [x] 5.1 Copy the 11 staged P0 apex sprites from `~/.claude/scratch/neurons-p0-apex-2026-06-02/sprites/*.png` → `packages/theme-pixel-neurons/sprites/variants/<family>-0.png` (verify family-name mapping via the staged MANIFEST.md).
- [x] 5.2 Confirm the sprite registry glob registers all `variant:<family>:<slot>` keys for the new pyramid catalog (one key per entry); new P5 base slots resolve to placeholder/`variant:default` (never broken image).
- [x] 5.3 Rebuild theme/content packages if their `main/exports` point at `dist/` (`pnpm --filter @study-rpg/theme-pixel-neurons build` / content build) so the app sees the new catalog + sprites.

## 6. UI render (neurons-tw)

- [x] 6.1 `CollectionPage`: render every catalog slot per family (derive count from catalog, remove any hardcoded 6 / `SLOTS_PER_FAMILY = 6`); uncollected → rarity-labeled silhouette; collected → card. Multiple variants in a tier each render as their own slot.
- [x] 6.2 Connectome homepage family card: change the `🧬 X / 6` chip to `🧬 X / N` (N = family pyramid total, derived); full-collection celebratory chip at `X === N`.
- [x] 6.3 Grep the app for any remaining hardcoded slot-count `6` / `SlotIndex` literal-union assumptions (character-card `SLOTS_PER_FAMILY`, sprite-key derivation) and make them catalog-derived.

## 7. Verify

- [x] 7.1 `pnpm -r typecheck` clean (the `SlotIndex` widening ripple is fully absorbed).
- [x] 7.2 `pnpm --filter @study-rpg/neurons-tw test` green (catalog + gacha + v11 fixture + bundle tests).
- [x] 7.3 `pnpm lint:dexie-fixtures` green.
- [x] 7.4 Chrome MCP smoke (dev): v10→v11 boot clears collection + preserves energy; `/collection` renders the pyramid (77 slots, P0 real art, new P5 placeholder); a pull into a multi-variant tier resolves; console clean. Then prod SPA three-pack after deploy. ✅ dev smoke passed (Dexie v11, count 0, energy 100/40 preserved, 11×"/7" chips, P0 real asset URL, slot-6 transparent placeholder, pull P5 new row -20 energy, console clean). Prod SPA three-pack pending Step 9.

## 8. Slot-count consumer fixes (folded in via /simplify gate, owner-approved)

- [x] 8.1 `achievement.ts`: family-complete `=== 5` → catalog-derived `VARIANT_COUNT_BY_FAMILY[familyId]`; naturalP1 `slotIndex <= 3` → `rarity === 'P1' && !wasPityFloor` (reads the explicit-rarity field, not the removed slot=rarity coupling). Fixes 4 unreachable achievements.
- [x] 8.2 `neurons-leaderboard.ts`: `family_complete` `=== 5` → catalog-derived per-family count.
- [x] 8.3 `HelpMenu.tsx`: rewrote the variant section from the stale pre-gacha auto-unlock copy (5 slot / 55) to the current gacha + pyramid reality (7 slot / 77 / neural-energy pull). (Pre-existing Phase-2 drift, corrected while there.)
