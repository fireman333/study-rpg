## Context

Phase 2 (`rework-neurons-collection-gacha`) shipped a P0–P5 model where **rarity is derived
from the slot index** (`SLOT_RARITY: Record<SlotIndex, Rarity>`, `SlotIndex = 0|1|2|3|4|5`)
and the catalog is exactly 66 (11 families × 6 tiers). The Dexie composite PK is
`(familyId, slotIndex)`; current Dexie version is **v10**; current R2 bundle
`SCHEMA_VERSION` is **9**. Gacha (`variant-gacha.ts`) rolls a tier via
`VARIANT_RARITY_WEIGHTS`, then — because rarity ≡ slot — the variant is fully determined.

Real art inventory: **55 base sprites** (`<family>-1.png` … `<family>-5.png`) + **11 P0 apex
sprites staged** at `~/.claude/scratch/neurons-p0-apex-2026-06-02/` (Phase 2 ships P0 as a
placeholder). There is **no art for additional base-tier variants** — a base-heavy pyramid
inherently needs new base sprites that do not yet exist.

## Goals / Non-Goals

**Goals:**

- Decouple `rarity` from `slotIndex` so a family can hold a variable number of variants per
  tier (the pyramid shape: more at common tiers, one at the apex).
- Keep the tier weight roll unchanged; add a within-tier variant roll so dupes/new-variants
  emerge naturally in multi-variant tiers.
- Retain the `(familyId, slotIndex)` PK (no PK change — `dexie_pk_change_pitfall`).
- Wire the 11 staged P0 sprites in (P0 gains real art).
- Full reset of the collection on Dexie v11; preserve all non-collection study progress.
- Bump R2 `SCHEMA_VERSION` 9→10 with reader tolerance; no Worker change.
- Render the variable pyramid in `/collection` + the connectome family chip.

**Non-Goals (deferred follow-ups):**

- Generating the ~44+ new base-tier sprites (roster art-fill long pole).
- Phase 3 dupe-fusion, Phase 4 expedition rewards, Phase 5 subject flavor.
- P0 leaderboard cross-cut (shared Worker regex `P[1-4]`→`P[0-4]` + D1 + achievement validator).

## Decisions

### D1 — `rarity` becomes an explicit per-variant catalog field; `slotIndex` becomes `0..N-1`

`NeuronVariantDef.rarity` is authored per catalog entry (no longer `SLOT_RARITY[slotIndex]`).
`SlotIndex` widens from the `0|1|2|3|4|5` literal union to `number` (within-family unique
index, `0..N-1`). `SLOT_RARITY` as the rarity *source* is removed; a per-variant `rarity`
field replaces it. Convention retained: **slotIndex 0 = the family's P0 apex** (so the
`<family>-0.png` P0 sprite path convention and the "P0 excluded once owned" logic key off
slot 0). The composite PK `(familyId, slotIndex)` is unchanged → Dexie upgrade is a
table-clear, not a PK migration.

### D2 — Pull = tier roll (unchanged) → within-tier variant roll (new)

`pullVariant(familyId)` keeps the existing `rollRarityWithP0Pity` tier roll. New step: given
the rolled tier, gather that family's catalog variants of that tier, pick **uniformly at
random** among them. If the picked variant is owned → dupe (`copies += 1`); else new row.
P0 tier still resolves to the single slot-0 variant and is excluded from the weight roll once
owned (existing behavior, preserved). Edge case: if a rolled tier has all its variants owned,
fall through to the next-rarer owned-incomplete tier (or, simplest: re-pick within tier
yielding a dupe — keep Phase 2's "dupe is a valid outcome" semantics; no soft-guarantee of a
new variant per pull beyond P0 pity). **Decision: keep it simple — a pull may yield a dupe in
any non-P0 tier; only P0 has pity.** (Matches Phase 2; dupe-handling sink is Phase 3.)

### D3 — Initial pyramid shape (the knob the owner reviews) — **recommendation: minimal-placeholder start**

The architecture supports any per-family per-tier counts. The trade-off is **placeholder
footprint vs. how "pyramid-shaped" the initial ship looks**:

| Option | Per-family shape | Total | New placeholder slots | Prod look |
|---|---|---|---|---|
| **D3a (recommended)** | P5:2 / P4:1 / P3:1 / P2:1 / P1:1 / P0:1 = 7 | 77 | 11 (one extra P5 per family) | ~14% empty; proves multi-variant-per-tier end-to-end |
| D3b architecture-only | P5:1 … P0:1 = 6 | 66 | 0 | no visible change; multi-per-tier only exercised in tests |
| D3c full target | P5:3 / P4:2 / P3:2 / P2:1 / P1:1 / P0:1 = 10 | 110 | 44 | ~40% empty until art-fill |

**Recommend D3a**: it ships a genuine (if shallow) pyramid — the commonest tier P5 holds two
variants per family — so the within-tier roll, dupes, and pyramid render are all exercised in
prod, while keeping placeholders to ~14%. The full ~110 target (toward D3c) then arrives via
art-fill batches that ship **sprite + catalog entry together** (no further placeholder interim).

⚠️ Trade-off the owner should weigh at GATE 1: the 11 new slots sit at **P5 (commonest)**, so
players hit those placeholders *fast*. If a placeholder-at-common-tier bothers more than a
no-visible-change ship, choose **D3b** (architecture-only, zero placeholders) and let the
first art-fill batch introduce the base-heavy shape with real art from the start. Either is a
one-line catalog difference; the engine is identical. **This is the main GATE 1 question.**

### D4 — Full reset on Dexie v11; preserve study, wipe collection only

`.version(11)` upgrade callback **clears `neuronVariants`** and re-initialises gacha state.
Preserve: AP / familyAccrual, synapses, mastery, questionHistory, bookmarks, achievements,
study minutes, neural-energy balance counters, leaderboardProfile, dmn tables. A
`db-v10-to-v11-migration.test.ts` fixture opens v10, writes representative rows in both a
preserved table and `neuronVariants`, reopens at v11, asserts `neuronVariants` empty +
preserved tables intact (`dexie-fixture-lint` rule).

### D5 — R2 `SCHEMA_VERSION` 9 → 10, reader-tolerant; no Worker change

Bump the constant + history comment. `neuronVariants` adapter keeps the `copies` MAX-merge +
immutable-row-identity carve-out (now keyed off explicit rarity, but merge logic is unchanged).
Forward-compat tolerance already in `validateBundleMeta` (`console.info` + continue when
`schema_version > SCHEMA_VERSION`) covers v9 clients reading v10 bundles; v10 clients reading
v9 bundles preserve-on-omission. Worker is bundle-opaque.

### D6 — P0 leaderboard cross-cut stays separate

Folding the Worker regex `P[1-4]`→`P[0-4]` + D1 + achievement-validator change in here would
touch the **shared sync Worker (also 二階)** → cross-track blast radius inside a neurons
re-arch. Keep it a separate small change. This change keeps P0 out of the leaderboard badge
CSV (stays within the current regex). **P0 does not surface on the leaderboard until that
follow-up lands** — called out in proposal.md.

## Risks / Trade-offs

- **Second same-day full reset** (Phase 2 reset this morning, this is another). Acceptable
  only because there is no real dogfood/promotion yet (grill Facet 6). If any real user had
  pulled, this would need a migration path. Re-confirm "no real users" still holds at GATE 1.
- **Placeholder-at-common-tier UX** (D3a) — players pull into placeholders quickly. Mitigated
  by keeping the count low (11) and shipping real art next; D3b avoids it entirely. Owner call.
- **Within-tier roll can starve new-variant feeling** — a pull may keep yielding dupes in a
  multi-variant tier with no pity outside P0. Intentional (dupe sink = Phase 3); telemetry-watch.
- **`SlotIndex` widening `0|1|2|3|4|5` → `number`** ripples to every consumer of the literal
  type (sprite key derivation, collection render, character-card SLOTS_PER_FAMILY). Phase 2's
  archive already flagged "derive from catalog, don't hardcode slot counts" — this change must
  finish that: replace any remaining hardcoded `6` / `SLOTS_PER_FAMILY = 6` with catalog-derived
  per-family counts. The `/verify` dead-code + typecheck pass guards the ripple.
- **R2/Dexie version churn** across worktrees — `pnpm --filter @study-rpg/core build` + per-app
  `.env.local` already handled; this change is neurons-only (no core type change expected).
