# Tasks — rework-neurons-collection-gacha

> Phase 2 spine. Lane B worktree `study-rpg-neurons-gacha`. All paths relative to
> repo root. Run stops at merge gate (push branch only).

## 1. Content pack — catalog + gacha constants (`packages/content-neurons-tw`)

- [ ] 1.1 `src/variants.ts`: add `'P0'` to the `Rarity` union; extend `SlotIndex`
      to `0 | 1 | 2 | 3 | 4 | 5`.
- [ ] 1.2 Replace `VARIANT_RARITY_WEIGHTS` (P5/P4/P3/P2/P1=60/25/10/4/1) with the
      P0–P5 base weight table `P0 0.7 / P1 1.3 / P2 4 / P3 10 / P4 25 / P5 59`
      (sums to 100). Single source of truth.
- [ ] 1.3 Add P0 soft-pity constants: `P0_BASE_RATE = 0.007`, `P0_PITY_START = 40`,
      `P0_PITY_RAMP = 0.05`. Add currency constants `CORRECT_ANSWER_ENERGY = 3`,
      `READING_MINUTE_ENERGY = 2`, `PULL_COST = 20`.
- [ ] 1.4 Add `SLOT_RARITY` map: `slotIndex → fixed Rarity` (0→P0, 1→P5, 2→P4,
      3→P3, 4→P2, 5→P1). Remove `SLOT_RARITY_FLOOR` + `VARIANT_REROLL_CAP` (no
      floors in the new model) — grep all importers and update.
- [ ] 1.5 Extend `NEURON_VARIANT_CATALOG` 55 → 66: add a `slotIndex: 0` (P0) entry
      per family (placeholder displayName e.g. `始源<family-flavor>` + description +
      `spriteKey: variant:<family>:0`). Add a `rarity` field to `NeuronVariantDef`
      and populate every entry per `SLOT_RARITY`.
- [ ] 1.6 Update `assertCatalogShape`: expect **66** entries, `slotIndex ∈ [0,5]`,
      every `(family, 0..5)` present, `rarity` matches `SLOT_RARITY[slotIndex]`,
      spriteKey `variant:<family>:<slot>`.
- [ ] 1.7 `composeVariantDisplayName` + `DEFAULT_VARIANT_TITLE_BY_RARITY`: add a P0
      title (e.g. `始源核`). Keep the `· <title>` compose convention.
- [ ] 1.8 Add a pure `rollRarityWithP0Pity(pullCount, p0Owned, rng?)` helper +
      `effectiveP0Rate(pullCount)` returning a `Rarity`. Unit-testable.

## 2. Theme pack — P0 sprite slot (`packages/theme-pixel-neurons`)

- [ ] 2.1 Add 11 P0 placeholder sprites `sprites/variants/<family>-0.png` (reuse the
      transparent-placeholder approach OR a single shared P0 placeholder) so
      `variant:<family>:0` resolves without a broken image. Real art = Phase 6.
- [ ] 2.2 Confirm `src/sprites.ts` glob `variants/*.png` + last-`-`-split keying
      registers the `-0` files as `variant:<family>:0`. No code change if the glob
      already covers them.

## 3. Dexie schema v10 + full-reset upgrade + fixture (`apps/neurons-tw`)

- [ ] 3.1 `src/lib/db.ts`: add `copies: number` to `NeuronVariantRow`; add
      `pullCount: number` to `FamilyAccrualRow` (both non-indexed additive — do NOT
      add to `.stores()` index strings). Update `initFamilyAccrualIfEmpty` to seed
      `pullCount: 0`.
- [ ] 3.2 Add `this.version(10).stores({…identical to v9…}).upgrade(async (tx) => {…})`.
      Upgrade callback: `tx.table('neuronVariants').clear()`; reset every
      `familyAccrual` row `{ unlockedSlots: [], pullCount: 0 }`; set
      `meta['neuralEnergyEarned']='0'` + `meta['neuralEnergySpent']='0'`. **Do not
      touch the PK string** (`[familyId+slotIndex]` retained).
- [ ] 3.3 Fixture `src/__tests__/db-v9-to-v10-migration.test.ts` (satisfies
      `dexie-fixture-lint`): seed a v9 DB (literal `.version(9).stores(`) with
      old-shape variants + AP + synapses + mastery, reopen at v10, assert
      `neuronVariants` empty, currency keys = '0', AP/synapses/mastery preserved,
      `pullCount` = 0.

