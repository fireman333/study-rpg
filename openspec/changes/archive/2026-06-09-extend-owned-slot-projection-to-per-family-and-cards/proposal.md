## Why

`unify-distinct-owned-projection-across-fusion-achievements-leaderboard` (archived 2026-06-09) collapsed「distinct-owned variant」 to a single canonical `ownedSlotCount(db)` projection and pinned exactly **three** consumers (the `🧬 X 隻` chip's global count, the achievement-stat `variantCount`, the leaderboard `variant_count`). It deliberately scoped out every other surface that still reads a raw `db.neuronVariants` count.

Those scoped-out surfaces are themselves「distinct-owned」 displays, and so are subject to the **same cross-device fusion ghost-slot inflation** the canonical projection exists to prevent. A ghost slot (a `neuronVariants` row whose every `neuronInstances` individual has `consumedAt` set) still inflates each of them:

- **`character-card.ts buildCharacterCardPayload`** — `variantCount: variants.length` (the 戰績 share card's `變體收集 X / total`).
- **`ShareCardModal` 變體 tab** — `variantCount: vs.variants.length` (the variant share-card preview count).
- **The per-family `🧬 X 隻` chips** — `VariantCollectionChip` (`db.neuronVariants.where('familyId').equals(familyId).count()`) and `CollectionPage` (`familyRows.length`).

The canonical-projection requirement already says reading `db.neuronVariants.count()` directly for any「distinct-owned」 purpose SHALL be a regression, and that「Any future consumer added by a new change SHALL also read through `ownedSlotCount`」. But two gaps remain:

1. The spec only defines the **global** projection. The per-family chips need a **per-family** variant (`ownedSlotCount` is family-agnostic), which is not yet canonical — leaving the next developer free to write `familyRows.length` again with no spec to point at.
2. The four surfaces above were never pinned, so nothing locks them to the projection.

## What Changes

- **MODIFY `neuron-variant-fusion`** (the `ownedSlotCount` canonical-projection requirement only):
  - Define a **per-family** distinct-owned projection (`computeOwnedSlotCountByFamily` pure core + `ownedSlotCountForFamily(db, familyId)` family-scoped read) as part of the same canonical projection family, derived from the same「slot owned ⟺ ≥ 1 held individual」 core as the global count.
  - Expand the pinned-consumers list to add the four scoped-out surfaces (character-card stats, variant share-card preview, the two per-family chips).
  - Add a scenario covering per-family ghost-slot exclusion.
  - The global projection, the `copies` lifetime-mint split, and all existing consumers / scenarios are unchanged.

- **Code** (`apps/neurons-tw`):
  - `lib/services/variant-ownership.ts`: add `computeOwnedSlotCountByFamily(variants, instances): Map<familyId, count>` (pure) + `ownedSlotCountForFamily(db, familyId): Promise<number>` (family-scoped DB read), sharing one held-slot-key core with the existing global `computeOwnedSlotCount`.
  - `lib/services/character-card.ts`: `buildCharacterCardPayload` loads `neuronInstances` and computes `variantCount` via `computeOwnedSlotCount` (reps / familiesComplete keep reading raw `variants`, unchanged); `loadVariantShareState` gains an `ownedCount` field computed the same way.
  - `components/ShareCardModal.tsx`: the 變體 card uses `vs.ownedCount` for `variantCount`.
  - `components/VariantCollectionChip.tsx`: uses `ownedSlotCountForFamily(db, familyId)`.
  - `routes/CollectionPage.tsx`: the per-family `🧬 X 隻` chip uses `computeOwnedSlotCountByFamily` (computed once in the existing liveQuery, which already loads both tables).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neuron-variant-fusion`: extend the canonical `ownedSlotCount` projection requirement with a per-family projection variant and four newly-pinned consumers (no change to the global projection, the `copies` split, or any existing scenario).

## Impact

- **Specs**: 1 modified (`neuron-variant-fusion`, one requirement). No new capability.
- **Code**: 5 files in `apps/neurons-tw` — one shared helper addition + four consumer rewires. No new state, no new component.
- **Persistence**: no Dexie bump, no R2 `SCHEMA_VERSION` bump. `neuronVariants` / `neuronInstances` shapes unchanged; only read projections change. (No `.version()` change → no dexie-fixture-lint trigger.)
- **D1 / Worker**: none.
- **Player-visible**: for users with **0** cross-device fusion ghost slots (the overwhelming majority): zero change (`ownedSlotCount === neuronVariants.count` holds per family and globally). For users with ≥ 1 ghost slot: the character card / variant share card / affected per-family chip tick down by the ghost count, matching the already-corrected global chip / achievement / leaderboard. No banner.
- **Test**: extend `owned-slot-count.test.ts` with per-family projection coverage + character-card / share-card consumer assertions; update `character-card.test.ts` to seed held instances (its `variantCount` fixture now reads the projection). Vitest, no Dexie fixture.
