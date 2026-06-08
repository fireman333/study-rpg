## Context

The neurons fusion system was designed around two complementary fields per slot: `neuronVariants.copies` (monotonic lifetime-mint count, kept for catalog history and R2 MAX-merge stability) and `neuronInstances` rows with `consumedAt` soft-delete (the actual「held」 collection). The fusion spec is explicit about the split. But three downstream consumers — the `🧬 X 隻` chip, the achievement collection-milestone stat, and the leaderboard `variant_count` field — each separately reach for `db.neuronVariants` to count「distinct owned」 variants. That works perfectly on a single device and works almost-perfectly on multi-device users because last-copy protection is enforced per-device at promote time.

The hole: two devices starting from the same `(2 held individuals)` snapshot can each locally choose a different individual as the「kept」 one and promote-consume the other. After R2 round-trip with consumed monotonic-OR merge (per fusion's existing sync requirement), both individuals end up consumed; the slot has 0 held instances but `copies ≥ 2` and the `neuronVariants` row stays put. All three consumers still count it as owned. The chip says「X 隻」 but the collection panel renders empty for that slot; the achievement unlocks at a threshold the player no longer satisfies; the leaderboard rank reflects a collection size the player no longer has.

The race is uncommon (requires real two-device simultaneous play on the same family at the same time) but the failure mode is silent and self-perpetuating: the row never goes away, so the ghost slot inflation persists for the lifetime of the save. A user who eventually runs into this would have no way to diagnose it without reading the spec.

## Goals / Non-Goals

**Goals:**
- Collapse「distinct owned variant count」 to a single canonical projection that all three consumers share.
- Make ghost slots stop inflating user-visible and cloud-visible counts immediately on next sync push.
- Keep the existing data shape intact: `neuronVariants.copies` stays monotonic, `neuronInstances` stays the held collection.

**Non-Goals:**
- Preventing the cross-device race itself. A synchronous claim protocol would require a Worker-level lock or CRDT, well beyond the value at the failure rate observed.
- Auto-purging ghost `neuronVariants` rows. The row is information (catalog history); deleting it would lose data and force a re-mint to display the slot's catalog entry. The fix is to read it correctly, not to delete it.
- Surfacing a「ghost slot」 indicator in the collection view. Possible future polish but not required for the spec contract.
- Changing the achievement P1 composite rule, reward channels, or any non-collection achievement.
- Changing the leaderboard D1 schema, Worker enforcement, KV cron, or any non-`variant_count` field.

## Decisions

**Decision 1 — Canonical projection lives in `neuron-variant-fusion` as `ownedSlotCount`.** The projection's correctness depends on the relationship between `neuronVariants` and `neuronInstances` that fusion owns; placing it in fusion keeps the source-of-truth co-located with the data model that defines「held vs consumed」. *Alternative considered:* placing it in `neurons-mode` umbrella — rejected, the umbrella spec doesn't own variant data semantics.

**Decision 2 — Source-of-truth is normative across all three consumers; raw row counts are explicitly forbidden.** The MODIFIED requirements in achievements + leaderboard each pin the source explicitly so a future contributor can't slip back into `db.neuronVariants.count()` for a「performance」reason without breaking spec scenarios. *Alternative considered:* leave the choice of source to apply-phase implementation — rejected, drift is the exact failure mode we're fixing.

**Decision 3 — Lifetime `copies` semantics is unchanged.** This change does NOT redefine `copies`; the field stays a monotonic lifetime-mint count. The split is reaffirmed in the new ADDED requirement and the cross-device limitation paragraph of the MODIFIED last-copy requirement. *Alternative considered:* recompute `copies` as a held-count derivable from `neuronInstances` — rejected, breaks the catalog-history use case (a slot the player once held but consumed all of should still know it was minted) and would force an R2 bundle protocol change.

**Decision 4 — Ghost slot down-count is a silent immediate correction on next push, no banner.** The down-count IS the bug fix; surfacing it as a notification would alarm players who never knew they had a ghost slot. *Alternative considered:* one-shot toast on first detected ghost slot — rejected, too low-value for the engineering cost.

**Decision 5 — D1 `variant_count` sanity bound `[0, NEURON_VARIANT_TOTAL]` stays.** `ownedSlotCount` is bounded above by `NEURON_VARIANT_TOTAL` by definition (it counts slots in the catalog), so no Worker / D1 migration is needed. *Alternative considered:* widen the lower bound to allow re-syncs that legitimately go down — already covered by the existing range starting at 0.

## Risks / Trade-offs

- **[Apply phase finds the three consumers each use a slightly different counting expression today] →** Expected. The audit step in tasks.md enumerates them; apply replaces each with a `ownedSlotCount(db)` call. The shared helper lives in one place to prevent re-drift.
- **[Player whose leaderboard rank ticks down by 1 on next push notices the change] →** Acceptable. The corrected rank reflects their actual ownership. The change is silent and one-time per ghost slot.
- **[An achievement that was previously unlocked by a ghost-inflated count remains in the unlocked set on Dexie] →** Achievements are monotonic on Dexie (unlock rows persist); the down-count cannot retroactively re-lock an entry. So a player who unlocked「50 distinct variants」 with a ghost-inflated 50 keeps the achievement. The fix is forward-looking: future milestones won't unlock prematurely.
- **[Performance concern: `ownedSlotCount` requires a join across `neuronVariants` + `neuronInstances`] →** With a Dexie compound index on `neuronInstances` `(familyId, slotIndex)` (already present per the v13 schema), the count is a per-slot existence check at worst. Apply phase confirms.

## Migration Plan

No data migration. The canonical projection is computed at read time from existing tables; no backfill, no Dexie bump, no R2 bump, no D1 migration. On next sync push after the change ships, opted-in leaderboard rows for users with ghost slots will update to the corrected `variant_count`. No banner.

Rollback: revert the three consumers + the helper. The data layer is untouched; rollback is a code-only revert with no data loss.
