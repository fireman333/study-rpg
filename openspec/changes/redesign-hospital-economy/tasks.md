## 0. Prerequisites

- [x] 0.1 `add-cloud-sync` change archived (HospitalDB v5 deployed with `meta` + `localBackup` tables) — archived 2026-05-17 17:30 via this session, commit `e05717e`. main specs/auth/ + specs/cloud-sync/ created
- [-] 0.2 Confirm working tree clean on `track-m2` branch; create dedicated dev branch `feat/redesign-hospital-economy` off track-m2 — **modified**: implementation proceeding on Claude worktree `claude/cranky-shaw-69c09c` (off main; has M4 archive baseline). Will merge to track-m2 + main post-archive per dual-worktree sync protocol

## 1. Content pack: economy constants and helpers

- [x] 1.1 `packages/content-medexam2-tw/src/clinic-tiers.ts` — add `'國家級教學醫院'` to `HospitalTier` union and `TIER_ORDER`
- [x] 1.2 Recalibrate `TIER_UPGRADE_THRESHOLDS` to `{診所: 48_000, 區域醫院: 192_000, 醫學中心: 2_000_000, 國家級教學醫院: null}`
- [x] 1.3 Add `TIER_ROOMS['國家級教學醫院']` = 10 rooms (5 outpatient + 3 surgery + 2 ward, deterministic ids, supersets 醫學中心)
- [x] 1.4 Add `TIER_DIVERSIFICATION_REQUIREMENTS`: per-tier `{minRarity, requiredCount, requireP1?}` table
- [x] 1.5 Add `countDistinctSubjectsAtRarity(doctors, minRarity)` helper exported from `clinic-tiers.ts` — also exported `rarityIsAtLeast` helper since gate evaluator needs it for P1-check
- [x] 1.6 Create `packages/content-medexam2-tw/src/study-session.ts` (169 lines) — `createStudySessionController({onStart, onPause, onResume, onStop})` factory encapsulates idle/visibility detection
- [x] 1.7 Create `packages/content-medexam2-tw/src/training.ts` (157 lines) — `TRAINING_COSTS`, `TRAINING_BASE_SUCCESS_RATES`, `TRAINING_PITY_THRESHOLD = 5`, `attemptTraining(doctor, opts)` pure function (RNG injected)
- [x] 1.8 Create `packages/content-medexam2-tw/src/finances.ts` (134 lines) — `SALARY_BASE = 4`, `TIER_SALARY_RATE` (0%/100%/100%/100%), `FACILITY_UPGRADE_COSTS`, `ROOM_EXTENSION_COSTS`, `computeSalaryDrain` helper, `applySalaryClamp` defensive helper
- [x] 1.9 Create `packages/content-medexam2-tw/src/events.ts` (262 lines) — `EVENT_TRIGGER_RATES`, `EVENT_DEFINITIONS`, `rollEvent(opts)` pure function. Note: positive toast (學會獎項) reward range reused [1000, 10000] from negative events for symmetry — flag for dogfood tuning if asymmetric balance desired
- [x] 1.10 Create `packages/content-medexam2-tw/src/fate-cards.ts` (192 lines) — `FATE_CARD_COSTS`, `FATE_CARD_POOLS`, `FATE_CARD_PITY_THRESHOLD = 3`, `drawFateCard(tier, rng, consecutiveBadLuck)` pure function (consumes/resets pity counter per call)
- [x] 1.10a Create `packages/content-medexam2-tw/src/tutorial.ts` (185 lines) — `TUTORIAL_STEPS` (7 ordered steps), `SURFACE_HINTS` (5 surfaces), `MILESTONE_TIPS` (5 triggers); plain string + condition definitions
- [x] 1.11 Edit `packages/content-medexam2-tw/src/reputation.ts` — **deleted file** per option (a); `quizEvents` was its only consumer in this pack. `index.ts` re-export removed. `getAffinityBonus` (the helper task 1.11 wanted to keep) actually lives in `affinity.ts`, so unaffected
- [x] 1.12 `pnpm --filter @study-rpg/content-medexam2-tw build` passes (6066 imported / 14 upstream OCR skips with `MEDEXAM2_ALLOW_SKIPS=1`); content-pack `tsc --noEmit` zero errors. `pnpm -r typecheck` has 3 downstream errors in `apps/medexam2-hospital-tw` (App.tsx + HospitalScene.tsx referencing removed `createPerQReputationListener` and missing 4th-tier entry) — **expected**, will be cleaned by task 3.5 + task 4.x (HospitalScene update)

