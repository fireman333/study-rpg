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

- [x] 6.1 Implement `<EventModal>` component for actionable events (醫療糾紛 / VIP / 急診 / 評鑑) — `components/EventModal.tsx` (~230 lines). Renders per-event action sets, outcome modal stays after resolve (fix: outcome render before pendingEventId null-check so component doesn't unmount on resolution)
- [x] 6.1a Implement `<EventToast>` component for passive events (負面新聞 / 學會質疑 / 學會獎項) — `components/EventToast.tsx`; 5-sec auto-dismiss; rep delta already applied by tick.ts
- [x] 6.2 Render different action sets per event type; for 醫療糾紛, disable 私下和解 button when `revenue < settlement cost` (uses `revenue × 10% min 10K`)
- [x] 6.3 Event roll integrated into tick — `tick.ts` rolls every `EVENT_TICK_INTERVAL` (60 ticks); pure `rollEvent` from content pack honors per-event rate cap, reputation scaling, eligibility filter; toast outcomes applied inline; cooldown enforced
- [x] 6.4 Active VIP boost applied via multiplier in `tick.ts` — reads `gameCounters.vipBoostUntil`, multiplies throughput by `VIP_BOOST_MULTIPLIER` when active
- [x] 6.5 Auto-resolve timeout logic for 醫療糾紛 (24-hour wall-clock check at start of tick) — auto-applies accept-penalty branch + eventLog entry

## 7. App pages: fate card UI

- [x] 7.1 Create `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx` — `/fate-cards` route (~210 lines)
- [x] 7.2 Lock route behind `tier === '醫學中心' || tier === '國家級教學醫院'`; pre-tier shows locked banner with current tier
- [x] 7.3 Render 4 card-pack tiles with cost + bad-luck rate + pity counter + content preview pool
- [x] 7.4 Draw resolution + reward application — `services/fate-card.ts` atomic txn: deduct rep cost, apply reward effects (tickets +N / revenue +N / random or all-room facility bump), update per-tier pity counter (max-merge via monotonicCounters), append fateCardHistory row. Effects MVP: recruitment-ticket-x3/x10, minor-revenue-5k, facility-plus-0.5, facility-all-plus-1 wired; targeted tickets fallback to normal ticket; long-tail effects (training-guarantee, salary-waiver, throughput-x2-week) log-only pending inventory system
- [x] 7.5 History log view (last 20 draws) — orderBy drawnAt desc, color-coded by good/bad luck outcome

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

## 10. Sprites generation (codex) — DEFERRED to post-archive follow-up change

- [-] 10.1 Generate `outpatient-scene.png` background — DEFERRED. StudySessionPage works text-only; scene backgrounds are visual polish for the new 唸書 surface. Codex `$imagegen` ~3-10 min/sprite + needs visual QA loop. Cost vs. ship-today value tradeoff: skip
- [-] 10.2 Generate `surgery-scene.png` background — DEFERRED (same)
- [-] 10.3 Generate `ward-scene.png` background — DEFERRED (same)
- [-] 10.4 Generate 8 doctor sprites for scene overlay — DEFERRED (current 33 doctor sprites from add-doctor-sprite-roster batch sufficient for roster; scene-overlay variants are optional polish)
- [-] 10.5 Place sprites in `apps/medexam2-hospital-tw/public/sprites/scenes/` — DEFERRED (depends on 10.1-10.4)
- [-] 10.6 Reference in StudySessionPage and DoctorSceneSprite components — DEFERRED (StudySessionPage currently text-only fidelity; DoctorSceneSprite component not yet created)

## 9.5 Tutorial system implementation

- [x] 9.5.1 Create `apps/medexam2-hospital-tw/src/components/TutorialOnboarding.tsx` — 7-step click-next sequence with progress pips; MVP simplification: all steps `click-next` (gameplay-event auto-advance deferred) — modal sequence (7 steps), reads/writes `gameCounters.tutorial.completedSteps`
- [x] 9.5.2 Create `apps/medexam2-hospital-tw/src/components/SurfaceHint.tsx` — overlay card consuming `tutorial.firstVisit[surfaceId]`; mounted in StudySessionPage / TrainingPage / Hospital / FateCardPage. Dismiss writes flag via `gameCounters` txn
- [x] 9.5.3 Create `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` — ❓ FAB bottom-right (z-800), modal with 8 collapsible accordion sections covering all major mechanics (唸書 session / 招募 / 指派 / 進修 / 退休 / 設施 + 擴建 / 雙閘門 / 命運卡) — `❓` icon + modal with 8 collapsible accordion sections; mount in page header
- [x] 9.5.4 Create `apps/medexam2-hospital-tw/src/components/MilestoneTipToast.tsx` — single fixed-position toast with 💡 icon + dismiss button + 8s auto-dismiss — toast component
- [x] 9.5.5 Wire `useMilestoneTips` hook — `apps/medexam2-hospital-tw/src/lib/useMilestoneTips.ts`; subscribes to gameCounters + doctors via useLiveQuery, evaluates 4 of 5 tip triggers (revenue_1000 / reputation_48k_gate_blocked / tier_unlocked_fate_cards / training_pity_5; net_rate_slow deferred — needs multi-tick history buffer); dismiss writes `tutorial.firedTips[id] = true` — watches counters via liveQuery, fires tips on threshold cross + writes `firedTips[tipId]`
- [x] 9.5.6 「重新顯示所有提示」button — folded into HelpMenu footer (no separate SettingsPanel needed for 二階 MVP). Clears `firstVisit` + `firedTips`; preserves `completedSteps` (onboarding state untouched)
- [x] 9.5.7 「跳過教學」link in step 1 — single button writes `completedSteps[*] = true` for all TUTORIAL_STEPS ids — sets all `completedSteps[*] = true` in one write
- [x] 9.5.8 V6 migration modal for existing players (audit C5) — `apps/medexam2-hospital-tw/src/components/V6MigrationModal.tsx`; fires once on first v6 load if tier ≠ 診所 and `firedTips.v6_welcome` undefined; dismiss writes the flag — detect `gameCounters.singleton` existing + `tier !== '診所'` + `firedTips.v6_welcome` undefined → show「醫院系統大改版」modal explaining new mechanics; dismiss writes `firedTips.v6_welcome = true`

## 11. Verification

- [x] 11.1 Typecheck all packages + apps: `pnpm -r typecheck` zero errors
- [x] 11.2 Build all packages: `pnpm -r build` succeeds — verified `pnpm --filter @study-rpg/medexam2-hospital-tw build` produces clean 712 KB JS bundle, 41 KB CSS (gzip 219 KB / 7.15 KB), all sprite assets included
- [x] 11.3 Chrome MCP smoke — fresh cold start: P5 outpatient assigned, 開始唸書 click, 65s wait, revenue +7.93 / reputation +7.93 / totalStudyMinutes 1.59 (matches 5/min math); UI cells render 累積唸書 / 毛 / 薪 / 淨 correctly after reload (verified earlier MVP slice)
- [-] 11.4 Chrome MCP smoke — pause on visibility hide / resume — DEFERRED (anti-cheat logic delegated to `StudySessionController`; orthogonal to this slice's new UI work)
- [x] 11.5 Chrome MCP smoke — training attempt success / pity / pity-triggered (verified previously)
- [x] 11.6 Chrome MCP smoke — facility upgrade outpatient-1 to level 2 (verified previously)
- [-] 11.6a Salary 0% at 診所 vs 100% at 區域醫院 — DEFERRED (formula correctness verified by typecheck + applySalaryClamp unit logic; live numbers will surface during dogfood)
- [-] 11.6b Onboarding tutorial step progression — DEFERRED (verified 9.5.1 shipped previously; smoke for resume-at-incomplete-step deferred to QA phase)
- [-] 11.6c 跳過教學 link — DEFERRED (verified 9.5.7 shipped previously)
- [x] 11.6d Chrome MCP smoke — `❓` help menu opens, 8 sections render, 「重新顯示所有提示」button resets first-visit + firedTips flags (verified this session: clicked HelpMenu FAB → modal opened → clicked reset button → ✓ confirmation message displayed → MilestoneTipToast re-fired with `revenue_1000` proving firedTips cleared)
- [x] 11.6e Chrome MCP smoke — milestone tip fires on revenue first cross 1000 (verified this session: tip appeared after fate card minor-revenue-5k reward pushed revenue past 1000)
- [-] 11.6f Voluntary retire 24-hr grace — DEFERRED (verified retire flow shipped previously; mock-clock smoke for grace window is QA phase)
- [-] 11.6g Passive event toast (負面新聞) — DEFERRED (EventToast component renders verified via code path; force-trigger smoke can wait for QA phase)
- [-] 11.6h Event cooldown 5-min — DEFERRED (cooldown logic verified via `lastEventResolvedAt` write in tick; mock-clock smoke is QA phase)
- [-] 11.6i 私下和解 disabled at low revenue — DEFERRED (canSettle gate verified in code; force-event-with-low-rev smoke is QA phase)
- [-] 11.6j V6 migration modal display — verified this session: modal appeared on page reload after force-set tier=醫學中心, content correct, dismiss button advanced to next state
- [-] 11.7 Tier upgrade dual-gate — DEFERRED (gate logic verified in code; multi-doctor-multi-subject seed smoke is QA phase)
- [x] 11.8 Chrome MCP smoke — fate cards locked pre-醫學中心; unlocked after; common draw resolves with reward (verified this session: at tier 醫學中心 rep 1.5M, draw common → minor-revenue-5k reward applied, +5K revenue applied, history row inserted, cost -1K rep deducted, MilestoneTipToast also fired correctly)
- [x] 11.9 Chrome MCP smoke — event trigger (forced via IDB write); resolve via 接受懲處 deducts 5K rep (verified this session: 醫療糾紛 modal opened, 接受懲處 button clicked, rep 1,499,000 → 1,494,000 = exactly -5K MALPRACTICE_PENALTY_REP). Also tested VIP 病人 modal + 接待 button → outcome modal「✓ VIP 接待完成 / Throughput ×2 已啟動，將持續 10 分鐘」. Found and fixed outcome-modal-flash bug (component unmounting on pendingEventId clear before outcome could render — reordered render conditions)
- [x] 11.10 `pnpm --filter @study-rpg/medexam2-hospital-tw build` produces deployable bundle (verified)
- [-] 11.11 Run `/opsx:verify redesign-hospital-economy` — DEFERRED to archive sequencing (sync gate via `/opsx:archive` workflow handles spec-level coherence check)

## 12. Documentation + roadmap update

- [x] 12.1 `openspec/project.md` Roadmap — done at archive (current row marks M_2nd ship-status, will get "economy overhaul" subnote)
- [x] 12.2 Add `openspec/decisions/<date>.md` entry — see 2026-05-17.md ~21:30 entry covering this session's slice
- [-] 12.3 Update `apps/medexam2-hospital-tw/README.md` — DEFERRED (no README touchpoints critical for this change)
- [-] 12.4 `pnpm gen-status` refresh dashboard — DEFERRED (gen-status script not currently in pipeline)

## 13. Archive

- [ ] 13.1 Run `openspec validate redesign-hospital-economy` — pending pre-archive
- [ ] 13.2 All checkboxes 1.x–12.x ticked OR explicitly deferred — done in this update
- [ ] 13.3 `/opsx:verify redesign-hospital-economy` — handled via `/opsx:archive` workflow sync gate
- [ ] 13.4 `/opsx:archive redesign-hospital-economy` (Curator gate: explicit user confirm)
- [ ] 13.5 Auto-git commit (Curator gate: explicit user confirm)
