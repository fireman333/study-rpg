## Why

Today neurons-tw variants unlock **deterministically**: every correct answer adds
+1 family Action Potential (AP); crossing a fixed threshold (`[10,30,80,200,500]`)
auto-rolls slot 1–5 for that family. There is no player agency, no scarcity chase,
and no spend loop — the "collection" is a guaranteed grind, not a gacha.

Collection 2.0 (mini-milestone, M_3rd ext) reframes the collection as the heart of
the loop: **study earns a currency, the player spends it to pull, and rarity drives
a real chase** (variable-ratio reward — the grill's "稀有 drop 爽感 + 驅動學習").
This change is **Phase 2 — the spine**: flip unlock→gacha, stand up the currency
economy, restructure rarity into a P0–P5 pyramid with a per-subject super-rare apex,
and redesign the schema with a full reset. Later phases build on it: Phase 3 dupe
fusion (consumes the dupes this phase starts producing), Phase 4 expedition reward
multipliers (feed the P0 soft-pity), Phase 5 subject flavor, Phase 6 roster art fill.

Source of truth: `~/.claude/scratch/grilled-neurons-changeB-collection-rework-2026-06-02.md`
(Phase 2 row + Facets 1–8 + P0-rate evaluation).

## What Changes

In `apps/neurons-tw` + `packages/content-neurons-tw` + `packages/theme-pixel-neurons`:

1. **Unlock → gacha flip.** AP threshold crossings **no longer** create variants.
   Variants come from a **player-initiated, per-family pull** that spends currency.
   The `connectome.variantSlotUnlocked` event + AP-threshold-unlock path are removed.

2. **Neural-energy currency.** A single generic study-gated token (no real money,
   honors the project rule). Faucet: **+3 per correct answer** (in
   `recordCorrectAnswer`) + **+2 per reading minute** (in the reading-timer minute
   side-effect). Pull cost **20**. Persisted as monotonic `neuralEnergyEarned` /
   `neuralEnergySpent` meta counters (balance = earned − spent), synced via the
   existing `backfill/counters.ts` MAX-merge post-pass. (Currency *theming* —
   OE-grounded name/metaphor — is a deferred follow-up; game-loop numbers are
   dogfood-tuned, not OE-anchored, per project rule.)

3. **P0–P5 rarity pyramid.** A new **P0** apex tier joins P1–P5. Per pull the rarity
   is weight-rolled (P0 0.7 / P1 1.3 / P2 4 / P3 10 / P4 25 / P5 59). **P0 = one
   super-rare variant per subject** with a **soft pity** (base 0.7%, ramps from
   pull 40, near-guaranteed by ~pull 60). Rarity becomes a **fixed per-variant**
   property (Pokémon model) instead of rolled-per-unlock.

4. **Existing sprites folded in + P0 slot.** The 55 existing slot sprites keep their
   files and are remapped to fixed rarities (slot 1→P5 … slot 5→P1). A new **P0
   variant per family** is added (`slotIndex = 0`), sprite art a placeholder for now
   (real art is Phase 6). Catalog grows 55 → **66** (11 families × 6 tiers).

5. **Dupes produce `copies`.** A pull can yield an already-owned variant; the row's
   `copies` count increments (the dupe stockpile **Phase 3 fusion will consume**).
   No fusion UI in this phase.

6. **Full reset, no grandfather, no banner.** The variant schema/semantics change
   (slot range 0–5, fixed rarity, copies). On the Dexie **v10** upgrade the
   `neuronVariants` table is **cleared** and gacha state initialized. Study progress
   (AP, synapses, mastery, question history, bookmarks, achievements, study minutes)
   is **preserved** — only the collection resets. A v9→v10 upgrade fixture asserts
   the reset path (satisfies the `dexie-fixture-lint` rule).

7. **Schema + sync.** Dexie **v10** (reset callback; `copies` + `pullCount` are
   non-indexed additive fields, no PK change — `[familyId, slotIndex]` is retained,
   avoiding the `dexie_pk_change_pitfall`). R2 bundle **`SCHEMA_VERSION` 8 → 9**
   (additive + reader-tolerant; `neuronVariants` adapter gains a `copies` MAX-merge
   carve-out + immutable row identity; `pullCount` rides `familyAccrual` MAX-merge;
   currency rides the meta counters). The shared sync Worker is bundle-opaque — no
   Worker change.

8. **UI.** `/collection` gains a neural-energy balance HUD + a per-family **pull**
   control (disabled + labeled when a family is fully collected); silhouettes show
   the **rarity** of the missing variant (not an AP threshold). The pull reveal
   reuses the existing modal+toast. The connectome homepage family card drops the
   "next slot threshold" line and shows the `🧬 X / 6` collection chip.

**Explicitly deferred (design.md follow-ups, NOT in this spine):**
- **P0 cross-cut wiring** — the shared leaderboard Worker regex (`^[a-z]+:P[1-4]…`),
  D1, and the achievement validator are P1–P4. Extending them to P0 touches the
  Worker shared with 二階 (cross-track). This phase **excludes P0 from the
  leaderboard badge CSV** so it stays within the current `P[1-4]` regex; the P0
  wiring is a tracked follow-up.
- **Dupe fusion** (Phase 3), **expedition reward multipliers** (Phase 4),
  **subject flavor** (Phase 5), **roster art fill + real P0 art** (Phase 6).
- **Currency OE theming** (name/metaphor anchored to a real neuro substrate).

## Capabilities

### MODIFIED Capability: neuron-variant-gacha

The roll trigger flips from AP-slot-unlock events to a player-initiated, currency-
gated, per-family pull; rarity becomes a fixed per-variant pyramid (P0–P5) with a
P0 soft-pity; the catalog grows to 66 with fixed rarities; dupes produce `copies`;
the collection fully resets on v10. The currency economy is added here.

### MODIFIED Capability: connectome-collection

AP remains a monotonic per-family counter incremented by correct answers (display +
the new currency mint hook), but **no longer** unlocks variant slots; the
`connectome.variantSlotUnlocked` event and the AP-threshold ladder are removed. The
homepage family card drops the next-slot-threshold display.

### MODIFIED Capability: neurons-variant-collection-view

The dex shows 6 slots per family (P0–P5); uncollected slots are rarity-labeled
silhouettes (not AP thresholds); the page gains a neural-energy balance HUD and a
per-family pull control.
