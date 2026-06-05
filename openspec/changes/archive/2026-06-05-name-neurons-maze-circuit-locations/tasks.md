## 1. Content: circuit-location name pool

- [x] 1.1 Create `packages/content-neurons-tw/src/circuit-locations.ts` — `CIRCUIT_LOCATIONS: { zh; en; type }[]` parsed from the OE scratch file (116 real entries; squid giant synapse excluded), exported from the package index
- [x] 1.2 `pnpm --filter @study-rpg/content-neurons-tw build` clean; `CircuitLocation` + `CIRCUIT_LOCATIONS` exported

## 2. Build-time assigner

- [x] 2.1 Create `apps/neurons-tw/scripts/assign-circuit-locations.mjs` — read committed `grid-graph.json`, sort `synapses` by cell (y,x), assign `location` (zh) round-robin from the pool, write JSON back (minified, matching the committed format); mutate ONLY `synapses[].location`
- [x] 2.2 Add `build:maze-locations` script to `apps/neurons-tw/package.json`
- [x] 2.3 Ran it (135 synapses → 116 unique names); diff-verified routes/nodes/weave byte-identical after stripping `location` (only `location` keys added)

## 3. Runtime derivation

- [x] 3.1 Added `location?: string` to `GridSynapse` in `lib/maze/graph.ts`
- [x] 3.2 Added `synapseLocationFor(familyId, slotIndex): string | null` — node by slotIndex → if `synapse`, lookup `SYNAPSE_BY_CELL` → return `location` (else null)

## 4. Surface in the caption

- [x] 4.1 `lib/variant-caption.ts` weaves ` · 在<location>尋獲` into `variantBirthCaption` when `synapseLocationFor` is non-null (covers VariantUnlockModal + CollectionPage via the single helper; 元老 rows included)

## 5. Verify

- [x] 5.1 `pnpm -r typecheck` clean
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test` — 359/359 green incl new `circuit-location.test.ts` (3 tests: every synapse-slot → real pool name; out-of-range/padded → null; caption contains 尋獲)
- [x] 5.3 `pnpm --filter @study-rpg/neurons-tw build` (prod) succeeds
- [x] 5.4 Verified via unit test (caption surfaces 「在 X 尋獲」 for located slots; padded omit) + names asserted to be members of the OE-grounded pool. Live DOM check skipped (collection needs owned variants; caption is DOM not canvas — owner can spot-check live)
- [x] 5.5 Confirmed zero schema/sync: no `db.ts .version()` / `bundles.ts SCHEMA_VERSION` / variant-row field change in the diff
