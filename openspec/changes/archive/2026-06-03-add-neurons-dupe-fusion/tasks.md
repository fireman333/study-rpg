# Tasks — add-neurons-dupe-fusion

> Worktree: `~/coding-scratch/study-rpg-neurons` (track-neurons). Pure additive: new `neuronInstances` table, no PK change, no collection reset. Fixture-first (per the v18 pk-change prod incident lesson).
>
> **COMPLETE (2026-06-03)**: all 9 groups done. `pnpm -r typecheck` EXIT=0 (incl. 二階); `pnpm --filter @study-rpg/neurons-tw test` 252/252 green; `pnpm lint:dexie-fixtures` OK; Chrome MCP end-to-end smoke passed on localhost:5177 (40 pulls → 40 individuals; promote consumed 3 + minted T−1 dupe individual; energy unchanged; first-fusion achievement unlocked; F5 persists held + consumed; /collection direct URL + F5 no 404; console clean). NOT committed (Curator). §7.3 leaderboard individual-count DEFERRED (would need work beyond existing plumbing; achievements cover the milestone). ⚠️ dev localhost:5177 IndexedDB now holds smoke test data (40 藥理學 pulls + 1 promote + granted energy) — prod (med-study-rpg.com) untouched.

## 1. Types & constants

- [x] 1.1 Add `NeuronInstanceRow` interface to `apps/neurons-tw/src/lib/db.ts` (`instanceId` string PK, `familyId`, `slotIndex`, `rarity`, `spriteKey`, `rolledAt`, `provenance?`, `consumedAt: number | null`)
- [x] 1.2 Add `mintInstanceId(familyId, slotIndex, rolledAt)` helper (device-stable string) in `lib/services/variant-gacha.ts`
- [x] 1.3 Add `PROMOTE_COST_K` constant (default `3`) to `@study-rpg/content-neurons-tw` (dogfood-tunable, single source of truth)

## 2. Dexie v13 + migration (fixture-first)

- [x] 2.1 Write the v12→v13 upgrade fixture FIRST at `__tests__/db-v12-to-v13-migration.test.ts` (seed copies=3 + energy/AP, assert 3 instances / 1 provenance / preserved)
- [x] 2.2 Add `this.version(13)`: new store `neuronInstances: 'instanceId, familyId, slotIndex, rarity, consumedAt'`; existing index strings unchanged (NO PK change)
- [x] 2.3 Implement the v13 `.upgrade()` callback: expand each `neuronVariants` `copies=N` → N instances (first inherits provenance+rolledAt; rest 元老, deterministic `:m<i>` ids); no reset/banner
- [x] 2.4 Add the `neuronInstances` table handle to the `NeuronsDB` class
- [x] 2.5 Run `pnpm lint:dexie-fixtures` — v13 fixture detected (green)

## 3. Mint path — every pull writes an individual

- [x] 3.1 `pullVariant` tx: insert one `neuronInstances` row per pull (own birth context); keep `copies` as monotonic lifetime-mint count
- [x] 3.2 Mirror the instance insert in `mintVariantSlot` (maze settle path)
- [x] 3.3 Add derived `currentOwnedCount(familyId, slotIndex?)` reading held instances

## 4. Tier-promote service

- [x] 4.1 New `lib/services/variant-fusion.ts`: `eligibleSurplusByTier` (last-copy protection — oldest-per-slot protected)
- [x] 4.2 `promoteTier`: validate ≥ K surplus + ≠ P0; tx consumes K (`consumedAt`) + mints one T−1 (prefer unowned, else dupe individual); reuse mint reveal/provenance/achievement hooks; never throws
- [x] 4.3 Guard: `promoteTier` does NOT touch `neuralEnergy*` or rarity weights (locked by test)
- [x] 4.4 Promote counters `meta['promoteCount']` + `meta['rarestPromotedRank']` (LOCAL meta — achievement rows sync via achievements table)

## 5. Collection view — render individuals

- [x] 5.1 `CollectionPage.tsx`: held individuals grouped family→slot; per-slot expand button reveals the individuals strip (mini sprites)
- [x] 5.2 `instanceAsRow` adapter feeds each individual through `VariantSprite` → per-instance `variantContextArt` (own band/decor)
- [x] 5.3 `🧬 X 隻` chip stays distinct-slot; added faint `· 共 N 個體` secondary when dupes exist (verified `🧬 7 隻 · 共 40 個體`)
- [x] 5.4 Per-tier promote buttons (surplus/K, disabled < K or P0) — verified `P5→P4（24/3）` etc.

## 6. R2 sync — instances

- [x] 6.1 `bundles.ts`: bump `SCHEMA_VERSION` 10→11 + v11 history note (additive, reader-tolerant)
- [x] 6.2 `tables.ts`: `neuronInstancesAdapter` — union by `instanceId`; `consumedAt` monotonic-OR; no resurrection
- [x] 6.3 Worker needs no change (bundle-opaque) — confirmed

## 7. Achievements & leaderboard

- [x] 7.1 3 fusion achievements added to catalog (variant-first-fusion P4 / fusion-adept P3 / fusion-master P2, all `promotesAtLeast`); `buildAchievementStats` reads `promoteCount`; validator green (33 entries, variant:8)
- [x] 7.2 Promote hook wired to `triggerAchievementCheck` in `promoteTier`; verified first-fusion unlocks in browser
- [x] 7.3 Leaderboard individual-count DEFERRED — category max-tier CSV unaffected (new entries all in `variant` cat whose max stays P1); no D1 change

## 8. Tests

- [x] 8.1 `variant-fusion.test.ts`: last-copy protection; promote consumes K + mints T−1; P0 not promotable; < K disabled (5 tests)
- [x] 8.2 `neuron-instances-merge.test.ts`: union by instanceId; `consumedAt` monotonic-OR; no resurrection (5 tests)
- [x] 8.3 cross-version preserve-on-omission test (in neuron-instances-merge.test.ts): v11 client reading a no-`neuronInstances`-key bundle keeps local
- [x] 8.4 No-currency guard test (in variant-fusion.test.ts): promote leaves `neuralEnergy*` untouched
- [x] 8.5 full suite green — 254/254 (36 files); also fixed 3 pre-existing bundle-version assertions 10→11
- [x] 8.6 (verify SUGGESTION, resolved) `variant-mint-instance.test.ts`: locks R1 invariant — mintVariantSlot ×2 → 2 individuals + copies=2; pullVariant mints exactly 1 individual (the mint path was previously smoke-only)

## 9. Verify

- [x] 9.1 `pnpm -r typecheck` EXIT=0 (all packages + 3 apps incl. 二階); `pnpm lint:dexie-fixtures` green
- [x] 9.2 Chrome MCP smoke (localhost:5177): 40 pulls → 40 individuals; promote consumed 3 + minted T−1 (dupe individual fallback); energy unchanged; first-fusion unlocked; console clean
- [x] 9.3 SPA: /collection direct URL loads + F5 persists held (38) + consumed (3) soft-delete, no 404
- [x] 9.4 orphan check: all `.copies` uses legit (sync MAX-merge / migration / lifetime bump / CollectionPage fallback); fixed stale 「碎片留待融合」 wording in VariantUnlockModal
