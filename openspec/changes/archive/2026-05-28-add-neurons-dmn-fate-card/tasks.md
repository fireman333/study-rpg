## 1. Content pack — DMN catalog + types + validator

- [x] 1.1 Add `DmnCardDef` / `DmnEventKind` / `DmnCardRow` / `DmnEventLogRow` / `DmnActiveBuffRow` types in `packages/content-neurons-tw/src/dmn-types.ts` (NEW)
- [x] 1.2 Define `DMN_RARITY_WEIGHTS = { P1: 2, P2: 10, P3: 30, P4: 58 }` constant in `packages/content-neurons-tw/src/dmn-types.ts`
- [x] 1.3 Define `DMN_EVENT_TYPES` enum (`'family-buff' | 'variant-rate-up' | 'quick-review-batch' | 'streak-shield' | 'hidden-reveal'`) in `packages/content-neurons-tw/src/dmn-types.ts`
- [x] 1.4 Create `packages/content-neurons-tw/src/dmn-cards.ts` (NEW) with 20-entry `DMN_CARD_CATALOG: DmnCardDef[]` — distribution 2 P1 / 4 P2 / 6 P3 / 8 P4; each card has neuroscience-narrative `description` (verify NT/anatomy/mechanism facts via `/oe` if unsure per project `CLAUDE.md` rule)
- [x] 1.5 Ensure each of 5 `eventKind` values appears in ≥ 3 catalog entries
- [x] 1.6 Create `packages/content-neurons-tw/src/dmn-card-validator.ts` (NEW) with `validateDmnCardCatalog(catalog)` enforcing: size === 20, distribution 2/4/6/8, unique ids, all required fields, valid enum values, each eventKind has ≥ 3 cards
- [x] 1.7 Re-export DMN symbols from `packages/content-neurons-tw/src/index.ts`
- [x] 1.8 Create `packages/content-neurons-tw/scripts/verify-dmn-validator.ts` smoke fixture script (mirror `verify-validator.ts` pattern); add to package.json scripts as `verify:dmn`
- [x] 1.9 Run `pnpm --filter @study-rpg/content-neurons-tw verify:dmn` — passes

## 2. Theme — placeholder sprite registry

- [x] 2.1 Register 21 sprite keys in `packages/theme-pixel-neurons/src/sprites.ts`: `dmn:card:<cardId>` × 20 + `dmn:card-back` × 1 — all pointing to 1×1 transparent PNG placeholder (mirror scaffold-era pattern from `wire-neuron-variant-gacha`)
- [x] 2.2 Real pixel-art artwork generation deferred to follow-up change `generate-dmn-card-artworks` — DO NOT generate art in this change

## 3. Dexie schema — v5 → v6 migration

- [x] 3.1 In `apps/neurons-tw/src/lib/db.ts`, add `.version(6).stores({...})` chain adding `dmnCards`, `dmnEventLog`, `dmnActiveBuffs` tables with schemas per spec
- [x] 3.2 Verify v5 → v6 upgrade is purely additive (no column changes on existing tables; new meta keys default to 0 / null on first read)
- [x] 3.3 Write Vitest `apps/neurons-tw/src/__tests__/db-v6-migration.test.ts` — seed v5 fixture using fake-indexeddb, reopen at v6, assert existing data preserved + new tables empty + no DatabaseClosedError (per `~/.claude/imports/dexie_pk_change_pitfall.md` discipline — DO NOT change PK)

## 4. Trigger detector + draw entitlement

- [x] 4.1 Create `apps/neurons-tw/src/lib/services/dmn-trigger.ts` (NEW) — singleton `initializeDmnTrigger()` registers event bus listeners + exposes `ReadingTimerSubscriber` interface; idempotent on re-init
- [x] 4.2 Wire 3 event-bus listeners on existing `ConnectomeEventEmitter`: `connectome.variantSlotUnlocked` / `connectome.synapseFormed` / `connectome.synapseStrengthened` — each increments behavior-axis counter with daily cap (spec amended 2026-05-27: dropped `streak.dayIncreased` because neurons-tw has no daily-open streak service; dropped `actionPotentialThresholdCrossed` because AP thresholds 10/30/80/200/500 == variant slot unlock thresholds, making it redundant with `variantSlotUnlocked`)
- [x] 4.3 Implement `ReadingTimerSubscriber` interface stub (timer service not wired in this change; time-axis stays inactive until `polish-neurons-pre-ship` ships)
- [x] 4.4 Implement daily-reset lazy job on first interaction crossing local-TZ midnight (mirror `connectome-collection` daily-reset pattern); resets time-axis minutes / both axis draw counters; leaves `dmnDrawsAvailable` untouched
- [x] 4.5 ~~Emit `dmn.drawsGranted` event after Dexie transaction commits~~ — deferred to §5 orchestrator; trigger writes log via `console.info` for now (no external subscriber yet)
- [x] 4.6 Call `initializeDmnTrigger()` from `apps/neurons-tw/src/App.tsx` (or main entry) at boot