## 2. App schema: HospitalDB v6 migration

- [x] 2.1 `apps/medexam2-hospital-tw/src/db/schema.ts` — bump HospitalDB to v6
- [x] 2.2 Update `GameCountersRow` (LWW row): add `currentSessionStartedAt: number | null` + `lastSessionEndedAt: number | null` + `tutorial: { completedSteps: Record<string, true>, firstVisit: Record<string, true>, firedTips: Record<string, true> }` (NOT `totalStudyMinutes` or pity — those move to monotonicCounters per audit B3)
- [x] 2.2a Create new `MonotonicCountersRow` type with `id: 'singleton'`, `totalStudyMinutes: number`, `fateCardBadLuckPity: { common: number, rare: number, epic: number }` — separate row for MAX-merge cloud sync strategy
- [x] 2.3 Add `TrainingHistoryRow` + `EventLogRow` + `FateCardHistoryRow` + `RetirementLogRow` types
- [x] 2.4 Add v6 store definitions: `monotonicCounters: '&id'`, `trainingHistory: '++id, doctorId, attemptedAt'`, `eventLog: '++id, triggeredAt'`, `fateCardHistory: '++id, drawnAt'`, `retirementLog: '++id, retiredAt, doctorId'`
- [x] 2.5 Write v6 upgrade hook per design D7: create `monotonicCounters.singleton` with zeros; patch `gameCounters.singleton` to add new LWW-only fields; patch doctors with `pityCounter = 0`; patch rooms with `facilityLevel = 1`
- [x] 2.6 Update `ensureSeed` to initialize both `gameCounters` AND `monotonicCounters` rows on fresh save
- [x] 2.7 Add `pityCounter: number` field to `DoctorRow` type with default 0; update v6 upgrade to backfill existing doctors
- [x] 2.8 Add `facilityLevel: number` (1-5) field to `Room` type with default 1; v6 upgrade backfills
- [x] 2.9 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` passes

## 3. App tick refactor: session-gated, totalStudyMinutes, salary

- [x] 3.1 `apps/medexam2-hospital-tw/src/lib/tick.ts` — rewrite `runTick` to:
  - Read totalThroughput (assigned doctors only — bench doesn't produce)
  - Compute deltaRevenueGross = throughput × elapsedSec / 60
  - Compute deltaSalary via `finances.computeSalaryDrain(ALL_OWNED_DOCTORS, tier)` (per D5: `Σ doctor.powerMultiplier × 4 × tierRate`; tierRate: 0% / 100% / 100% / 100%)
  - Compute deltaReputation = throughput × elapsedSec / 60 (no 0.7 multiplier)
  - Compute deltaTotalStudyMinutes = elapsedSec / 60
  - Write revenue = max(0, currentRevenue + gross - salary) (defensive 0 floor; per design D5, default config never triggers it)
  - **Roll event** (every 60 ticks): use reputation-scaled trigger rate `baseRate × clamp(reputation / 100k, 0.5, 3.0)`, cap effective rate at 0.5
  - **Roll negative-rep event** subset (負面新聞 / 學會質疑) — deduct uniform random `[1000, 10000]` reputation; combined effective rate ≤ 5%
- [x] 3.2 Remove the always-on `setInterval` in `useTickLoop`; replace with `useStudySessionTick` that observes `studySession.state` and schedules interval only during `'active'`
- [x] 3.3 Wire visibilitychange + idle detection through `study-session.ts` controller (NOT directly on tick.ts anymore)
- [x] 3.4 Update tier-upgrade logic in tick to check dual-gate: reputation threshold AND `countDistinctSubjectsAtRarity` returns ≥ requiredCount AND (if 國家級教學醫院) at least 1 P1
- [x] 3.5 Unregister `createPerQReputationListener` in `main.tsx` / `App.tsx` (delete the import and the call)

## 4. App pages: study session UI

- [x] 4.1 Create `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx` — top-level study scene route at `/study`
- [-] 4.2 Implement `<DoctorSceneSprite>` — DEFERRED to follow-up (depends on §10 sprite gen) overlay component — renders assigned doctor sprite in each room's position
- [x] 4.3 Implement start / pause / stop buttons + session status banner
- [x] 4.4 Implement paused overlay — text hint instead of overlay (MVP) state when session is auto-paused
- [x] 4.5 Wire `useStudySessionTick` hook from §3.2 to mount on `/study` route
- [x] 4.6 Add nav link from HomePage to `/study`
- [x] 4.7 Style with existing pixel-hospital theme

## 5. App pages: training UI

- [x] 5.1 Create `apps/medexam2-hospital-tw/src/pages/TrainingPage.tsx` — `/training` route
- [x] 5.2 List all owned doctors with current rarity + pity counter + button to train
- [x] 5.3 Confirmation modal — show cost, base success rate, "pity in N tries" indicator
- [x] 5.4 Resolve attempt via `training.attemptTraining()` → write `trainingHistory` row → update doctor.rarity + pityCounter
- [x] 5.5 Animate success/failure outcome — outcome modal with rarity-up / pity-triggered display
- [x] 5.6 Add nav link from HomePage
- [x] 5.7 Doctor detail panel — add 「退休醫師」button with confirmation modal (per audit B2); on confirm: delete from `db.doctors`, null `assignedDoctorId` in affected room, refund `powerMultiplier × 1000` revenue, write `retirementLog` row — implemented in TrainingPage doctor card (no separate detail panel needed); service in `apps/medexam2-hospital-tw/src/services/retire.ts`
- [x] 5.8 Diversification gate counter — implement 24-hour grace via `retirementLog` lookup: `(now - retiredAt) < 24*60*60*1000` doctors still count toward diversification — tick.ts dual-gate now folds recent retirees into `effectiveDoctors` array before `countDistinctSubjectsAtRarity`

## 6. App pages: events UI

- [ ] 6.1 Implement `<EventModal>` component for actionable events (醫療糾紛 / VIP / 急診 / 評鑑) that floats above all pages until resolved
- [ ] 6.1a Implement `<EventToast>` component for passive events (負面新聞 / 學會質疑 / 學會獎項) — 5-sec auto-dismiss, applies outcome immediately
- [ ] 6.2 Render different action sets per event type; for 醫療糾紛, disable 私下和解 button when `revenue < 10_000` (audit C4)
- [ ] 6.3 Event roll integrated into tick — every Nth tick roll an event if conditions met; respect 5-min post-resolution cooldown (audit C2); cap effective rate at 30% (audit C2)
- [ ] 6.4 Active VIP boost applied via multiplier in `tick.ts`
- [ ] 6.5 Auto-resolve timeout logic for 醫療糾紛 (24-hour wall-clock check on tick)

## 7. App pages: fate card UI

- [ ] 7.1 Create `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx` — `/fate-cards` route
- [ ] 7.2 Lock route behind `tier === '醫學中心' || tier === '國家級教學醫院'`; pre-tier shows placeholder
- [ ] 7.3 Render 4 card-pack tiles with cost + content preview
- [ ] 7.4 Draw animation reveal + reward application
- [ ] 7.5 History log view (last 20 draws)

## 8. App pages: facility / extension UI

- [x] 8.1 Add facility upgrade button to RoomCard in `/hospital` route — implemented inside AssignDoctorModal (RoomCard is already a button; nested-button anti-pattern avoided)
- [x] 8.2 Show current `facilityLevel`, next cost, max-level disabled state
- [x] 8.3 Add room-extension panel (separate section, lock behind tier ≥ 區域醫院) — service in `services/room-extension.ts`, UI panel in `pages/Hospital.tsx`; deterministic ids `extra-{type}-{N}`; max extras enforced (3 outpatient / 2 surgery / 2 ward)
- [x] 8.4 Wire all UI to `finances.ts` helpers + Dexie writes (services/facility.ts: atomic txn — bump facilityLevel + roomFacility + deduct revenue)

## 9. HomePage update

- [x] 9.1 Add totalStudyMinutes counter to banner (display as `「累積唸書 1,234 min」`)
- [x] 9.2 Add diversification progress line under reputation progress (e.g., `「(P3+ 科別 5 / 8)」`)
- [x] 9.3 Add finance panel: net rate per minute + salary breakdown
- [x] 9.4 Update tier-upgrade banner copy to reflect new tier names

## 10. Sprites generation (codex)

- [ ] 10.1 Generate `outpatient-scene.png` background (codex `$imagegen`, GBA pixel style, transparent bg, 384×384)
- [ ] 10.2 Generate `surgery-scene.png` background
- [ ] 10.3 Generate `ward-scene.png` background
- [ ] 10.4 Generate 8 doctor sprites (per rarity / common subjects) for scene overlay — reuse `add-doctor-sprite-roster` shipped style
- [ ] 10.5 Place all in `apps/medexam2-hospital-tw/public/sprites/scenes/`
- [ ] 10.6 Reference in StudySessionPage and DoctorSceneSprite components

## 9.5 Tutorial system implementation

- [x] 9.5.1 Create `apps/medexam2-hospital-tw/src/components/TutorialOnboarding.tsx` — 7-step click-next sequence with progress pips; MVP simplification: all steps `click-next` (gameplay-event auto-advance deferred) — modal sequence (7 steps), reads/writes `gameCounters.tutorial.completedSteps`
- [ ] 9.5.2 Create `apps/medexam2-hospital-tw/src/components/SurfaceHint.tsx` — overlay card; consumes `tutorial.firstVisit[surfaceId]`, dismiss writes flag
- [ ] 9.5.3 Create `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` — `❓` icon + modal with 8 collapsible accordion sections; mount in page header
- [x] 9.5.4 Create `apps/medexam2-hospital-tw/src/components/MilestoneTipToast.tsx` — single fixed-position toast with 💡 icon + dismiss button + 8s auto-dismiss — toast component
- [x] 9.5.5 Wire `useMilestoneTips` hook — `apps/medexam2-hospital-tw/src/lib/useMilestoneTips.ts`; subscribes to gameCounters + doctors via useLiveQuery, evaluates 4 of 5 tip triggers (revenue_1000 / reputation_48k_gate_blocked / tier_unlocked_fate_cards / training_pity_5; net_rate_slow deferred — needs multi-tick history buffer); dismiss writes `tutorial.firedTips[id] = true` — watches counters via liveQuery, fires tips on threshold cross + writes `firedTips[tipId]`
- [ ] 9.5.6 Settings panel adds 「重新顯示所有提示」button — resets all `firstVisit.*` + `firedTips.*` flags
- [x] 9.5.7 「跳過教學」link in step 1 — single button writes `completedSteps[*] = true` for all TUTORIAL_STEPS ids — sets all `completedSteps[*] = true` in one write
- [x] 9.5.8 V6 migration modal for existing players (audit C5) — `apps/medexam2-hospital-tw/src/components/V6MigrationModal.tsx`; fires once on first v6 load if tier ≠ 診所 and `firedTips.v6_welcome` undefined; dismiss writes the flag — detect `gameCounters.singleton` existing + `tier !== '診所'` + `firedTips.v6_welcome` undefined → show「醫院系統大改版」modal explaining new mechanics; dismiss writes `firedTips.v6_welcome = true`

## 11. Verification

- [x] 11.1 Typecheck all packages + apps: `pnpm -r typecheck` zero errors
- [ ] 11.2 Build all packages: `pnpm -r build` succeeds
- [x] 11.3 Chrome MCP smoke — fresh cold start: P5 outpatient assigned, 開始唸書 click, 65s wait, revenue +7.93 / reputation +7.93 / totalStudyMinutes 1.59 (matches 5/min math); UI cells render 累積唸書 / 毛 / 薪 / 淨 correctly after reload: navigate to /, see "no session" state, click start session, scene renders, tick begins, revenue + reputation + totalStudyMinutes all increment after 60s
- [ ] 11.4 Chrome MCP smoke — pause on visibility hide; resume on visibility return + click 繼續
- [x] 11.5 Chrome MCP smoke — training attempt: success path (RNG ≤ rate) / 5× failure pity accumulator / pity-triggered success at attempt 6 (rarity P5→P4 + powerMultiplier 0.5→1.0 + pityCounter 0; 6 trainingHistory rows correct shape; revenue −1000×6 = −6000): fail first time (verify pityCounter increment), pass after 5 fails (pity)
- [x] 11.6 Chrome MCP smoke — facility upgrade outpatient-1 to level 2 (revenue 50K → 40K, facilityLevel 1 → 2, roomFacility 1.0 → 1.5, modal live-updates next-level cost), throughput visibly increases
- [ ] 11.6a Chrome MCP smoke — salary 0% at 診所 (5 doctors owned, revenue grows pure throughput); upgrade to 區域醫院 → 100% kicks in; verify revenue net positive at default config (5 P3 assigned + 3 P3 bench = 100/min throughput - 64/min salary = +36/min)
- [ ] 11.6b Chrome MCP smoke — onboarding tutorial: fresh save renders step 1 modal, completing each step unlocks next, reload mid-tutorial resumes at correct step
- [ ] 11.6c Chrome MCP smoke — 「跳過教學」link sets all completedSteps, modal closes, future visits don't re-show
- [ ] 11.6d Chrome MCP smoke — `❓` help menu opens from any page, sections expand/collapse, 「重新顯示提示」button resets first-visit flags
- [ ] 11.6e Chrome MCP smoke — milestone tip fires when revenue first crosses 1000; subsequent crossings don't re-fire
- [ ] 11.6f Chrome MCP smoke — voluntary retire: retire a P3 doctor → refund 2,000 revenue, doctor removed, room freed, `retirementLog` has entry; diversification count unchanged for next 24 hr (mock clock)
- [ ] 11.6g Chrome MCP smoke — passive event toast: trigger 負面新聞 via dev hook → reputation drops immediately, toast appears, auto-dismisses 5s, no modal blocks page
- [ ] 11.6h Chrome MCP smoke — event cooldown: resolve 醫療糾紛, verify next event roll skipped for 5 min (force via dev clock advance), then next roll allowed
- [ ] 11.6i Chrome MCP smoke — settlement disabled at low revenue: trigger 醫療糾紛 with revenue 5,000 → 私下和解 button disabled with label
- [ ] 11.6j Chrome MCP smoke — v6 migration modal: load existing v5 save → modal appears once; dismiss → never appears again; fresh save → modal NOT shown, only onboarding
- [ ] 11.7 Chrome MCP smoke — tier upgrade dual-gate: at 47,999 rep with 4 distinct subjects, no upgrade; gain 5th subject and trickle to 48,000, upgrade fires
- [ ] 11.8 Chrome MCP smoke — fate cards locked pre-醫學中心; unlocked after; one draw resolves and history row appears
- [ ] 11.9 Chrome MCP smoke — event trigger via dev hook (force-trigger 醫療糾紛); resolve via settlement deducts revenue
- [ ] 11.10 `pnpm --filter @study-rpg/medexam2-hospital-tw build` produces deployable bundle
- [ ] 11.11 Run `/opsx:verify redesign-hospital-economy` — 4-dim check all green

## 12. Documentation + roadmap update

- [ ] 12.1 `openspec/project.md` Roadmap — add M_2nd "economy overhaul" milestone; check off after archive
- [ ] 12.2 Add `openspec/decisions/<date>.md` entry — summary of 7 spec capability deltas + dogfood numbers calibration approach
- [ ] 12.3 Update `apps/medexam2-hospital-tw/README.md` if relevant
- [ ] 12.4 `pnpm gen-status` refresh dashboard

## 13. Archive

- [ ] 13.1 Run `openspec validate redesign-hospital-economy` — must pass
- [ ] 13.2 All checkboxes 1.x–12.x ticked
- [ ] 13.3 `/opsx:verify redesign-hospital-economy` — implementation matches spec
- [ ] 13.4 `/opsx:archive redesign-hospital-economy` (Curator gate: explicit user confirm) — merges deltas into main specs
- [ ] 13.5 Auto-git commit (Curator gate: explicit user confirm)
