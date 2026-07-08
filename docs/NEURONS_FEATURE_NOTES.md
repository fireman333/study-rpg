# Neurons feature notes

> `apps/neurons-tw` 各 feature 的實作摘要 / key handles。原本散在 project `CLAUDE.md`，2026-06-09 為精簡 always-on context 搬到這裡（仍 in-repo、git-tracked）。每段末尾 `Full change reference` 指向 openspec 完整 proposal/design/specs/tasks（部分路徑已 archive，見 CLAUDE.md「Neurons feature notes」block 的正確 archive 連結）。
>
> **⚠️ Sync carve-out 警語（monotonic-OR / monotonic-union / 「不可改 LWW」）是 load-bearing — 動 sync adapter 前必讀本檔對應段落。**

## Neurons achievement system (M_3rd, 2026-05-25)

`apps/neurons-tw` ships a milestone-recognition system borrowed from 二階 `achievement-system` pattern: 7 categories × 4 tiers = 30 catalog entries. Borrowed per `neurons-mode` Req 5 (independent capability spec; no modification of 二階 source).

**Category set** (string union locally declared, NOT imported from `@study-rpg/core`'s 二階-shaped `AchievementCategory`): `study | quiz | variant | synapse | mastery | fortune | hidden`. Semantic mappings: 二階 recruit → variant; hospital → synapse; subject → mastery.

**Catalog** = `packages/content-neurons-tw/src/achievements.ts` (30 entries: 4 study + 5 quiz + 5 variant + 4 synapse + 4 mastery + 4 fortune + 4 hidden). Tiers `P1 鑽石 / P2 金 / P3 銀 / P4 銅` (mirror PSN Trophy convention). Build-time validator at `packages/content-neurons-tw/src/achievement-validator.ts` enforces: (a) every P1 entry MUST declare `composite: true`, (b) non-P1 entries MUST NOT declare composite, (c) all required fields populated, (d) ids unique, (e) every category has ≥ 1 entry. Smoke covered by `scripts/verify-validator.ts` (6 fixtures pass).

**Types declared LOCALLY** at `packages/content-neurons-tw/src/achievement-types.ts` — not in `@study-rpg/core`. Reasoning: core's `AchievementCategory` is a strict 7-literal union containing 二階 字面值 (`'recruit'|'hospital'|'subject'`); `AchievementStats` references `SubjectId` + `totalDoctorsRecruited` + `currentHospitalTier`; `AchievementReward` includes `'cosmetic'`. Widening core to fit both 二階 + neurons would invasively break published `@study-rpg/core@0.4.x` API contract. Neurons uses `NeuronsAchievement` / `NeuronsAchievementStats` / `NeuronsAchievementReward` / `NeuronsAchievementCategory` and re-implements the 5-line `checkAchievementUnlocks` diff function locally at `apps/neurons-tw/src/lib/services/achievement.ts`. Apply-phase decision in `add-neurons-achievements/tasks.md` §1.2.

**Reward channels = 2** (TS union locked): `{kind:'leaderboard'}` (implicit — every unlock contributes to `badges_csv`) + `{kind:'title';title:string}` (appends to `leaderboardProfile.unlockedTitles`, selectable via `TitleSelector` in `LeaderboardSettingsControls`). `cosmetic` / `equipment` / `ticket` / `currency` are TypeScript-rejected at catalog declaration site.

**Persistence** (Dexie v5): new `achievements` table (PK `id`, indexed `unlockedAt`). v4 → v5 is additive. Extended `LeaderboardProfileRow` with `unlockedTitles?: string[]` + `selectedTitle?: string | null` (no schema migration; Dexie tolerates undefined for existing rows).

**Streak counter** persisted in `meta` table: `meta['currentQuizCorrectStreak']` (LWW, +1 correct / reset 0 wrong) + `meta['maxQuizCorrectStreak']` (MAX-merge). Co-commits with `recordCorrectAnswer` / `recordIncorrectAnswer` Dexie transaction.

**Trigger hooks** (3 sites — `apps/neurons-tw/src/lib/services/`):
- `connectome.ts` `recordCorrectAnswer` collapse-point — captures `prevStats` pre-tx, calls `triggerAchievementCheck` post-commit
- `connectome.ts` `recordIncorrectAnswer` — streak reset + post-commit check
- `variant-gacha.ts` `handleSlotUnlock` — capture pre-state if non-silent; trigger check after persist

Each hook wrapped in try/catch (`[achievement]` channel) so failure doesn't break originating game action. `study` category predicates evaluate against `totalStudyMinutes: 0` placeholder (reading-timer not yet wired in neurons-tw); catalog ships ready for when timer ships.

**Backfill** at app boot via `backfillAchievementsFromCurrentStats()` in `App.tsx` `useEffect`: builds stats from Dexie, finds predicates already true, `bulkPut` missing rows with `notificationShown: true`, dispatches NO rewards / NO toasts / NO modals. Idempotent. Same function shape ready for future `onPullComplete` sync hook (post `add-neurons-deploy`).

**UI** components: `BadgeSprite` (placeholder SVG + emoji glyph + tier-color ring — atlas swap deferred to follow-up `generate-neurons-achievement-atlases`), `AchievementCard`, `AchievementsPage` at `/achievements` (sub-tabs 「全部 / 已解鎖」 + category/tier filter dropdowns + strict hidden filtering), `AchievementToastHost` (wraps motion library `<Toast>` + `TOAST_AUTO_DISMISS_MS`), `AchievementUnlockModal` (wraps motion library `<AchievementUnlockModal>` primitive). Toast/modal queue singleton at `lib/achievement-toast-queue.ts`.

**Leaderboard integration**: `deriveAchievementSnapshot(unlocked)` + `deriveBadgesCsvFromDexie()` in `lib/services/neurons-leaderboard.ts` produce max-tier-per-category CSV with hidden category excluded (fits Worker regex `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` since 7 categories − 1 hidden = 6 max entries). `LeaderboardPage` renders inline 20px badges via `NicknameWithBadges` helper. `D1 leaderboard_neurons.badges_csv` column was reserved by `add-neurons-leaderboard` Req 11 — **no D1 migration** needed. Title display on leaderboard rows deferred to a separate follow-up (would need Worker schema addition for `selected_title`).

**Smoke results** (2026-05-25 Chrome MCP end-to-end): boot backfill populated `mastery-first-novice` row silently; 10× +5 答對 on 藥理學 fired `variant-first-pull` toast + `quiz-streak-10` queued + `hidden-first-day-blitz` queued; `/achievements` page rendered 4 unlocked + 26 locked silhouettes + 3 hidden-locked invisible. Console clean (only pre-existing React Router future warnings).

**Deferred follow-ups**:
- Atlas asset generation (60–90 min codex CLI batch × 2 atlases) → separate `generate-neurons-achievement-atlases` change
- Title display on leaderboard rows (needs Worker `selected_title` D1 column + KV)
- `study` category active triggers (needs reading-timer follow-up)

Full change reference: `openspec/changes/archive/2026-05-25-add-neurons-achievements/`.

## DMN fate cards (M_3rd ext, 2026-05-27)

`apps/neurons-tw` ships a mixed-trigger (time-axis + behavior-axis) fate-card collection system themed on **Default Mode Network** — the brain's resting-state network that produces "spontaneous insight" while the player rests. Catalog = 20 cards × 4-tier rarity (P1 鑽石 × 2 / P2 金 × 4 / P3 銀 × 6 / P4 銅 × 8) with weights 2/10/30/58. Each card simultaneously triggers a one-time event + enters the permanent collection (Pokédex-style closed cap).

Five event kinds (each ≥ 4 cards in catalog — build-time validator enforces ≥ 3 minimum):
- `family-buff`: random family AP +2/correct for 1 hour
- `variant-rate-up`: next variant slot unlock uses boosted weights 20/30/30/15/5 (single-consume)
- `quick-review-batch`: surface 5 SRS-due questions (placeholder toast until SRS pipeline ships)
- `streak-shield`: one-use immunity to next streak break
- `hidden-reveal`: silhouette-hint next undrawn P1 card on `/dmn` page

Trigger axes:
- **Time axis** (cap 2 draws/day): +1 draw per 30 min accrued reading time. **Currently inactive** — `ReadingTimerSubscriber` interface is wired but no timer service publishes to it; will activate when `polish-neurons-pre-ship` ships the reading-timer
- **Behavior axis** (cap 3 draws/day): listens to `connectome.variantSlotUnlocked` / `connectome.synapseFormed` / `connectome.synapseStrengthened` — each grants +1 bonus draw. (Spec amendment 2026-05-27 dropped `streak.dayIncreased` because neurons-tw has no daily-open streak service, and dropped `actionPotentialThresholdCrossed` because AP thresholds = variant slot thresholds → redundant.)

Catalog + types + validator: `packages/content-neurons-tw/src/{dmn-types,dmn-cards,dmn-card-validator}.ts`. Smoke fixture: `scripts/verify-dmn-validator.ts` (7 cases pass). Catalog uses well-established DMN neuroscience anchors (mPFC / PCC / precuneus / angular gyrus / hippocampal sharp-wave ripples / REM consolidation per Buckner & DiNicola 2019, Raichle 2015).

**Critical sync semantics — `dmnEventLog` uses MONOTONIC-UNION merge, NOT LWW.** `apps/neurons-tw/src/lib/sync/tables.ts` `dmnEventLogAdapter.apply()` carries the carve-out: rows present on either side stay in the union; both sides converge to the same set; earlier `dispatchedAt` wins as the provenance instant. This neutralizes the "fresh-state device pulls bundle and re-triggers all dispatched events" failure mode. Mirrors 二階 `everWrong` monotonic-OR discipline. **DO NOT replace with LWW** — locked by Vitest `dmn-event-idempotency.test.ts`.

**R2 bundle schema bump v1 → v2 + reader tolerance.** `apps/neurons-tw/src/lib/sync/r2/bundles.ts`:
- `SCHEMA_VERSION` 1 → 2 (additive: adds 3 new adapter keys `dmnCards` / `dmnEventLog` / `dmnActiveBuffs` + 8 new meta keys to the allowlist)
- `validateBundleMeta` now `console.info(...)` + continues parse on `schema_version > SCHEMA_VERSION` (was: throw `unsupported_schema_version`). Defends `< 1` still. This is the **forward-compat tolerance pattern** that lets v1 clients pull v2 bundles without dying — unknown adapter keys silently drop because `applyBundleSnapshot` iterates only locally-registered adapters
- v2 client reading v1 bundle: `dmn-*` fields absent → preserve-on-omission (empty local tables stay empty; non-empty local tables not overwritten with empty incoming)

Worker is bundle-opaque (pure presigned-URL transport) — no Worker code change needed for the v2 bump.

Dexie versions claimed in flight (neurons-tw): v6 = `add-neurons-dmn-fate-card` (adds `dmnCards` / `dmnEventLog` / `dmnActiveBuffs` tables).

Trigger detector + draw orchestrator + event dispatcher + 3 consumer hooks (family-buff in `connectome.recordCorrectAnswer`, variant-rate-up in `variant-gacha`, streak-shield in `streak.resetCurrentStreak`) all in `apps/neurons-tw/src/lib/services/dmn-*.ts`. UI: `DmnDrawButton` (top nav), `DmnDrawModal` (modal + reveal inline), `DmnCollectionPage` (`/dmn` route, responsive grid), `DmnQuickReviewToast` (placeholder for quick-review-batch event).

Test coverage: `apps/neurons-tw/src/__tests__/{db-v6-migration,dmn-draw-mechanics,dmn-event-idempotency,dmn-bundle-cross-version,dmn-trigger-counters}.test.ts` — 27 Vitest tests covering v6 migration, draw orchestrator, event log idempotency + monotonic-union, schema_version forward-compat, daily cap enforcement. Run via `pnpm --filter @study-rpg/neurons-tw test` (vitest infra newly bootstrapped in this change, mirroring 二階).

Sprite assets ship as `dmn:card:<cardId>` × 20 + `dmn:card-back` × 1 placeholders (1×1 transparent PNG) — real pixel-art deferred to follow-up `generate-dmn-card-artworks` (codex CLI batch, ~1 hr; mirror `generate-neurons-sprites` pattern).

Full change reference: `openspec/changes/add-neurons-dmn-fate-card/` (proposal / design / specs / tasks).

## Neurons wrong-answer list (M_3rd ext, 2026-06-01)

`apps/neurons-tw` ships a 「錯題」 review experience on `/bookmarks`, mirroring 二階 `wrong-answer-list` but built fresh because neurons had **no per-question result tracking** before this change (`recordCorrectAnswer`/`recordIncorrectAnswer` only ever took `familyId`). Capability spec: [`openspec/specs/neurons-wrong-answer-list/spec.md`](openspec/specs/neurons-wrong-answer-list/spec.md).

`/bookmarks` is now a three-tab container: **手動收藏** (existing ⭐ list, default) / **目前未答對** (`lastResult === 'wrong'`) / **歷史曾錯** (`everWrong === true`, never leaves). The two wrong-answer tabs are live derived views of a new `questionHistory` Dexie store — no separate store, no grace toast (permanent error library by design). Wrong-answer rows are display-only (no inline actions). A single shared filter bar (科目 family + **年份** year + ✨/🤔 標記) applies across all three tabs; exam year is parsed from the question id prefix (`106-1-醫學一-解剖學-Q1` → `106`, helper `lib/wrong-answer-filter.ts`).

Key handles:
- New `questionHistory` Dexie store (**v9**, additive): `{ questionId, family, lastResult, everWrong, lastAnsweredAt, updatedAt }`. `everWrong` is NOT indexed (IndexedDB can't index booleans) — the 歷史曾錯 tab filters in JS off a full `toArray()`. v8→v9 upgrade fixture at `apps/neurons-tw/src/__tests__/db-v8-to-v9-migration.test.ts`.
- Recording: `lib/services/question-history.ts` `recordQuestionResult(questionId, family, isCorrect)` (monotonic-OR `everWrong`) + single `useQuestionHistory()` live-query hook (BookmarksPage derives both wrong views from one subscription). Wired in `QuizModal.handlePick` after the existing record calls, best-effort try/catch (channel `[question-history]`) so it never breaks the answer flow. **neurons has only one answer entry point (QuizModal)** — any future answer mode MUST also call `recordQuestionResult`.
- **Critical sync semantics — `questionHistory` uses MONOTONIC-OR merge for `everWrong`, NOT LWW.** `apps/neurons-tw/src/lib/sync/tables.ts` `questionHistoryAdapter` resolves `everWrong = (local?.everWrong ?? false) || incoming.everWrong`; `lastResult`/`family`/`lastAnsweredAt` are LWW on the greater `lastAnsweredAt`. Mirrors 二階 `everWrong` + neurons `dmnEventLog` discipline. **DO NOT replace with LWW** — locked by `apps/neurons-tw/src/__tests__/question-history-merge.test.ts`.
- R2 bundle `SCHEMA_VERSION` bumped **4 → 5** (`lib/sync/r2/bundles.ts`); additive + reader tolerance (v4 clients drop the unknown key, v9 clients reading v4 bundles preserve local). Worker is bundle-opaque — no Worker change.
- Existing players: **no backfill, no banner** — the error library accrues from upgrade onward.

Full change reference: `openspec/changes/archive/2026-06-01-add-neurons-wrong-questions-subtab/` (proposal / design / specs / tasks).

## Neurons context-driven variant art (M_3rd ext, 2026-06-02)

`apps/neurons-tw` turns each collected variant's **birth-context provenance** (from `add-neurons-variant-provenance`) into a glanceable **visual** layer — Pikmin Bloom step 3「帽子=出身」. Capability spec: [`openspec/specs/neurons-variant-context-art/spec.md`](openspec/specs/neurons-variant-context-art/spec.md) (new). The text birth-caption (`lib/variant-caption.ts`) is the sibling text channel; this is the visual channel.

**Background-watermark model (all context art renders BEHIND the neuron).** The neuron always paints on top at full opacity → never occluded, and there are no positioned foreground badges to align. This is a **design pivot (2026-06-02)** made during the live verify pass: earlier cuts (ornate foreground overlays, then iconographic corner badges + a top-left EEG glyph) crowded the soma and had alignment problems the owner rejected — "做成半透明背景圖，比較不會有對齊問題".

**Two channels, both pure-derived at render (zero new state):**
1. **Decor = 3 universal full-bleed neuro-field textures** composited as faint backdrops (`objectFit:cover`, opacity 0.11 single / 0.07 stacked) behind the neuron, chosen from `provenance`:
   - `decor:redemption` — action-potential **firing field** — `provenance.wasRedemption === true` (LTP 浴火重生)
   - `decor:milestone` — **myelinated-axon field** (nodes of Ranvier) — `streakAtMint >= MILESTONE_STREAK_THRESHOLD` (7, saltatory milestone)
   - `decor:elder` — antique **Cajal histology plate** — `provenance === undefined` (元老/傳承)
   救贖 + 里程碑 **stack**; 元老 is mutually exclusive (requires absent provenance).
2. **Brain-wave band** from the variant's birth **hour-of-day**: `brainwaveBand(rolledAt)` reads the hour in a **fixed Asia/Taipei tz** (rolledAt is absolute → cross-device deterministic) → circadian epoch's dominant EEG band: 00–06 **δ** / 06–12 **β** / 12–18 **α** / 18–24 **θ**. Every row gets a band (incl. 元老 — `rolledAt` always exists). Rendered as a colour-coded **δ/θ/α/β** Greek-letter corner watermark (`BAND_META[band].color`, opacity 0.75) — the card's **only colour accent**. NO full-cell colour wash (an earlier per-band wash made the grid look like a rainbow; owner flagged "不同顏色背景"). Band↔state mapping **OpenEvidence-grounded** (NEJM Brown 2010 `10.1056/NEJMra0808281`; Constant 2012 `10.1111/j.1460-9592.2012.03883.x`): δ deep-sleep / θ drowsy-REM / α relaxed / β alert.

Context art is orthogonal to the **rarity** channel (P1–P5 colour / chip / spin) — rarity uses colour, context uses neuro-field texture + band letter.

Key handles:
- Pure helper `apps/neurons-tw/src/lib/variant-decor.ts` → `variantContextArt(row): { decor: DecorKey[]; band: BandKey }` + `brainwaveBand(rolledAt)` + `BAND_META`. Mirror of `variant-caption.ts`. Unit-tested (`__tests__/variant-decor.test.ts`, 16 cases: decor mapping + stack + elder + birth-hour→band incl. 4 boundaries + elder-gets-a-band).
- Shared composer `apps/neurons-tw/src/components/VariantSprite.tsx` (`{ row, size, alt, children }`): `position:relative; overflow:hidden` wrap → faint decor field(s) → band letter → base sprite **on top**. Optional `children` lets a caller pass an animated base (modal hero evolve sheet / alive idle img) so reveal animation is preserved. **Adding any new collected-variant render site MUST go through `VariantSprite`.**
- 3 render sites wired: `routes/CollectionPage.tsx` `VariantSlotCard` (dex card, size 64) + family-`<section>` header **mini representative** (size 28 — decision B 2026-06-02, since the representative isn't shown on the connectome homepage; family node there uses the `subject:` icon) + `components/VariantUnlockModal.tsx` (mint reveal, size 128).
- Theme reg: `packages/theme-pixel-neurons/sprites/decor/{redemption,milestone,elder}.png` (384×384 full-bleed neuro-field textures, 16-color transparent, Gemini-gen + chroma-key/quantize) via `sprites/decor/*.png` glob in `src/sprites.ts` (`DECOR_KEYS`, `?? TRANSPARENT_PIXEL` → missing asset = no field, never a broken image).

**Zero schema / sync change.** Decor + band are a pure function of the already-synced `provenance` + `rolledAt` — no Dexie `.version()` bump, no R2 bundle `SCHEMA_VERSION` bump, no new adapter. A second device computes identical art. (No Dexie change → no upgrade-fixture-lint trigger.)

Deferred follow-ups: per-NT-branch flavoured decor (4×3=12 assets); sparser milestone myelin field (currently ~93% coverage → soft gold haze at low opacity). Ship universal first, revisit with telemetry.

Full change reference: `openspec/changes/context-driven-variant-art/` (proposal / design / specs / tasks).

## Neurons acceleration system (M_3rd ext, 2026-06-04)

`apps/neurons-tw` merges the two parked progression lanes (P2 DMN→supplies + P3 equipment) into one **加速系統**: a single speed·energy boost layer with **two persistence forms** — transient **consumables** (backpack, manual-activate) vs durable **permanent equipment/companions**. Capability spec: [`openspec/specs/neurons-acceleration-system/spec.md`](openspec/specs/neurons-acceleration-system/spec.md) (new). Pivot rationale in [`openspec/decisions/2026-06-04-neurons-progression-systems-roadmap.md`](openspec/decisions/2026-06-04-neurons-progression-systems-roadmap.md).

**Boost model — additive `1 + Σ`, hard-capped.** `apps/neurons-tw/src/lib/services/acceleration.ts`:
- `energyAccel(familyId)` = `min(ENERGY_ACCEL_CAP=2.5, 1 + Σ active-energy-consumable bonus + Σ owned-energy-equipment bonus)`. Wired into the correct-answer maze-energy faucet at `connectome.ts` (**replaced** the standalone `getActiveFamilyBuffMultiplier`; family-buff is now a `+1.0` energy bonus inside the pool ⇒ the prior ×2). `family-buff` is family-scoped; `bolus` is global.
- `speedAccel()` = `min(SPEED_ACCEL_CAP=2.0, 1 + Σ surge + Σ owned-speed-equipment)`. Composed into `maze/economy.ts` `accrueMazeEnergy` (the exploration-speed lane) alongside the existing `mazeSpeedMultiplier(count)`. `speedAccel()`/`energyAccel()` return 1.0 with nothing active → no-op for un-accelerated saves.
- Caps are dogfood-tunable game-loop numbers (NOT OE-anchored) — the explicit guard against the positive-feedback runaway (collection-count × streak × mastery × acceleration). Consumables are time-limited/one-shot, permanents few + capped ⇒ peak is bounded.

**DMN draw is the single acquisition channel for both forms.** `dmn-fate-card.ts` `drawDmnCard(rng = Math.random)` rolls `EQUIPMENT_DRAW_RATE` (≈5%) vs the unowned equipment pool → on hit awards a rarity-weighted (P1–P5) permanent to the `equipment` table; else deposits a consumable to the `inventory` backpack (NO auto-fire) + the `dmnCards` dex + a `dmnEventLog` provenance row. Falls through to the other pool if one is exhausted; null only when BOTH are fully owned. `rng` is injectable for deterministic tests.

**Backpack model (NO auto-fire on draw).** `inventory.ts`: `depositConsumable` (draw), `activateConsumable` (decrement-then-apply via `applyConsumableEffect`), `pruneExpiredBuffs`. Stock rows are **kept at count 0, never deleted** (per-kind LWW continuity). `dmn-event-dispatcher.ts` was refactored: `dispatchDmnEvent` (draw-time, cardId-idempotent) → **`applyConsumableEffect(kind, sourceCardId)`** (activation applier, NO cardId idempotency — activation is gated by the stock decrement). `getActiveFamilyBuffMultiplier` **removed** (superseded by `energyAccel`).

**`streak-shield` removed entirely (integrity).** The only anti-learning crutch — full footprint gone (`DmnEventKind` union, catalog ×4, dispatcher case, `consumeStreakShield`, `streak.ts` consume site, `SYNCED_META_KEYS` `dmnStreakShieldAvailable`, UI copy, sprite ids, idempotency test). Players mid-armed lose it silently (no refund). The daily streak multiplier + SRS self-report buttons stay (honest mechanics).

**Catalogs** (`packages/content-neurons-tw/src/`):
- DMN consumable dex recomputed **20 → 22** (`dmn-cards.ts`): removed 4 streak-shield, added 3 `surge` (NE/DA phasic gain → speed) + 3 `bolus` (lactate shuttle → energy). Distribution P1×2 / P2×5 / P3×7 / P4×8; tier weights unchanged 2/10/30/58. Validator `dmn-card-validator.ts` size 22 + the 6-kind set. `family-buff` reframed (AP→energy copy).
- Equipment catalog `equipment-catalog.ts` — **12 items P1–P5 × 2 lanes** (6 myelin/speed + 6 pump/metabolic-energy). Owned-once, no upgrade ladder (v1). Rarity-scaled bonus `EQUIPMENT_RARITY_BONUS` (P1 +0.30 / P2 +0.18 / P3 +0.10 / P4 +0.04 / P5 +0.01). `equipment-validator.ts`: ≥10 items, ≥2/tier, rarity-matched bonus. OE-anchored (oligodendrocyte myelin = durable speed; Na⁺/K⁺-ATPase pump = endurance NOT speed). `verify:equipment` 6/6.

**Schema (additive).** Dexie **v16** (`db.ts`): new `inventory` (`kind` PK) + `equipment` (`equipmentId` PK) tables; NO pk change; no backfill (grandfather from v16). v15→v16 fixture at `__tests__/db-v15-to-v16-migration.test.ts`. R2 neurons bundle `SCHEMA_VERSION` **15 → 16** (`sync/r2/bundles.ts`): two new adapters in `sync/tables.ts` — **`inventoryAdapter` (per-kind LWW on `updatedAt`)** + **`equipmentAdapter` (UNION by equipmentId, MONOTONIC on presence — owning never un-owns; keeps earliest `obtainedAt`)**. Additive + reader-tolerant (v15 clients drop the unknown keys; v16 reading v15 preserves local). Worker is bundle-opaque — no Worker change.

**UI** (`/dmn` route, `DmnCollectionPage`): `BackpackPanel` (stock list + activate + active-buff timers) above the consumable dex; `EquipmentDexPanel` (P1–P5 owned/silhouette grid) below; `DmnDrawModal` reveal branches consumable (→ "已放入背包") vs equipment (→ "永久裝備 GET"). Top-nav unchanged.

**Sprites: placeholders this change.** `theme-pixel-neurons/src/sprites.ts` registers 12 `equipment:<id>` keys (new `../sprites/equipment/*.png` glob) + refreshed `DMN_CARD_IDS` to the current 22; all fall back to `TRANSPARENT_PIXEL` (no real art yet). Real art (~14: 12 equipment + surge/bolus card) is a deferred follow-up `generate-acceleration-sprites` (Gemini/codex).

Test coverage: `apps/neurons-tw/src/__tests__/{acceleration,inventory,db-v15-to-v16-migration,acceleration-bundle}.test.ts` + updated `{dmn-draw-mechanics,dmn-event-idempotency,dmn-event-realign}.test.ts` (342 neurons tests green). `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` + `pnpm lint:dexie-fixtures` clean.

Full change reference: `openspec/changes/add-neurons-acceleration-system/` (proposal / design / specs / tasks).

## Neurons living companions (M_3rd ext, 2026-06-04)

`apps/neurons-tw` gives the acceleration-system's **living-cell glial companions** an on-screen presence — the "夥伴" that was previously only a dex card + passive number now **marches with the 神經元遠征隊 expedition squad** in the `MazeExpedition` animation band. Owner decision (live verify): **NOT on the brain-map** — "夥伴不放 brain-map，出征動畫才顯示". Capability spec: [`openspec/specs/neurons-living-companion/spec.md`](openspec/specs/neurons-living-companion/spec.md) (new) + MODIFIED `neurons-maze-expedition`. Pure presentational follow-on to `add-neurons-acceleration-system`.

- **Companion subset = catalog flag `companion: true`** on `EquipmentDef` (`equipment-types.ts`), set on the **2 actual cells only** — `eq-oligodendrocyte-companion-p3` + `eq-astrocyte-glycogen-p3` (`equipment-catalog.ts`). Structural/molecular items (myelin wrap, node of Ranvier, Na⁺/K⁺ pump, lactate, glucose, mitochondria…) stay dex-only passive and do NOT march. Helpers `livingCompanionDefs()` / `livingCompanions(ownedIds)` (rarest-first) exported from content. The flag is orthogonal to lane/rarity/bonus — the equipment validator + dex + acceleration passive are unaffected.
- **Render = expedition-band marchers**: `components/MazeExpedition.tsx` `useOwnedCompanions()` (liveQuery `db.equipment` → `livingCompanions`) appends companions to the band's `members` parade (at the back; index continues for coherent depth-stagger). They inherit the band's `exp-bob` + paused/hidden + reduced-motion treatment — no separate component, keyframe, or gate. Cyan-glia glow distinguishes them from the white-aura variant marchers. Rendered at `COMPANION_MARCHER_SCALE` (= 0.6, tunable) × the squad marcher size — visibly smaller tagalongs. Appears in BOTH band contexts (homepage reading band + compact QuizModal 出征 band). **No brain-map SVG overlay.**
- **Dedicated marcher sprites** (`generate-companion-sprites`, 2026-06-04): real cute glial-cell art at `packages/theme-pixel-neurons/sprites/companion/{eq-oligodendrocyte-companion-p3,eq-astrocyte-glycogen-p3}.png` (384×384 transparent 16-color, Gemini-gen + magick). `sprites.ts` adds a `companion/*.png` glob → `companion:<id>` keys, **spread present-files-only** into `SPRITE_MAP` (NO hardcoded TRANSPARENT_PIXEL keylist) so a missing PNG leaves the key unresolved and `companionSpriteUrl()`'s `companion:<id> ?? equipment:<id> ?? variant:default` fallback still fires. Single-frame (band is CSS-`exp-bob`, not per-frame) — the earlier `generate-companion-animation-frames` idea is closed.
- **Zero schema/sync change**: derives entirely from the already-synced `equipment` table — no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no new adapter, no `SYNCED_META_KEYS`. Every device computes identical companions. Tests: `apps/neurons-tw/src/__tests__/living-companion.test.ts` (9 — catalog-subset predicate + db→ids→marcher data path; 351 neurons tests green).

Full change reference: `openspec/changes/add-neurons-living-companion-render/` (proposal / design / specs / tasks).

## Single-subject rescue (單科考前救急, M_3rd ext, 2026-07-08)

Lock ONE subject + an exam date + a daily-minutes budget → each day builds a highest-ROI question queue and drills you with **pre-reveal confidence capture**. Full-screen overlay (`components/RescueScene.tsx`, portaled to `<body>` like `SpeedReviewPage` to escape the AnimatedRoutes transform). Capability spec: [`openspec/specs/neurons-single-subject-rescue/spec.md`](../openspec/specs/neurons-single-subject-rescue/spec.md) (new) + MODIFIED `neurons-homepage` (header entry + card 變身 chip) & `neurons-weakness-radar` (targeted-drill absorption).

- **Zero-schema, device-local (MVP)** ⚠️ (**動 sync 前必讀**): the rescue **plan / pre-reveal confidence / stop-loss overrides / telemetry** all live in `localStorage` (`neurons:rescue:v1`, via `lib/services/rescue/rescue-store.ts`) — **NO Dexie bump, NO R2 `SCHEMA_VERSION`, NO `SYNCED_META_KEYS`**. Answering still flows through the normal `recordQuestionResult` + SRS path (so `questionHistory` syncs), so switching devices only loses the "plan shell". The follow-up change **`add-neurons-rescue-r2-sync`** (designed, not yet applied) moves plan+confidence+overrides to R2 (SV 26→27, no Dexie bump, matcher-based `SYNCED_META_KEYS`) — telemetry stays device-local.
- **Selection core (pure, unit-tested)** in `lib/services/rescue/`: `rescue-priority.ts` (`priority = Yield × Movability × Confidence × typeCoefficient ÷ EstTime`; ×1.5 hi-confidence-wrong is the SOLE `Confidence` home; Movability 5 bands, already-mastered = 0 → triage-dropped), `rescue-queue.ts` (yield resolver / rank+triage+stop-loss / core vs 加練 quota / 20-65-15 day mix), `rescue-score.ts` (recency-decay RescueScore, NOT familyMastery), `rescue-stoploss.ts`, `rescue-reread.ts`, `rescue-lifecycle.ts` (calendar-day D; D0=exam day, D1=eve; auto-archive at `examDate+1`). Orchestration + the blitz sampler / 戰情圖 / quick-scan pool live in `rescue-session.ts`.
- **QuizModal rescue submit mode** (`rescueSubmit` prop): option pick only STAGES; footer 「確定・有把握」/「確定・猜的」 submits AND records pre-reveal confidence device-local, then runs the SAME `handlePick` scoring path. ⚠️ rescue answers **skip `recordPrescriptionAnswer` / `recordCramRescueAnswer`** (would write synced prescription meta — the device-local invariant) but **DO** run SRS.
- **戰情圖 = 3 labelled sections** (🔴 先攻高頻弱點 / 🟡 待鞏固 / ⚪ 尚未診斷) with count badges + `+N` overflow (no silent truncation); red sorted hi-confidence-wrong ‼ first. Homepage: always-on header 「考前救急」 entry (NOT pressure-gated) + active-plan card renders a rescue chip in place of the WeaknessIndicator (its one-tap 特訓 is absorbed into the rescue queue); reverts on archive/abandon.
- Tests: `apps/neurons-tw/src/__tests__/rescue-{priority,score,engine,queue,store,session}.test.ts` (75 rescue tests; 1040 neurons tests green). `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` clean; verified end-to-end in-browser (setup → D-scaled blitz → two-button pre-reveal → daily queue → card 變身 → D0 quick-scan → abandon+revert; zero schema bump, no cram/prescription meta written).

Full change reference: `openspec/changes/add-neurons-single-subject-rescue/` (proposal / design / specs / tasks).

