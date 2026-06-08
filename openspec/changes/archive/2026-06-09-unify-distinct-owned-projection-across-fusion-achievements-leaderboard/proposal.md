## Why

Three specs each define「distinct-owned variant」 against the same `db.neuronVariants` row count:

- `neuron-variant-fusion` — the `🧬 X 隻` chip uses `neuronVariants` slot count (distinct-slot semantics)
- `neurons-achievements` — collection-milestone Requirement: 「count distinct variants … evaluated against `db.neuronVariants` row count」
- `neurons-leaderboard` — `variant_count` upsert: 「distinct collected」 derived client-side from `db.neuronVariants` row count, sanity-bound to `[0, NEURON_VARIANT_TOTAL]`

`neuronVariants.copies` is documented as a **monotonic lifetime-mint count** that「never decremented」 (per the fusion spec) so its R2 MAX-merge stays valid. Combined with fusion's per-device-only last-copy protection, two devices starting from the same `(2 held individuals at one slot)` snapshot can each promote the slot to 0 held instances (each thinking the other individual is the kept one), then converge via consumed-monotonic-OR to a **ghost slot**: `neuronVariants` row exists, `copies ≥ 2`, but every `neuronInstances` row for that slot has `consumedAt` set. All three downstream counters still treat the slot as owned, which:

- inflates the player's `🧬 X 隻` chip beyond their actual held collection
- silently re-unlocks / preserves a collection-milestone achievement the player no longer satisfies
- inflates `variant_count` on the leaderboard relative to other (single-device or fusion-naive) players' actual ownership

The reverse direction is rarer but also possible: a future repair / cleanup path that purges orphan `neuronVariants` rows would silently down-count without ceremony.

The fix is to **collapse「distinct owned」 to a single canonical projection** that all three consumers read from, and to document it as the source-of-truth. The projection is `ownedSlotCount(db) = neuronVariants rows WHERE that slot has ≥ 1 neuronInstances row with consumedAt == null`. Lifetime `copies` stays where it is; ghost slots no longer inflate downstream counters.

## What Changes

- **MODIFY `neuron-variant-fusion`**:
  - The last-copy-protection requirement is strengthened with a normative cross-device invariant: a slot SHALL count as「owned」 in any downstream counter (chip / achievement / leaderboard) only when at least one held individual exists for it; the `neuronVariants` row alone is NOT sufficient.
  - A new requirement defines `ownedSlotCount` as the single canonical projection and pins its consumers (chip / achievements / leaderboard) to it.
  - A ghost-slot scenario covers the cross-device promote race (both devices consume their「kept」 individual).
- **MODIFY `neurons-achievements`**: the collection-milestone Requirement changes its source-of-truth wording from「`db.neuronVariants` row count」 to「the canonical `ownedSlotCount` projection from `neuron-variant-fusion`」. The lower-tier ladder, P1 composite rule, and reward channels are unchanged. A new scenario asserts that a ghost slot does NOT count toward a milestone.
- **MODIFY `neurons-leaderboard`**: the `variant_count` semantics + upsert + UI display Requirements change source-of-truth from a row count to `ownedSlotCount`. The catalog total `NEURON_VARIANT_TOTAL` remains the sanity-bound ceiling (since `ownedSlotCount ≤ NEURON_VARIANT_TOTAL` holds by definition). D1 schema + Worker enforcement unchanged.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neuron-variant-fusion`: strengthen last-copy-protection with cross-device invariant; add canonical `ownedSlotCount` projection requirement + ghost-slot scenario.
- `neurons-achievements`: switch collection-milestone source-of-truth from raw `db.neuronVariants` count to `ownedSlotCount` projection.
- `neurons-leaderboard`: switch `variant_count` source-of-truth from raw `db.neuronVariants` count to `ownedSlotCount` projection.

## Impact

- **Specs**: 3 modified. No new capability.
- **Code**: best-case minimal. Apply phase audits three counter sites (the chip in CollectionPage / OverviewPage, the achievement-stats builder, the leaderboard upsert payload builder) and replaces `db.neuronVariants.count()` (or equivalent) with a shared `ownedSlotCount(db)` helper. If the helper doesn't exist yet, apply adds it once in a shared location (likely `apps/neurons-tw/src/lib/services/fusion.ts` or a new `variant-ownership.ts`).
- **Persistence**: no Dexie bump, no R2 `SCHEMA_VERSION` bump. The shape of `neuronVariants` + `neuronInstances` is unchanged. Only the read projection changes.
- **D1 / Worker**: no migration. `variant_count` value range stays `[0, NEURON_VARIANT_TOTAL]`. Worker continues sanity-bounding the same range.
- **Player-visible**: for users with **0** cross-device fusion races: zero behavior change (`ownedSlotCount === neuronVariants.count` holds). For users with ≥ 1 race-induced ghost slot: chip / achievement / leaderboard tick down by the ghost count on next sync push (correct accounting catches up). No banner; the down-count is the bug fix.
- **Test**: 1 helper test (`ownedSlotCount` projection: held vs ghost vs orphan) plus 3 consumer tests verifying each consumer reads through the projection. Vitest pattern mirrors `family-mastery-merge.test.ts`.
