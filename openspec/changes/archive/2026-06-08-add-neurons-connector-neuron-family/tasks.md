## 1. Content — connector catalog helpers

- [x] 1.1 In `packages/content-neurons-tw/src/`, add a connector module deriving the closed 55-set from `FAMILY_IDS`: `connectorPairKey(a,b)` (sorted, `|`-joined, order-independent), `CONNECTOR_PAIR_KEYS` (55 distinct, no self-pairs), `connectorFamilies(pairKey)`, `connectorColors(pairKey)` (two `FAMILY_COLOR` values), `connectorSpriteKey`, `CONNECTOR_TOTAL`. All numbers dogfood-tunable.
- [x] 1.2 Re-export the connector helpers + types from `packages/content-neurons-tw/src/index.ts`.
- [x] 1.3 Add a content-level unit test (`scripts/verify-connectors.ts` + `verify:connectors`) asserting set size = 55, no duplicates/self-pairs, and `pairKey` order-independence. ✓ 8/8 pass.

## 2. Persistence — Dexie v18 table + retroactive backfill

- [x] 2.1 In `apps/neurons-tw/src/lib/db.ts`, add `.version(18)` with a new `connectorNeurons` store (PK `pairKey`, indexed `unlockedAt`, `updatedAt`); keep all existing stores. No pk change to any existing table. ✓ + `ConnectorNeuronRow` interface + table field.
- [x] 2.2 In the v18 `.upgrade()` callback, scan `synapses` and `put` a `connectorNeurons` row for every wire with `state === 'strong'` (incl. legacy), deterministic `unlockedAt` (wire `lastCoFireDate` parsed to ms, else `CONNECTOR_BACKFILL_EPOCH`). Runs once.
- [x] 2.3 Add the required upgrade fixture `apps/neurons-tw/src/__tests__/db-v17-to-v18-migration.test.ts`: seed v17 with strong + legacy-strong + weak + dormant synapses, reopen as v18, assert backfill hits strong only (incl. legacy), `verno === 18`, no `DatabaseClosedError`. ✓ 1/1 pass.

## 3. Service — unlock + hook + queries

- [x] 3.1 Add `apps/neurons-tw/src/lib/services/connector.ts`: `unlockConnector(pairKey)` (idempotent — skip if exists, never overwrite `unlockedAt`; returns whether freshly unlocked), `buildConnectorEntries()` (pure: unlocked + derived-locked over the 55-set), `useConnectors()` live-query hook.
- [x] 3.2 In `apps/neurons-tw/src/lib/services/connectome.ts` `creditConnectomeFromExpedition`, capture `weak → strong` transitions in-tx, then call `unlockConnector(pairKey)` post-commit via dynamic import in try/catch (channel `[connector]`) so it never breaks settlement.
- [x] 3.3 Confirm non-strong transitions (`dormant→weak`, conduction, same-tier) do NOT unlock — capture guarded by `toState === 'strong'` (covered by service test in §6).

## 4. Sync — R2 additive adapter

- [x] 4.1 In `apps/neurons-tw/src/lib/sync/tables.ts`, add `connectorNeuronsAdapter`: snapshot = all rows; apply = UNION by `pairKey`, keep earlier `unlockedAt` + later `updatedAt`, never delete (mirror `equipmentAdapter` monotonic merge). Registered in `NEURONS_ADAPTERS`.
- [x] 4.2 In `apps/neurons-tw/src/lib/sync/r2/bundles.ts`, bump `SCHEMA_VERSION` 19 → 20 + v20 history note. Adapter registry IS the allowlist (`applyBundleSnapshot` iterates `NEURONS_ADAPTERS` with `?? []`) → additive + reader-tolerance automatic (v19 drops unknown key; v20 reading v19 → empty array → preserve-on-omission).

## 5. UI — collection section + procedural card + sprite registry

- [x] 5.1 Add a procedural `ConnectorCard` (`components/ConnectorSection.tsx`): split-color frame from the two `FAMILY_COLOR`s + inline SVG bridge-axon glyph + synaptic glow; resolve `connector:<pairKey>` sprite when present, else procedural; locked = grey silhouette (missing PNG never a broken image).
- [x] 5.2 In `apps/neurons-tw/src/routes/CollectionPage.tsx`, add a「連結神經元 N/55」section (`<ConnectorSection>`) after the per-family sections — flat grid, unlocked colored + locked silhouettes.
- [x] 5.3 In `packages/theme-pixel-neurons/src/sprites.ts`, add a `connectors/*.png` glob keyed `connector:<pairKey>` spread (present-only) into `SPRITE_MAP` (no PNGs ship this change → procedural fallback).

## 6. Tests

- [x] 6.1 Service test (`connector-service.test.ts`): content↔app pairKey agreement; first `weak→strong` unlocks; re-strengthen does not duplicate; decay does not remove; dormant-form + dormant→weak do not unlock; projection over 55-set. ✓ 8/8.
- [x] 6.2 Sync round-trip test (`connector-sync.test.ts`): union across devices; stale device cannot un-unlock; earlier-unlockedAt wins; v19↔v20 cross-version tolerance. ✓ 7/7.
- [x] 6.3 `pnpm --filter @study-rpg/neurons-tw test` (441/441) + `pnpm -r typecheck` (clean) + `pnpm lint:dexie-fixtures` (OK) + content `verify:connectors` (8/8). Bumped 8 pre-existing schema_version/verno pins (19→20, 17→18) caused by the bump.

## 7. Verify + ship

- [x] 7.1 Chrome MCP smoke (dev `localhost:5175/collection`): 「連結神經元 0/55」section renders 55 procedural-SVG locked cards; injecting a connector row flips it to unlocked (1/55) via liveQuery; cleanup → 0/55; F5 on /collection re-renders (route stable); console clean; labels consistent with the dex.
- [x] 7.2 `/opsx:verify` (no CRITICAL/WARNING) → archive (spec synced, capability count 86→87) → explicit per-file commit (feat `5d6c8c4` + this spec(archive)) → merge `track-neurons`→`main` → push → CF Pages deploy → prod smoke at `med-study-rpg.com/neurons/`.
