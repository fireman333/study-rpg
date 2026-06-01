## Why

neurons-tw has no persistent surface for browsing collected neuron variants. A variant is visible only for ~8 seconds in the `VariantUnlockModal` at mint, then never again — the only lasting trace is a per-family `🧬 X/5` count chip. The Pikmin Bloom north star ("browse your whole collection, see what you've caught + silhouettes of what's missing") needs a real dex page. This page is also the **prerequisite** that unblocks the parked `add-neurons-variant-provenance` change, whose birth-caption needs a card to live on.

## What Changes

- New `/collection` route + a single navbar entry (6th link), mirroring the existing `DmnCollectionPage` / `AchievementsPage` pattern.
- **Pokédex-style** layout: every family shows all 5 slots; uncollected slots render a dimmed silhouette + the AP unlock threshold (10/30/80/200/500) as a "next one needs AP X" hook.
- **Grouped by family** (11 sections, each a row of 5 slots).
- **Filter chips** reusing the existing `.filter-bar` / `BookmarkFilterBar` component, **default = all families shown** (chips narrow; they are not a gate). Future-proofs for a possible variant-count growth without sacrificing the 55-variant completionist gestalt today.
- **Variant card** = sprite + displayName + rarity, PLUS catalog description blurb + pity chip (`wasPityFloor`) + a **reserved one-line provenance-caption row** (empty placeholder now; filled later by `add-neurons-variant-provenance`).
- **Set representative variant**: the player may pick one collected variant per family as that family's representative. Persisted as a `meta` key and synced cross-device.
- RWD per project rule: intrinsic auto-fill grid (matching `DmnCollectionPage`) — many columns on desktop, reflowing to 1–2 on phones.

## Capabilities

### New Capabilities
- `neurons-variant-collection-view`: the `/collection` dex page — browse all families' variant slots (collected cards + uncollected silhouettes with thresholds), family-filter chips (default-all), per-family "set representative" selection with persistence + cross-device sync, and a reserved caption row for later provenance.

### Modified Capabilities
<!-- none — set-representative persistence + its R2 sync are specified within the new capability; no existing spec's requirements change -->

## Impact

- **Code (additive)**:
  - `apps/neurons-tw/src/App.tsx` — register `/collection` route + add navbar `NavLink` (6th).
  - `apps/neurons-tw/src/routes/CollectionPage.tsx` (new) — the dex page; reads collected variants via `variant-gacha` `peekAll`, derives uncollected slots from `NEURON_VARIANT_CATALOG`, groups by family, renders the filter bar + slot grid.
  - New presentational components (e.g. `VariantSlotCard` / `VariantSlotSilhouette`) — reuse `VariantUnlockModal`'s sprite/rarity/pity visuals; include the reserved caption row.
  - Reuse `BookmarkFilterBar` (or a thin family-filter variant of it) + its `.filter-bar` CSS.
  - `apps/neurons-tw/src/lib/services/` — a small helper to read/write the `representativeVariants` `meta` key (validate that the chosen slot is actually collected).
  - `apps/neurons-tw/src/lib/sync/r2/bundles.ts` — if representative selection syncs: bump `SCHEMA_VERSION` 5 → 6 + add the new synced meta key to the allowlist (reuse existing higher-version tolerance; mirror DMN v1→v2). **Sequencing note**: this ships before `add-neurons-variant-provenance`, so that change becomes 6 → 7 — the two must not both claim 5 → 6.
  - **No Dexie `.version()` bump** — `meta` is a generic key-value table; the representative map is a new meta key, not a schema change (confirm in design).
- **Tests**: representative read/write + validation (reject selecting an uncollected slot); collected-vs-silhouette rendering logic; (if synced) R2 round-trip of the representative meta key + cross-version tolerance.
- **Out of scope (deferred, not excluded)**:
  - Share / export character card (OG image) → fast-follow "Change B" (roadmap M6 social).
  - Provenance caption CONTENT → `add-neurons-variant-provenance` fills the reserved row after this archives.
- **Unblocks**: `add-neurons-variant-provenance` (currently parked pending this surface).