## 4. Currency service (`apps/neurons-tw/src/lib/services/currency.ts`)

- [ ] 4.1 New module: `awardEnergy(tx, amount)` (+= `neuralEnergyEarned`),
      `spendEnergy(tx, amount)` (+= `neuralEnergySpent`), `readBalance()` (earned −
      spent), `readEarned`/`readSpent`. All meta-key based, parseIntSafe.
- [ ] 4.2 `useEnergyBalance()` live-query hook for the HUD.
- [ ] 4.3 DEV-only `globalThis.__energy` debug handle (grant/peek), gated by
      `import.meta.env.DEV`.

## 5. Gacha pull service (rewrite `apps/neurons-tw/src/lib/services/variant-gacha.ts`)

- [ ] 5.1 Remove the connectome `variantSlotUnlocked` subscriber +
      `registerVariantGachaSubscriber` + `backfillUnlockedSlots` +
      `handleSlotUnlock`. Keep the `variantGachaEvents` emitter + `variantRolled`
      reveal event.
- [ ] 5.2 Add `pullVariant(familyId, resolveFamilyDisplayName)`:
      check balance ≥ `PULL_COST` + family not fully collected; inside one tx →
      `spendEnergy`, `familyAccrual.pullCount += 1`, roll rarity via
      `rollRarityWithP0Pity`, resolve the `(family, rarity)` catalog target, if owned
      `copies += 1` else persist new row (stamp provenance: `bornAtISO`, `pullCount`
      as `apAtUnlock`, `wasRedemption: false` for pulls, `streakAtMint`); emit
      `variantRolled` post-commit. Returns a result (`{ rarity, isDupe, variant }`).
- [ ] 5.3 `isFamilyFullyCollected(familyId)` + `pullableState(familyId)` helpers
      (balance, cost, complete, p0Owned) for the UI.
- [ ] 5.4 Achievement hook: keep the `buildAchievementStats` → `triggerAchievementCheck`
      pre/post pattern around a successful pull (variant/fortune categories).
- [ ] 5.5 Update DEV `__variantGacha` debug handle: replace `forceUnlock` with
      `forcePull`/`grantEnergy`.

## 6. Connectome decoupling (`apps/neurons-tw/src/lib/services/connectome.ts` + `connectome/`)

- [ ] 6.1 `recordCorrectAnswer`: drop `slotsCrossedByIncrement` usage + the
      `variantSlotUnlocked` push; **add** `neuralEnergyEarned += CORRECT_ANSWER_ENERGY`
      inside the existing tx (add `db.meta` is already in the tx tables). Keep AP++,
      synapse co-fire, streak, mastery, achievements.
- [ ] 6.2 Remove `connectome.variantSlotUnlocked` from `ConnectomeEventMap` /
      `PendingEvent`; remove `slotsCrossedByIncrement` + `nextSlotThreshold` +
      `AP_THRESHOLDS` from `connectome/ap-counter.ts` (grep all importers — connectome
      page, collection view, tests).
- [ ] 6.3 `resetConnectomeForDebug`: also reset `pullCount` (keep `unlockedSlots`
      clear) and currency for a clean debug reset.

## 7. Reading-timer faucet (`apps/neurons-tw/src/lib/services/reading-timer.ts`)

- [ ] 7.1 In `fireMinuteSideEffects`, add `awardEnergy(READING_MINUTE_ENERGY)` to the
      `Promise.all` (alongside `incrementTotalStudyMinutes` + DMN subscriber).

## 8. Sync (`apps/neurons-tw/src/lib/sync/`)

- [ ] 8.1 `tables.ts` `neuronVariantsAdapter.apply`: on existing row keep identity +
      `copies = max(local.copies ?? 1, incoming.copies ?? 1)`, earliest `rolledAt`,
      preserve provenance. Inline doc: MAX-merge carve-out, do not LWW. (Mirror the
      everWrong/dmnEventLog discipline.)
- [ ] 8.2 `tables.ts` `familyAccrualAdapter`: add `pullCount` to the MAX-merge fields.
- [ ] 8.3 `tables.ts`: add `neuralEnergyEarned` + `neuralEnergySpent` to
      `SYNCED_META_KEYS`; `backfill/counters.ts`: add both to the MAX-merge counter
      allowlist.
- [ ] 8.4 `r2/bundles.ts`: bump `SCHEMA_VERSION` 8 → 9; add a v9 history comment
      (gacha rework: copies field + pullCount + currency counters; additive +
      reader-tolerant). No new adapter (all ride existing tables/meta).

