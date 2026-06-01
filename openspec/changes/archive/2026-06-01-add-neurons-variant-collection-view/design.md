## Context

neurons-tw collects 55 variants (11 families × 5 AP-threshold slots; `neuron-variant-gacha`). They are written to the `neuronVariants` Dexie table (PK `[familyId+slotIndex]`) and surfaced only transiently in `VariantUnlockModal` plus a `🧬 X/5` count chip. There is no browse surface. This change adds the `/collection` dex page (grill: `~/.claude/scratch/grilled-neurons-tw-variant-collection-view-2026-06-01.md`). It is "Change A" of a sequenced pair; the OG share card is the deferred "Change B".

Grounded facts (verified in code):
- `meta` is a generic key-value table (`MetaRow` PK `key`) — new keys need no Dexie `.version()` bump.
- `AP_THRESHOLDS = [10, 30, 80, 200, 500]` exported from `apps/neurons-tw/src/lib/connectome/ap-counter.ts`.
- `NEURON_VARIANT_CATALOG` (content pack) has all 55 `{ familyId, slotIndex, displayName, spriteKey, description }` entries → the authoritative slot list incl. uncollected.
- Family `displayName` + NT-branch come from the ContentPack `subjects`.
- Navbar = 5 `NavLink`s in `App.tsx`; R2 bundle `SCHEMA_VERSION = 5` with higher-version tolerance already in `validateBundleMeta`.
- `variant-gacha` exposes `peekAll` / `peekByFamily` (DEV handle) — production read is `db.neuronVariants.toArray()`.

## Goals / Non-Goals

**Goals:**
- A persistent `/collection` page: all 11 families × 5 slots, collected cards + uncollected silhouettes (with unlock threshold), family-filter chips (default-all), per-family representative selection (persisted + synced), reserved provenance-caption row, RWD.

**Non-Goals:**
- No OG share/export character card (Change B).
- No provenance caption CONTENT (just reserve the row).
- No change to gacha mechanics/weights/floors/tests.
- No new collectible types; browse reads existing `neuronVariants`.

## Decisions

### D1 — Dedicated `/collection` route + one navbar entry
Add `<Route path="/collection" element={<CollectionPage />} />` and a 6th `NavLink` in `App.tsx`, mirroring `DmnCollectionPage` / `AchievementsPage`. Do not embed in the connectome homepage (already dense).
- *Alternative considered*: family-detail drawer from connectome node → rejected (changes `ConnectomeTreeSvg` interaction; the dedicated page is simpler + consistent).

### D2 — Slot list is catalog-driven; collected state is a join
The authoritative 55-slot list is `NEURON_VARIANT_CATALOG`. The page loads `db.neuronVariants.toArray()` once (reactive via `liveQuery`), builds a `Map<[familyId,slotIndex], NeuronVariantRow>`, and for each catalog entry renders either a **collected card** (row present) or an **uncollected silhouette** (row absent) showing the slot's AP threshold (`AP_THRESHOLDS[slotIndex-1]`) as the "needs AP X" hook. This keeps the dex complete even before anything is collected.

### D3 — Group by family; filter chips reuse `.filter-bar`, default-all
Render 11 family sections (each a labelled row of 5 slots). A filter bar of family chips reuses the `BookmarkFilterBar` / `.filter-bar` component; **default = no filter active = all families shown**. Selecting chips narrows to those families; chips are additive navigation, not a gate. Rationale: 55 cells is small (bookmarks paginates at 50, achievements lists ~30), and the completionist gestalt depends on seeing the whole board; chips are cheap future-proofing (reused component) for if total ever exceeds 55 — at which point the default could flip to gated with a one-line change.
- *Alternative considered*: default-gated (only selected families) → rejected as premature optimization that kills the gestalt now.

### D4 — Variant card content + reserved caption row
Collected card: sprite (`spriteKey`) + `displayName` + rarity badge (reuse `VariantUnlockModal` visuals) + catalog `description` blurb + `保底` chip when `wasPityFloor` + **one reserved empty caption row** (a placeholder element provenance will later fill). No slot number/name label — family grouping + left-to-right order already conveys slot position. Silhouette: dimmed sprite or generic glyph + `需 AP {threshold}`.

### D5 — "Set representative" = a `meta` key, validated, no Dexie bump
Persist `representativeVariants` as a single `meta` key holding a JSON map `{ [familyId]: slotIndex }`. A helper `getRepresentatives()` / `setRepresentative(familyId, slotIndex)` reads/writes it. **Validation**: `setRepresentative` rejects (no-op + console.warn) if that `(familyId, slotIndex)` is not collected. Because `meta` is key-value, this needs **no Dexie `.version()` bump**. The collection card for the current representative shows a marker (e.g. ★); tapping a collected card sets it.
- *Alternative considered*: a column on `familyAccrual` → rejected (would need a schema bump for no benefit; meta key is sufficient).

### D6 — Representative selection syncs via R2; bump SCHEMA_VERSION 5 → 6
Add `representativeVariants` to the neurons R2 bundle's synced meta-key allowlist and bump `SCHEMA_VERSION` 5 → 6, reusing the existing forward-compat tolerance (`validateBundleMeta` console.info + continue; mirror DMN v1→v2). Meta-key LWW (the bundle's existing meta merge). **Sequencing**: this change owns the 5 → 6 bump; the parked `add-neurons-variant-provenance` therefore moves to **6 → 7** (update its proposal/design when it resumes so the two don't collide).
- *Alternative considered*: don't sync representative (local-only) → rejected; it's a collection preference and the project's cross-device-save value applies. Cost is one allowlist entry + the bump.

### D7 — RWD reuses the verified `.filter-bar` class-override pattern
Slot grid uses `repeat(auto-fill, minmax(150px, 1fr))` (matching the shipped `DmnCollectionPage`), so columns reflow intrinsically with width — verified 6 cols @1100px → 4 @768px → 2 on phones. (neurons-tw has no shared `.filter-bar` CSS; the chip bar mirrors `YearFilterBar`'s inline-styled pixel aesthetic, not the 二階 `BookmarkFilterBar`.) Verified via `chrome_mcp_rwd_probe` width-clone technique.

## Risks / Trade-offs

- **Representative points at a later-cleared/invalid slot** (e.g. dev reset) → `getRepresentatives()` filters out family→slot entries with no matching collected row at read time; UI falls back to "no representative". → Defensive read.
- **Empty-collection first run** → page renders all-silhouette dex (full 55 silhouettes + thresholds) with a short guidance line; never a blank page.
- **SCHEMA_VERSION collision with the parked provenance change** → explicitly sequenced (this = 5→6, provenance = 6→7); flagged in both changes' docs.
- **Filter component coupling** → if `BookmarkFilterBar` is too bookmarks-specific, extract a thin shared family-filter rather than overfitting; keep `.filter-bar` CSS shared.

## Migration Plan

- Ship in neurons-tw; deploy via `pnpm deploy:cf`. No Worker/D1/Supabase change (R2 bundle is opaque to the Worker; only the new synced meta key + SCHEMA_VERSION bump).
- No data migration (browse is read-only; representative map starts empty).
- Rollback: revert; the `representativeVariants` meta key written meanwhile is simply ignored by the prior build.

## Open Questions

- Exact representative marker affordance (★ overlay vs a "設為代表" button on the card) — finalize at verify visual pass.
- Whether the filter bar also offers a rarity filter — default NO for v1 (family chips only); revisit if dogfood wants it.
- Reserved caption row's exact placeholder height/styling so provenance drop-in causes no reflow — coordinate with `add-neurons-variant-provenance` design when it resumes.