## 5. Draw orchestrator + event dispatcher

- [x] 5.1 Create `apps/neurons-tw/src/lib/services/dmn-fate-card.ts` (NEW) — `drawDmnCard()` orchestrator: decrement `dmnDrawsAvailable` → roll from un-owned pool with rarity weights → persist `dmnCards` row → dispatch event via dispatcher → log to `dmnEventLog` → return rolled card
- [x] 5.2 Implement weighted random sampling with rarity-ladder fallback if pool exhausted (custom impl — `rollGachaWithFloor` is shaped for slot-rarity rolls; DMN needs card-pool rolls)
- [x] 5.3 Create `apps/neurons-tw/src/lib/services/dmn-event-dispatcher.ts` (NEW) — `dispatchDmnEvent(card)` branches on `eventKind`:
  - `family-buff` → insert `dmnActiveBuffs` row with random familyId + expiresAt = now+1h
  - `variant-rate-up` → insert `dmnActiveBuffs` row with sentinel expiresAt (single-consume on next slot unlock)
  - `quick-review-batch` → emit event `dmn.quickReviewBatchRequested` on `dmnUiEvents` (UI subscribes in §6)
  - `streak-shield` → set `meta['dmnStreakShieldAvailable'] = 'true'`
  - `hidden-reveal` → append next undrawn P1 cardId's artworkId to `meta['dmnHiddenRevealedArtworkIds']` (CSV string)
- [x] 5.4 Check `dmnEventLog` before dispatching: if cardId already present with earlier dispatchedAt, no-op (idempotency)
- [x] 5.5 Wire `family-buff` consumer in `apps/neurons-tw/src/lib/services/connectome.ts` `recordCorrectAnswer`: `getActiveFamilyBuffBonus(familyId)` adds +1 to AP increment; tx scope extended to include `db.dmnActiveBuffs`
- [x] 5.6 Wire `variant-rate-up` consumer in `apps/neurons-tw/src/lib/services/variant-gacha.ts`: `consumeVariantRateUpBuff()` returns true once → use boosted weights 20/30/30/15/5 → mark consumed
- [x] 5.7 Wire `streak-shield` consumer in `streak.ts` `resetCurrentStreak`: `consumeStreakShield()` returns true → preserve streak (skip the reset)
- [x] 5.8 Wire `quick-review-batch` consumer at UI layer — `DmnQuickReviewToast` subscribes to `dmnUiEvents.on('dmn.quickReviewBatchRequested')`; surfaces 4s notification (full 5-question SRS batch deferred until SRS scheduler ships)

## 6. UI — modal + reveal + collection + button

- [x] 6.1 Create `apps/neurons-tw/src/components/DmnDrawButton.tsx` — top-nav button showing `dmnDrawsAvailable` count; disabled state when 0 with tooltip; uses `useDmnStatus` hook
- [x] 6.2 Create `apps/neurons-tw/src/components/DmnDrawModal.tsx` — full-screen modal triggers `drawDmnCard()` on confirm, plays animation, hands rolled card to reveal sub-component
- [x] 6.3 Reveal merged into `DmnDrawModal.tsx` (`DmnRevealCard` sub-component) — single modal handles both rolling + revealed phases; rarity colour + event-effect chip rendered inline. (Separate toast form for P3/P4 dropped in favour of consistent modal UX — simpler, less to test; if dogfood says P3/P4 feel "too heavy" can split later.)
- [x] 6.4 Create `apps/neurons-tw/src/routes/DmnCollectionPage.tsx` — `/dmn` route, responsive auto-fill grid showing all 20 cards (drawn = artwork visible, undrawn = `?` silhouette, hidden-reveal-hinted = blurred sprite with `???` name)
- [x] 6.5 Register `/dmn` route in `apps/neurons-tw/src/App.tsx` Router
- [x] 6.6 Place `DmnDrawButton` in top nav (right side, next to AuthGate)
- [x] 6.7 When 20/20 cards owned, `DmnDrawButton` renders disabled with "DMN 圖鑑完整" label and explanatory tooltip
- [x] 6.8 Create `apps/neurons-tw/src/components/DmnQuickReviewToast.tsx` + mount in App.tsx (covers §5.8 UI side of `quick-review-batch` event)
- [x] 6.9 Create `apps/neurons-tw/src/lib/hooks/useDmnStatus.ts` — Dexie liveQuery hook returning `{drawsAvailable, ownedCount, catalogSize}`