## 9. UI

- [ ] 9.1 `routes/CollectionPage.tsx`: render **6** slots/family (0–5); uncollected
      silhouette shows the slot's **rarity** label (not AP threshold); add a
      neural-energy **balance HUD** (header) + a per-family **pull** button (cost
      label; disabled when balance < cost or family fully collected, with
      `全部收集` state); show `× N` dupe badge when `copies > 1`.
- [ ] 9.2 `components/VariantUnlockModal.tsx` + `VariantUnlockToast` (or current
      reveal): drive from the pull result (`isDupe` → "重複（碎片留待融合）" copy);
      keep motion-library timings; add P0 reveal accent. Remove `Slot N` / `保底`
      slot-floor semantics; `保底` chip iff P0-via-pity.
- [ ] 9.3 Connectome homepage family card: drop the next-slot-threshold line; keep AP
      + change the `🧬 X / 5` chip to `🧬 X / 6`.
- [ ] 9.4 Wire `App.tsx`: remove `registerVariantGachaSubscriber` +
      `backfillAchievementsFromCurrentStats`'s old slot dependency if any; ensure no
      dangling import of the removed subscriber.
- [ ] 9.5 Leaderboard: `deriveBadgesCsvFromDexie` / `deriveAchievementSnapshot` — no
      change needed for variant rarity (badges are achievement tiers P1–P4); **do
      not** emit any `P0` token into `badges_csv` (stay within Worker regex).

## 10. Tests (`apps/neurons-tw/src/__tests__/`)

- [ ] 10.1 `gacha-pull.test.ts`: `rollRarityWithP0Pity` distribution + P0 pity ramp
      (P0 prob at pull 1 ≈ 0.7%, at pull 60 ≈ 1.0) + P0 excluded when owned; pull
      spends cost, increments pullCount, dupe → copies++, new → row persisted; pull
      blocked at balance < cost / family complete.
- [ ] 10.2 `currency.test.ts`: earn/spend/balance derivation; balance never negative.
- [ ] 10.3 `db-v9-to-v10-migration.test.ts` (from 3.3).
- [ ] 10.4 `variant-copies-merge.test.ts`: neuronVariants adapter copies MAX-merge +
      identity immutability round-trip; familyAccrual pullCount MAX-merge.
- [ ] 10.5 Update/remove existing tests referencing the removed slot-unlock path
      (`variant-provenance.test.ts` mint trigger, any `backfillUnlockedSlots` test,
      AP_THRESHOLDS references).

## 11. Spec deltas (in this change's `specs/`)

- [ ] 11.1 `neuron-variant-gacha/spec.md` delta (REMOVED slot-trigger/floor/backfill;
      MODIFIED weights/catalog/persistence/sprites/reveal/provenance-sync/chip;
      ADDED currency/pull/P0-pity/full-reset).
- [ ] 11.2 `connectome-collection/spec.md` delta (REMOVED slot-unlock-event req;
      MODIFIED AP req + homepage card req).
- [ ] 11.3 `neurons-variant-collection-view/spec.md` delta (MODIFIED 5→6 slots +
      silhouette-shows-rarity + card; ADDED currency HUD + pull control).

## 12. Validate + verify

- [ ] 12.1 `openspec validate rework-neurons-collection-gacha --strict` clean.
- [ ] 12.2 `pnpm --filter @study-rpg/content-neurons-tw build` (catalog assertion).
- [ ] 12.3 `pnpm -r typecheck` clean.
- [ ] 12.4 `pnpm --filter @study-rpg/neurons-tw test` green (incl. new + the v10
      fixture; `pnpm lint:dexie-fixtures` passes).
- [ ] 12.5 `/verify` — Chrome MCP smoke: fresh boot (full reset applied), earn energy
      (answer + reading), pull (new + dupe), P0 reveal, `/collection` 6-slot grid +
      HUD, console clean; `/simplify`.

## 13. Deferred follow-ups (NOT in this change — record as separate changes)

- [ ] P0 leaderboard/achievement cross-cut (`P[1-4]→P[0-4]` Worker regex + D1 +
      achievement validator) — shared Worker, cross-track.
- [ ] Currency OE theming (`/oe`).
- [ ] Phase 3 dupe fusion / Phase 4 expedition rewards / Phase 5 flavor / Phase 6 art.
