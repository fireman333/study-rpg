## Why

Collection 2.0 Phase 2 (`rework-neurons-collection-gacha`, shipped 2026-06-02) flipped
unlock→gacha and stood up a **P0–P5 rarity model — but with exactly one variant per
tier per family (66 total)**. Rarity is currently *derived from* the slot index
(`SLOT_RARITY[slotIndex]`, `SlotIndex = 0|1|2|3|4|5`), so the catalog is structurally
locked at six slots per family.

The grill's locked design (`~/.claude/scratch/grilled-neurons-changeB-collection-rework-2026-06-02.md`,
Facets 2 / 2.1 / 2.2) is a **rarity pyramid**: rising rarity = *fewer* variants, so the
commonest tiers hold *several* variants and the apex holds one. That "many at the base,
one at the top" shape is what makes the collection feel like a real chase (more to pull,
dupes accrue, rarity reads as scarcity) rather than a fixed 6-cell checklist. Phase 2's
one-per-tier model cannot express it because rarity and slot index are the same axis.

This change is the **slot-model re-architecture** that unlocks the pyramid: decouple
rarity from slot index so each family can carry a variable number of variants per tier.
It is the critical path for the rest of Collection 2.0 — Phase 3 dupe-fusion (consumes
the dupes a base-heavy pyramid produces) and the roster art-fill batch both key off this
structure.

Source of truth: the grill doc above + the Phase 2 handoff (`openspec/changes/archive/2026-06-02-rework-neurons-collection-gacha/`).

## What Changes

In `apps/neurons-tw` + `packages/content-neurons-tw` + `packages/theme-pixel-neurons`:

1. **Rarity decoupled from slot index.** `rarity` becomes an **explicit per-variant
   catalog field** instead of `SLOT_RARITY[slotIndex]`. `slotIndex` becomes a within-family
   unique index `0..N-1` (no longer the 0–5 literal union; no longer the rarity source).
   The Dexie composite PK **`(familyId, slotIndex)` is retained** (slotIndex stays unique
   within a family) — **no PK change**, avoiding the `dexie_pk_change_pitfall`.

