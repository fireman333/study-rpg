## 1. Route + navbar

- [x] 1.1 Add `<Route path="/collection" element={<CollectionPage pack={pack} />} />` in `apps/neurons-tw/src/App.tsx` and a 6th navbar `NavLink` to `/collection` (mirror the existing dmn/bookmarks/achievements links + `navLinkStyle`).
- [x] 1.2 Scaffold `apps/neurons-tw/src/routes/CollectionPage.tsx` mirroring `DmnCollectionPage` / `AchievementsPage` structure (header + reactive Dexie read).

## 2. Data: collected ∪ catalog join

- [x] 2.1 Reactively read collected variants (`liveQuery(() => db.neuronVariants.toArray())`) into a `Map<\`${familyId}:${slotIndex}\`, NeuronVariantRow>`.
- [x] 2.2 Build the full slot list from `NEURON_VARIANT_CATALOG` (all 55), joining each to its collected row if present; derive uncollected slots' AP threshold from `AP_THRESHOLDS[slotIndex-1]`.
- [x] 2.3 Read family `displayName` + ordering from the ContentPack subjects for section labels.

## 3. Rendering: family sections + slots

- [x] 3.1 Render 11 family sections (labelled), each a row of that family's 5 slots in slot order.
- [x] 3.2 `VariantSlotCard` (collected): sprite (`spriteKey`, reuse `VariantUnlockModal` sprite/rarity visuals) + `displayName` + rarity badge + catalog `description` blurb + `保底` chip when `wasPityFloor` + a reserved empty caption-row element (placeholder; provenance fills later, no reflow). No slot number/name label.
- [x] 3.3 `VariantSlotSilhouette` (uncollected): dimmed sprite/glyph + `需 AP {threshold}`.
- [x] 3.4 Empty-collection state: all-silhouette dex + a short guidance line (never blank).

## 4. Family filter chips (default-all)

- [x] 4.1 Add a family-filter chip bar reusing the `.filter-bar` / `BookmarkFilterBar` pattern (extract a thin shared family-filter if `BookmarkFilterBar` is too bookmarks-specific; keep `.filter-bar` CSS shared).
- [x] 4.2 Default = no chip selected = all families shown; selecting chips narrows to those families; clearing restores all. Chips are additive, NOT a gate.

## 5. Set representative variant

- [x] 5.1 Add a service helper (e.g. `apps/neurons-tw/src/lib/services/representatives.ts`): `getRepresentatives()` (reads `meta['representativeVariants']`, filters out entries whose slot is not collected) + `setRepresentative(familyId, slotIndex)` (rejects + console.warn if that slot is not collected). Persist as a `meta` key JSON map — NO Dexie `.version()` bump.
- [x] 5.2 Wire the card affordance: tapping a collected card sets it as that family's representative; the current representative shows a marker (★ overlay). Reflect updates reactively.

## 6. R2 sync

- [x] 6.1 Add `representativeVariants` to the neurons R2 bundle synced meta-key allowlist and bump `SCHEMA_VERSION` 5 → 6 in `apps/neurons-tw/src/lib/sync/r2/bundles.ts` (extend the SCHEMA_VERSION history comment). Reuse the existing higher-version tolerance (mirror DMN v1→v2). Meta-key LWW via the bundle's existing meta merge.
- [x] 6.2 Update the parked `add-neurons-variant-provenance` change's docs to move its R2 bump from 5→6 to **6→7** (avoid collision), since this change now owns 5→6.

## 7. RWD

- [x] 7.1 Slot grid `repeat(auto-fill, minmax(150px,1fr))` (matches DmnCollectionPage) → intrinsic column reflow (6→4→2 cols desktop→phone); chip bar mirrors YearFilterBar (neurons has no shared `.filter-bar` CSS).

## 8. Tests

- [x] 8.1 Representative helper: set rejects an uncollected slot; valid set persists; `getRepresentatives()` filters out stale (no-longer-collected) entries.
- [x] 8.2 Slot join logic: a collected `(family,slot)` resolves to a card, an absent one to a silhouette with the correct threshold; empty collection → all silhouettes.
- [x] 8.3 R2 round-trip: `representativeVariants` meta key survives push/pull; a `SCHEMA_VERSION = 5` reader tolerates a `= 6` bundle (no error, key dropped).
- [x] 8.4 `pnpm lint:dexie-fixtures` stays green (no `.version()` bump) and `pnpm --filter @study-rpg/neurons-tw test` passes.

## 9. Verify & QA

- [x] 9.1 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw build` clean.
- [x] 9.2 Chrome MCP (chrome_mcp_preflight): `/collection` renders 11 families; 10 collected cards + 45 silhouettes = 55; thresholds correct (10/30/80/200/500); chips default-all (全部 + 11); set-representative writes meta envelope + ★ marker (1 pressed); console clean.
- [x] 9.3 RWD probe (chrome_mcp_rwd_probe width-clone): 6 cols @1100px → 4 @768px → 2 @phones (intrinsic auto-fill reflow).
- [x] 9.4 `/opsx:verify` green on completeness / correctness / coherence before archive.

## 10. Unblock follow-on

- [x] 10.1 After archive: unblock `add-neurons-variant-provenance` — re-pointed its §4 caption tasks at the `VariantSlotCard` `data-provenance-caption` row + flipped its banner to UNBLOCKED; confirmed its R2 bump is 6→7.
