## 1. Decisions (Gate-1 resolved 2026-06-07; remaining to set in apply)

- [x] 1.1 U1 = **REPLACE** the 116 broad pool with a learning/LTP/memory-circuit pool covering ALL synapses (first route included)
- [x] 1.2 U2 = **MOVE NOW** — catalog ripple (D1 CHECK + Worker bound + achievement thresholds + denominators) handled in this change
- [x] 1.3 Set the per-family second-route node upper bound ("as many as natural" → a concrete cap) against visual density
- [x] 1.4 Set the `grid-graph.json` second-route shape (`routes[]` array vs `path2`/`nodeCells2` fields)

## 2. OE grounding for LTP location pool (REPLACE — covers all synapses)

- [x] 2.1 Run `/oe` on learning / LTP / memory-circuit neuroanatomy (CA3/CA1, Schaffer collaterals, perforant path, dentate gyrus, mossy fibers, LTP synapse, engram, place cells, sharp-wave ripples, related memory-system tracts/nuclei)
- [x] 2.2 Curate enough learning-circuit names to label ALL crossing-synapses + second-route positions (round-robin repeats OK, as the prior 116-over-135 did), each with a PMID anchor; record provenance to a scratch candidates file (mirror 2026-06-05 circuit-location grounding)
- [x] 2.3 Rewrite `packages/content-neurons-tw/src/circuit-locations.ts` (REPLACE the 116 broad pool) with the learning-circuit `{ zh, en, type }` entries + PMID notes

## 3. Build pipeline (second route + whole-pool re-stamp)

- [x] 3.1 Extend `apps/neurons-tw/scripts/build-grid-maze.mjs` to emit a second longer route per family through unused crossings (slot indices ≥ firstRouteNodeCount), bounded by the §1.3 cap
- [x] 3.2 Re-run `assign-circuit-locations.mjs` over ALL synapses (first + second route) from the new learning-circuit pool, deterministically
- [x] 3.3 Regenerate + commit `apps/neurons-tw/src/assets/maze/grid-graph.json`; routes/nodes/weave unchanged, but `synapses[].location` is re-stamped (first-route locations CHANGE to learning-circuit names — expected per U1)

## 4. Content catalog (location variants)

- [x] 4.1 Extend the per-family `NEURON_VARIANT_CATALOG` with second-lap **location variants** (slotIndex ≥ firstRouteNodeCount), one per second-route position; mark them as deterministic location variants (not rarity-pyramid rolls)
- [x] 4.2 Ensure `NEURON_VARIANT_TOTAL` derives from the catalog (now > 110); add a test that no consumer hard-codes 110
- [x] 4.3 Define the location-variant rendering key `(familyId, location)` → hue/filter mapping in the content/theme layer

## 5. Runtime maze (graph + economy + walker)

- [x] 5.1 `lib/maze/graph.ts`: parse second-route nodes into the combined ordered node list; `litNodes` / `frontierNode` / `walkerCell` extend past first-route nodeCount (walker tweens the second-route polyline instead of resting at center)
- [x] 5.2 `lib/maze/economy.ts` `reconcileSettles`: branch on settle index — `< firstRouteCount` → existing random `pullVariant`; `≥ firstRouteCount` → deterministic position-bound location-variant unlock
- [x] 5.3 `lib/maze/useMaze.ts`: recompute lit/frontier/walker for the second lap; ensure the single `useMaze` mount invariant (no double pulls) holds
- [x] 5.4 `components/maze/MazeGrid.tsx`: render second-route nodes + walker on the second lap; fog second-route nodes until lit

## 6. Gacha (position-bound unlock path)

- [x] 6.1 `lib/services/variant-gacha.ts`: add the deterministic location-variant unlock path (selects `(familyId, secondRouteSlotIndex)`), keep first-route random-within-tier + P0 pity unchanged
- [x] 6.2 Already-owned location variant → existing dupe handling (new individual / copies increment)

## 7. Rendering (procedural hue/filter)

- [x] 7.1 `VariantSprite` / `variant-decor`: apply the position-keyed hue/filter for location variants, layered behind the base sprite, distinct from rarity + decor + band channels; zero new sprite asset
- [x] 7.2 Surface 「在 <location> 解鎖」 caption for location variants (pure-derived from `(familyId, slotIndex)` + graph)

## 8. Persistence / sync

- [x] 8.1 Confirm new location variants are rows in the existing `neuronVariants` table (no PK change, no new table) and second-lap progress reuses `maze:<familyId>:settles` → **no Dexie `.version()` bump** (no dexie-fixture-lint trigger)
- [x] 8.2 Confirm no new synced meta key is needed → R2 bundle `SCHEMA_VERSION` unchanged; if one is added, bump + add reader-tolerance + cross-version test

## 9. Catalog-size ripple (U2 = move now — in this change)

- [x] 9.1 Raise leaderboard D1 `variant_count` CHECK 110 → `NEURON_VARIANT_TOTAL` (apply via dashboard / `--command` per wrangler 4.x single-statement limit; record in `d1_migrations`)
- [x] 9.2 Raise the sync Worker `variant_count` validation bound; redeploy Worker BEFORE any client can send counts > 110
- [x] 9.3 Rescale `achievements.ts` collection-milestone threshold numbers to the new total (code-only; `neurons-achievements` spec is catalog-agnostic, no spec delta)
- [x] 9.4 Audit all `/110` denominators → read `NEURON_VARIANT_TOTAL`

## 10. Tests

- [x] 10.1 Second-lap auto-entry: family enters 二回目 at `settles ≥ firstRouteNodeCount` (derived from settles, no flag)
- [x] 10.2 Position-bound unlock: second-lap settle at index i → deterministic `(family, firstRouteCount+i)` variant; first-route settles stay random-within-tier
- [x] 10.3 Lit-node extension: `litNodes`/`frontierNode`/`walkerCell` light/traverse second-route nodes; cap at combined total
- [x] 10.4 Catalog total: `NEURON_VARIANT_TOTAL` > 110 + no hard-coded-110 consumer
- [x] 10.5 Location naming: every synapse (first + second route) resolves a learning-circuit name from the replaced pool; existing variant captions recompute deterministically (pure-derived, no migration)
- [x] 10.6 No-Dexie-bump assertion (and R2 bundle round-trip if a meta key is added)
- [x] 10.7 Hue/filter determinism: same `(familyId, location)` → identical render across devices

## 11. Verification

- [x] 11.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` green
- [x] 11.2 `pnpm lint:dexie-fixtures` no-op (confirms no Dexie bump) — or fixture present if one was needed
- [x] 11.3 Chrome MCP visual QA on the homepage maze: second route renders, fog clears on second-lap settle, location variants show hue/filter + 「在 <location> 解鎖」 caption, console clean
- [x] 11.4 `/opsx:verify` green (completeness / correctness / coherence) before archive