2. **Variable variants per tier (the pyramid).** The tier weight roll
   (`VARIANT_RARITY_WEIGHTS`, P5 59 / P4 25 / P3 10 / P2 4 / P1 1.3 / P0 0.7) is unchanged.
   After a tier is rolled, the pull now **rolls a variant *within* that tier** (uniform
   among that tier's slots for the family), so a tier with multiple variants can yield a
   new variant or a dupe. P0 stays one-per-family with the existing soft-pity ramp.

3. **Catalog grows from a fixed 66 to a per-family pyramid.** Each family declares its own
   per-tier variant counts. **Initial shape is a design.md decision** (see design.md —
   recommendation keeps the new-slot/placeholder footprint small and grows the full
   ~110-target via follow-up art batches that ship sprite + catalog entry together).

4. **Existing 55 base sprites + 11 staged P0 sprites are folded in.** The current 55 base
   sprites keep their files and map to explicit rarities; the **11 P0 apex sprites already
   generated + staged at `~/.claude/scratch/neurons-p0-apex-2026-06-02/` are wired in**
   (copy → `packages/theme-pixel-neurons/sprites/variants/<family>-0.png`), so P0 ships
   with **real art** (Phase 2 shipped P0 as a placeholder). Any *new* base-tier slots beyond
   existing art ship with the established **card-back placeholder** until the art-fill batch.

5. **Full reset again, no grandfather, no banner.** The variant schema/semantics change
   (variable slot count, explicit rarity). On the Dexie **v11** upgrade the `neuronVariants`
   table is **cleared** and gacha state re-initialised; study progress (AP, synapses,
   mastery, question history, bookmarks, achievements, study minutes, neural-energy balance)
   is **preserved**. A **v10→v11 upgrade fixture** asserts the reset/preserve split
   (satisfies the `dexie-fixture-lint` rule, `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`). Clean
   wipe is acceptable: no real dogfood/promotion yet.

6. **R2 bundle `SCHEMA_VERSION` 9 → 10**, additive + reader-tolerant (forward-compat: older
   clients drop unknown keys, newer clients preserve-on-omission). The `neuronVariants`
   adapter keeps its `copies` MAX-merge + immutable-row-identity carve-out. The shared sync
   Worker is bundle-opaque — **no Worker change**.

7. **UI renders the variable-slot pyramid.** `/collection` shows all of a family's pyramid
   slots (not a fixed 6 grid); uncollected slots remain rarity-labelled silhouettes. The
   connectome homepage family chip count switches from `/ 6` to the family's pyramid total.
   The pull control + neural-energy HUD + reveal modal/toast are unchanged from Phase 2.

**Explicitly out of scope** (each its own later change — listed as follow-ups, NOT designed here):

- **Roster art-fill long pole** — generating the remaining base-tier sprites toward the
  ~110 target (per-NT-branch sub-batches, Gemini/codex). This is the deferred art work that
  removes the placeholder slots this change introduces.
- **Phase 3 `add-neurons-dupe-fusion`** — 衝卷軸 dupe → promote / shards.
- **Phase 4 `add-neurons-expedition-rewards`** — permanent-passive multipliers.
- **Phase 5 `enrich-neurons-subject-flavor`** — 11-subject pure-flavor 特色.
- **P0 leaderboard cross-cut** — the shared leaderboard Worker badge regex
  `^([a-z]+:P[1-4])` → `P[0-4]` + D1 + achievement validator are P1–P4. Extending to P0
  touches the **Worker shared with 二階** (cross-track). This change keeps P0 out of the
  leaderboard badge CSV (stays within the current `P[1-4]` regex); the P0 wiring is a tracked
  follow-up. **P0 will not surface on the leaderboard until that change lands.**

## Capabilities

### New Capabilities

(none — this re-architects existing capabilities)

### Modified Capabilities

- `neuron-variant-gacha`: rarity decouples from slot index (explicit per-variant field);
  catalog grows from a fixed 66 to a per-family pyramid; pull rolls variant-within-tier;
  full reset moves from Dexie v10 to v11; R2 bundle tolerance moves from v8↔v9 to v9↔v10;
  sprite-key registration count changes from a fixed 66 to the pyramid total.
- `neurons-variant-collection-view`: the dex renders a family's variable pyramid slots
  instead of a fixed 6.

(The connectome homepage family-card chip switches from `/ 6` to the family's pyramid total,
but its requirement is specified inside `neuron-variant-gacha` — "Connectome page family cards
SHALL display collected-variant count" — so the delta lives there, not in `connectome-collection`.)

## Impact

- **Code**: `packages/content-neurons-tw/src/variants.ts` (catalog + rarity field + remove
  `SLOT_RARITY`-as-source + per-family pyramid counts), `apps/neurons-tw/src/lib/services/variant-gacha.ts`
  (roll variant-within-tier), `apps/neurons-tw/src/lib/db.ts` (`.version(11)` reset callback),
  `apps/neurons-tw/src/lib/sync/r2/bundles.ts` (`SCHEMA_VERSION` 9→10), CollectionPage +
  connectome family-card render, `packages/theme-pixel-neurons` sprite registry + 11 P0 PNGs.
- **Tests**: new `apps/neurons-tw/src/__tests__/db-v10-to-v11-migration.test.ts` fixture;
  catalog/validator unit tests for the pyramid shape; gacha within-tier-roll + dupe tests.
- **Data**: all existing players' variant collection is **wiped** on first v11 boot (study
  progress preserved). Acceptable — no real dogfood/promotion yet.
- **Deploy**: merge to `main` triggers `deploy-cf-pages.yml` (ships neurons) + `deploy.yml`
  (一階/二階, re-runs, must stay green). `deploy-worker.yml` **not** triggered (no Worker change).
- **Known interim regression**: any new base-tier slots beyond existing art render as
  card-back placeholders until the art-fill follow-up; the initial shape (design.md)
  minimises this footprint.