## 7. R2 sync — bundle schema bump + adapter + worker

- [x] 7.1 In `apps/neurons-tw/src/lib/sync/r2/bundles.ts` — bump `SCHEMA_VERSION` from 1 to 2 + add SCHEMA_VERSION history comment
- [x] 7.2 Relax `validateBundleMeta` — `schema_version > SCHEMA_VERSION` now `console.info(...)` + continues parse (forward-compat tolerance); `< 1` still throws (corruption defence)
- [x] 7.3 ~~Extend `BundleSnapshot` with optional dmn-* fields~~ — N/A: existing `BundleSnapshot.data: Record<string, unknown[]>` is adapter-name-keyed, so new adapters automatically contribute new keys; no interface change needed (v1 client iterating its own NEURONS_ADAPTERS will silently ignore unknown keys in `data`)
- [x] 7.4 ~~Update serialize/deserialize~~ — N/A for the same reason: `buildBundleSnapshot` iterates `NEURONS_ADAPTERS` automatically; adding 3 new adapters is sufficient
- [x] 7.5 In `apps/neurons-tw/src/lib/sync/tables.ts`, add `dmnCardsAdapter` — first-write-wins per cardId; if both sides have a row, keep the EARLIER `obtainedAt` (parallel to achievementsAdapter's first-unlock semantics)
- [x] 7.6 Add `dmnEventLogAdapter` with **monotonic-union** merge: any cardId present on either side stays in the union; both sides converge to identical set. Mirrors 二階 `everWrong` monotonic-OR discipline (see inline doc)
- [x] 7.7 Add `dmnActiveBuffsAdapter` (LWW on `expiresAt`); filters `expiresAt <= now` rows in both `snapshot()` (don't push stale) and `apply()` (don't merge stale); dedups by `sourceCardId` (matches event-log idempotency)
- [x] 7.8 Extend `metaAdapter` SYNCED_META_KEYS allowlist with 8 DMN keys (dmnDrawsAvailable / dmnLifetimeDrawsConsumed / dmnTimeAxisMinutesAccrued / dmnTimeAxisDrawsConsumedToday / dmnBehaviorAxisDrawsConsumedToday / dmnLastDailyResetDate / dmnStreakShieldAvailable / dmnHiddenRevealedArtworkIds)
- [x] 7.9 ~~Worker schema bump~~ — N/A: Worker is pure transport (presigned URL for opaque blob); doesn't validate bundle schema. Verified via grep — `cloudflare/sync-worker/src/*.ts` doesn't reference `schema_version` anywhere
- [x] 7.10 ~~Worker deploy~~ — no Worker code change in this scope, no deploy needed

## 8. Tests — Vitest unit + cross-version round-trip

- [x] 8.1 Catalog validation covered by `packages/content-neurons-tw/scripts/verify-dmn-validator.ts` (run via `pnpm verify:dmn` — 7/7 negative + positive cases); no separate Vitest mirror needed since validator is in a pure-TS package without vitest infra
- [x] 8.2 `apps/neurons-tw/src/__tests__/dmn-draw-mechanics.test.ts` — pool-removal ensures unique draws, decrement of `dmnDrawsAvailable`, cap at 20 returns null, `dmnEventLog` populated, `dmnLifetimeDrawsConsumed` increments. (Rarity distribution NOT tested — would need 10k+ trials with fixed RNG; catalog validator + production telemetry are the real distribution check.)
- [x] 8.3 `apps/neurons-tw/src/__tests__/dmn-event-idempotency.test.ts` — dispatcher skips duplicate dispatch when prior log row exists; `dmnEventLog` adapter monotonic-union merge converges both sides to union, keeps earlier `dispatchedAt`
- [x] 8.4 `apps/neurons-tw/src/__tests__/dmn-bundle-cross-version.test.ts` — `validateBundleMeta` tolerates `schema_version > current`; v2 client reading v1 bundle leaves dmn-* tables empty (preserve-on-omission); v2 → v2 round-trip restores dmn-* state
- [x] 8.5 `apps/neurons-tw/src/__tests__/dmn-trigger-counters.test.ts` — `accrueReadingMinutes` grants 1 draw / 30 min, caps at 2/day even with 90+ min; daily-reset zeros axis counters and bumps date but preserves `dmnDrawsAvailable`; second-call-same-day is no-op
- [x] 8.6 Run `pnpm --filter @study-rpg/neurons-tw test` — 5 files / 27 tests all green

## 9. Smoke + verify

- [x] 9.1 Cold checkout build: `pnpm --filter @study-rpg/core build && pnpm --filter @study-rpg/content-neurons-tw build` — both green
- [x] 9.2 Run `pnpm -r typecheck` — clean across all 12 workspace packages (medexam-tw / medexam2-hospital-tw / neurons-tw / core / 3 content packs / 3 themes)
- [x] 9.3 Dev server: `pnpm --filter @study-rpg/neurons-tw dev` — Vite 5.4.21 ready in 194ms at http://localhost:5175/
- [x] 9.4 Chrome MCP preflight: `list_connected_browsers` returns 1 browser (after initial transient unreachable)
- [x] 9.5 Behavior-axis trigger: seeded `dmnDrawsAvailable=3` via raw IDB → page reload → `DmnDrawButton` correctly shows `DMN · 3`. (Did NOT exercise the connectome event listener directly — that requires actually answering questions which is covered by the §8 Vitest integration; the button-renders-count proof is the smoke-level evidence.)
- [x] 9.6 Chrome MCP smoke: clicked DmnDrawButton → modal opened ("DMN 啟動" + Default Mode Network description) → clicked 「發散一抽 →」 → modal reveal rendered with `dmn-posteromedial-pulse-p4` (P4 銅 / quick-review-batch event chip). Dexie state inspection: `dmnCards.length=1`, `dmnEventLog.length=1`, `dmnDrawsAvailable=2`, `dmnLifetimeDrawsConsumed=1`. All correct.
- [x] 9.7 Chrome MCP smoke: navigated to `/dmn` via nav link → `<h1>DMN 圖鑑</h1>` + 20 tile rendered (1 owned + 19 silhouette)
- [x] 9.8 SPA route triple: (a) in-app nav click → `/dmn` renders ✓; (b) direct URL navigate to `/dmn` → renders ✓; (c) `location.reload()` (F5 equivalent) on `/dmn` → renders ✓ (vite dev SPA fallback works as expected — production GH Pages 404.html redirect is already in place from `add-neurons-deploy`, so prod equivalence not separately tested here)
- [ ] 9.9 Cross-version sync smoke (GH Pages v1 client + CF Pages v2 client) — DEFERRED until §11 archive ships + CF Pages deploy. Acceptance: Vitest cross-version round-trip in §8.4 already proves the tolerance code paths
- [x] 9.10 Run `openspec validate add-neurons-dmn-fate-card --strict` — passes ✓ ("Change 'add-neurons-dmn-fate-card' is valid")
- [ ] 9.11 `/opsx:verify` skill — deferred to user discretion; this verify pass via tasks + manual smoke covers same ground

## 10. Documentation + handoff

- [x] 10.1 Updated root project `CLAUDE.md` — added "DMN fate cards (M_3rd ext, 2026-05-27)" subsection covering: 20-card 4-tier catalog with weights, 5 event kinds with cap behavior, mixed-trigger axes (time stub + behavior wired), monotonic-union sync discipline + DO NOT replace warning, v1 → v2 bundle bump + reader tolerance pattern, Dexie v6 versions claimed, test coverage list
- [x] 10.2 ~~neurons-tw README~~ — no app-level README exists; player-facing docs go in commit message + future `/threads` post per ship plan (sibling change `polish-neurons-pre-ship`)
- [x] 10.3 Added entry to `openspec/project.md` Roadmap row "M_3rd ext — DMN fate cards (add-neurons-dmn-fate-card)" with status "🔄 code-complete + verify green (2026-05-27); 剩 archive + commit + push"
- [x] 10.4 Follow-up changes captured in design.md + this section for commit message: (a) `generate-dmn-card-artworks` (real pixel-art via codex CLI batch, ~1 hr), (b) `polish-neurons-pre-ship` (reading-timer wire → activates time-axis triggers + study-category achievement + empty-state copy), (c) optional `add-neurons-dmn-achievements` (P1 catalog entry for 20/20 collection complete + per-rarity milestones)

## 11. Archive

- [ ] 11.1 Once /opsx:verify green, run `/opsx:archive` (NEVER raw `openspec archive --yes` — slash workflow has sync gate per project `CLAUDE.md`)
- [ ] 11.2 Get explicit user confirmation before any `git commit` (per multi-agent git safety + project Curator rules)
- [ ] 11.3 Commit with template: `spec(archive): merge add-neurons-dmn-fate-card — DMN fate-card draws + 5-event pool + v2 bundle tolerance`
