## Why

The Collection 2.0 spine shipped a **P0–P5 per-family rarity pyramid** (`rework-neurons-variant-pyramid`, 2026-06-02) and an **open collection** with no closed cap (`rework-neurons-open-collection`). The catalog currently declares **77 variants = 11 families × 7 slots** (per family: P0×1 / P1×1 / P2×1 / P3×1 / P4×1 / P5×2), and all 77 sprites are real art after the slot-6 art-fill (`7fb36b3`).

77 is small for an open "collect-them-all" chase: each family tops out at 7, so the long tail a base-heavy pyramid is supposed to produce is shallow. The original grill vision (`~/.claude/scratch/grilled-neurons-changeB-collection-rework-2026-06-02.md`) targeted **~110 variants (10+/subject)**. The slot model is already built for this — rarity is an explicit per-entry field, `slotIndex` is contiguous `0..N-1`, and both `VARIANT_COUNT_BY_FAMILY` / `slotsForFamily` derive from the catalog (no hardcoded count). So the expansion is **pure content growth into an existing seam**, not a re-architecture.

This change grows the catalog from 77 to **110 = 11 families × 10 slots** (uniform), keeping the same pyramid model, roll mechanics, and open-collection paradigm. It deepens the mid-tier collection (the satisfying reveals) without touching drop rates: the rarity roll is **tier-first then within-tier** (`rollRarityWithP0Pity` rolls a tier by fixed `VARIANT_RARITY_WEIGHTS`, then a uniform pick among that tier's variants), so adding variants to a tier only adds *variety to collect*, never shifts the per-tier probability.

## What Changes

In `packages/content-neurons-tw` + `apps/neurons-tw` (theme pack sprites: see Decision D2):

1. **Catalog 77 → 110.** Add 3 new slots per family (slotIndex 7 / 8 / 9), thickening the mid tiers: per family becomes **P0×1 / P1×1 / P2×2 / P3×2 / P4×2 / P5×2 = 10**. The build-time `assertCatalogShape` guard already enforces the constraints the new entries must satisfy (one P0 at slot 0, contiguous `0..9`, pyramid invariant, canonical `spriteKey`); the additions keep all of them.

2. **33 new personas.** Each new entry (3 slots × 11 families) gets a unique `displayName` + `description` consistent with the family's established neuron identity (these are additional personas of the same neuron type at mid-tier rarities — the NT branch / anatomy / mechanism is already family-anchored from the existing 77, so no new neuroscience claims; flavour layer only).

3. **Sprites for the 3 new slots** — GATE 1 chose to **generate all 33 inline** (Decision D2 Path 2): the catalog ships fully-arted (110 real PNGs, zero placeholder), preserving `7fb36b3`'s "0 placeholder" polish. Sprites match the existing GBA 16-color pixel-art style + per-family neuron identity + authored persona.

4. **Pyramid-catalog test re-pin.** `apps/neurons-tw/src/__tests__/variant-pyramid-catalog.test.ts` updates `77 → 110`, per-family `7 → 10`, contiguous `0..9`, and the per-tier slot-set assertions for the new distribution.

5. **Distinct-count achievement re-tune** (content-only, no spec delta — thresholds aren't pinned in `neurons-achievements` spec). Scale the 4 variant milestones to preserve their proportional intent at the new 110 cap and fix now-inaccurate "過半" wording: `variant-fifteen` 15→20, `variant-thirty` 30→40 (drop "過半典藏"), `variant-fifty` 50→70, `variant-grand-collector` (P1) 60→90 (keeps the ≥3-natural-P1-families composite gate). Entry count unchanged → `neurons-achievements` invariants (≥30 entries, ≥4/category, P1 composite) stay satisfied.

**No schema / sync / Worker change.** No Dexie `.version()` bump (no new field or table), no R2 `SCHEMA_VERSION` bump (catalog grows, bundle shape unchanged), Worker/D1/leaderboard untouched (`variant_count` is just a row count). `character-card.ts` `SLOTS_PER_FAMILY = VARIANT_TOTAL / FAMILY_TOTAL` stays valid because 110/11 = 10 (uniform). Out of scope: dupe-fusion, expedition rewards, subject-flavour enrichment (separate Collection 2.0 phases).
