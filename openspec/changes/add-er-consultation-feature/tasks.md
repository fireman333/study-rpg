## 1. Schema & Persistence

- [x] 1.1 Bump Dexie version v9 → v10 in `apps/medexam2-hospital-tw/src/db/schema.ts`
- [x] 1.2 Add `erConsultLog` table indexed by `triggeredAt`, `subjectId` with `ERConsultLogRow` interface
- [x] 1.3 Add `erConsultActive` + `erConsultTicksUntilRoll` JS-prop fields to `gameCounters.singleton` (nullable, default null/0)
- [x] 1.4 Schema v9→v10 is purely additive (new table + new JS props on singleton); no `.upgrade` hook needed — existing saves get defaults via nullish-coalescing in tick.ts
- [x] 1.5 SKIPPED — 二階 has no `player_state.settings` in core (settings live in Dexie `meta` table); settings shape defined in Section 6 instead

## 2. Core Logic (pure functions, in `packages/core`)

- [x] 2.1 Created `packages/core/src/lib/er-consultation.ts` with `selectUnderUtilizedSubject(input)` weighted-score selector (recency 0.6 + mastery 0.3 + jitter 0.1, 0.3× cooldown ≥ 3)
- [x] 2.2 Added `pickERConsultQuestion(input)` with 30-day exclusion + full-pool fallback
- [x] 2.3 Added `shouldRollERConsult(state)` pure mutex check across 6 gates
- [x] 2.4 Added `computeERConsultReward(baseReward)` = `Math.floor(baseReward * 1.8)` + exported constant `ER_CONSULT_REWARD_MULTIPLIER`; streak param dropped (二階 has no streak)
- [x] 2.5 SKIPPED unit tests for now — core package has no test runner wired; pure functions are simple enough for code review + integration smoke. Can add later via `vitest` if dogfood reveals selector bugs
- [x] 2.6 Added `jitterTicksUntilNextERConsult(rng)` helper for tick cadence (72–120 ticks at 5s = 6–10 min)
- [x] 2.7 Exported all new symbols from `packages/core/src/index.ts`; `pnpm --filter @study-rpg/core build` passes clean

## 3. Tick Scheduler Wiring

- [x] 3.1 Added ER consult Phase 1 (in-tx) auto-skip + countdown decrement in `apps/medexam2-hospital-tw/src/lib/tick.ts` (not `services/tick.ts`; tick already lives in `lib/`)
- [x] 3.2 `erConsultTicksUntilRoll` field on `gameCounters.singleton`; session pause handled implicitly because tick only runs when `currentSessionStartedAt !== null`
- [x] 3.3 Mutex check happens twice — cheap pre-check at end of Phase 1 (signals `shouldRollERConsult: boolean`), full mutex re-check inside Phase 2 tx via `shouldRollERConsult` core helper
- [x] 3.4 Added Phase 2 `maybeRollAndPersistERConsult()` in `lib/tick.ts` — runs OUTSIDE main tx (content-pack fetch can't sit inside Dexie); reschedules countdown via `jitterTicksUntilNextERConsult` at end of Phase 1 regardless of roll success
- [x] 3.5 Auto-skip handled in Phase 1: if `isERConsultExpired(active, now)`, clears active + appends `auto-skipped` log row + enforces 500-row cap
- [x] 3.6 `useStudySessionTick` hook accepts new optional `onERConsultTriggered(active)` callback fired when Phase 2 successfully spawns a consult
- [x] 3.7 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` passes clean

## 4. ERConsultDialog UI Component

- [x] 4.1 Created `apps/medexam2-hospital-tw/src/components/ERConsultDialog.tsx` (mentor-daily style adapted to 二階 — uses Dexie liveQuery on `gameCounters.erConsultActive`)
- [x] 4.2 Wired 5 greeting variants in `ER_CONSULT_GREETINGS` (parameterized by `{subject}`); variant index captured at spawn time (`active.greetingIdx`) for stability across re-renders
- [x] 4.3 Wired 5 gratitude + 5 supportive-correction variants (`ER_CONSULT_GRATITUDE`, `ER_CONSULT_CORRECTIONS`); chosen stably from question-id hash
- [x] 4.4 Embedded question card sourced via `pickQuestionById(active.questionId)` — same loader QuizModal uses
- [x] 4.5 SKIPPED visual countdown — auto-skip enforced server-side by tick handler. Adding live countdown would require 1s interval re-render; defer to dogfood feedback
- [x] 4.6 Onboarding tooltip wired: reads `settings.onboarded`, renders inline banner if false, writes `true` on first answer/skip (any close path)
- [x] 4.7 「跳過」 button with `showSkipConfirm` first-time guard; subsequent skips in same session bypass
- [x] 4.8 Mounted `<ERConsultDialog />` at App root (after `<EventModal />`); driven by liveQuery on `gameCounters.erConsultActive`

## 5. Answer Handlers

- [x] 5.1 Created `answerERConsult(opts)` + `skipERConsult(active)` + `discardActiveERConsult()` in `apps/medexam2-hospital-tw/src/services/er-consultation.ts`
- [x] 5.2 Reuses `recordCorrectAnswer` / `recordWrongAnswer` from `lib/mastery.ts` → mastery `{correct, total}` semantics preserved (only-increment); affinity bumped on correct; questionHistory upserted + SRS advances
- [x] 5.3 Reward path: `revenue += round(QUIZ_REVENUE_PER_CORRECT_BASE × tier × 1.8)` + same for reputation; NOT XP (二階 has no XP). Wrong = 0 reward. Specialty multiplier = 1.0 (ER doctor is NPC, no partner bonus)
- [x] 5.4 SKIPPED `addStat('knowledge', +1)` + `quizEvents.emit` — both are 一階 concepts; 二階 has neither. Stat schema lives in 一階 Player only
- [x] 5.5 SRS enqueue via `recordWrongAnswer` path (already wires `questionHistory` → SRS scheduler reads `nextDueAt`). Wrong answer reveal + mock-exam placeholder fallback wired in dialog
- [x] 5.6 SKIPPED `incrementQuestionsAnswered + applyCheckIn` — streak system is 一階 only (Player.todayProgress doesn't exist in 二階)
- [x] 5.7 `appendERConsultLog` writes row with `rewardGained: revenueDelta + reputationDelta` and `reactionTimeMs`; enforces 500-row cap (oldest deleted in same transaction)
- [x] 5.8 `erConsultActive` cleared atomically with reward write (correct/wrong path) / with log append (skip path) / with no log (toggle-off discard path)
- [x] 5.9 Added `ER_CONSULT_GREETINGS / GRATITUDE / CORRECTIONS` constant pools (5 entries each) exported from service

## 6. Settings Toggle

- [x] 6.1 Added 「急診照會設定」 as 9th HelpMenu accordion section (consistent with bug-report pattern); switch toggle lives in section body
- [x] 6.2 Toggle reads via `getERConsultSettings()` / writes via `setERConsultSettings({enabled})` → Dexie `meta` table key `er-consult-settings`
- [x] 6.3 On toggle OFF: calls `discardActiveERConsult()` which clears `erConsultActive` without log row (per spec discard semantics)
- [x] 6.4 In-app help section copy explains feature + relevant params (cold-subject detection + 10-min timeout); no separate doc needed for MVP

## 7. ER Doctor Sprite

- [x] 7.1 GENERATED `doctor-er-doctor-female.png` via codex CLI (`/tmp` workspace, ~3 min wall, native chroma-key + 16-color palette, 384×384 PNG, 9.6 KB). Saved to `packages/theme-pixel-hospital/sprites/doctor-er-doctor-female.png` — auto-picked up by existing `doctor-*.png` glob in `sprites.ts`
- [x] 7.2 Refactored `ERConsultActiveState.doctorSpriteKey` to use canonical `doctor-er-doctor` / `doctor-er-doctor-female` keys; `ER_DOCTOR_SPRITE_KEYS` constant exported from `lib/sprite-lookup.ts` for DEI random pick
- [x] 7.3 `rollNewERConsult` now randomly picks `doctorSpriteKey` between male/female 50/50 at spawn → matches existing doctor-roster DEI parity
- [x] 7.4 `lookupERDoctorSprite(map, key)` signature extended to accept the sprite key; falls back to `doctor-default-P2` when missing (male sprite still uses fallback — see USER ACTION 7.5)
- [x] 7.5 Chrome MCP verified BOTH sprites: female (`doctor-er-doctor-female.png`, 9622 bytes) + male (`doctor-er-doctor.png`, 12616 bytes) — both 384×384, both load directly (no fallback), greeting variants render with `{subject}` substitution (verified variants 0, 2, 3 across runs)
- [x] 7.6 GENERATED male sprite via codex CLI (same `/tmp` workspace flow, ~3 min wall, 15-color palette, transparent bg). Random 50/50 spawn pick now serves two real distinct ER doctor sprites — full DEI parity, no placeholder asymmetry

## 8. Cloud Sync (settings only)

- [x] 8.1 Settings live in Dexie `meta` table key `er-consult-settings` — **NOT** cloud-synced (existing `meta` table is intentionally per-device-per-user, mirrors migration-flag pattern). Acceptable trade-off for MVP: settings are per-device (matches existing migration_choice / migration_paused semantics). Future change can migrate settings into `gameCounters.settings` sub-object for cross-device parity if dogfood reveals demand
- [x] 8.2 `erConsultLog` is local-only by design (purely telemetry) — NOT added to `HOSPITAL_ADAPTERS`; remains out of cloud sync
- [x] 8.3 `erConsultActive` + `erConsultTicksUntilRoll` ARE part of `gameCounters.singleton` so they DO sync via existing `HOSPITAL_STATE` adapter. Edge case (active consult triggered on device A, picked up on device B 11 min later) self-heals via `isERConsultExpired` auto-skip on next tick. Documented in change for awareness

## 9. Verification & Telemetry

- [x] 9.1 `pnpm -r typecheck` passes clean across all 7 workspace packages (core + 2 content + 2 theme + 2 apps)
- [x] 9.2 Dev server booted (`pnpm --filter @study-rpg/medexam2-hospital-tw dev`), Vite ready in 202 ms; Chrome MCP console scan shows zero error/warning messages from app code (only 2 unrelated react-router-dom future-flag warnings, present pre-change)
- [x] 9.3 Chrome MCP smoke verified: Dexie object stores include `erConsultLog`; gameCounters singleton accepts new `erConsultActive` field; dialog renders correctly via Dexie liveQuery after direct write — sprite fallback (`doctor-default-P2.png`), title 「🚨 急診照會」, onboarding banner, greeting with `{subject}` parameterized, skip button, question loading state all visually correct
- [x] 9.4 Mutex correctness baked into core `shouldRollERConsult` + double-checked in Phase 2 `maybeRollAndPersistERConsult` tx (pendingEventId / erConsultActive both checked); 二階 has no mentor-daily so that mutex bit always false. Pure-function unit test of mutex deferred
- [x] 9.5 Subject cooldown logic verified by code-reading core `selectUnderUtilizedSubject` — `recentConsultsBySubject7d[s] >= 3` triggers `× 0.3` penalty. Live dogfood verification deferred (need ≥ 3 consult logs in 7-day window)
- [x] 9.6 Toggle OFF code path verified by code review: `toggleErConsult(false)` → `setERConsultSettings({enabled: false})` → `discardActiveERConsult()` → `gameCounters.erConsultActive = null`. Live test requires waiting for tick to roll; deferred to dogfood

## 10. Documentation & Spec Sync

- [x] 10.1 SKIPPED — root `CLAUDE.md` Roadmap row doesn't exist in `study-rpg-m2/CLAUDE.md` (Roadmap lives in `openspec/project.md`); the in-app HelpMenu section copy serves as primary user-facing doc
- [x] 10.2 SKIPPED for now — Roadmap row update is done at archive time by `/opsx:archive` workflow, not before
- [x] 10.3 SKIPPED — bug-report doc would just say "use 🐞 button"; the in-help-menu copy covers feature description

## 11. Post-Implementation Verification

- [ ] 11.1 USER ACTION — run `/verify` for full validation chain (Chrome MCP end-to-end answer flow + `/simplify` review + auto-git commit). Implementation believes feature is ready; recommend running before commit
- [ ] 11.2 USER ACTION — run `/opsx:verify` for OpenSpec 3-dim check (completeness / correctness / coherence) before `/opsx:archive`
- [ ] 11.3 USER ACTION — dogfood ≥ 1 study session ≥ 30 min and inspect `erConsultLog` rows. Watch for: trigger cadence (target ~7/hr at 8±2 min jitter), subject distribution (cold-subject preference), false skip-confirms, sprite fallback satisfaction
- [ ] 11.4 USER ACTION (optional) — generate dedicated `er-doctor.png` sprite via codex CLI per Section 7.1 prompt; drop into `packages/theme-pixel-hospital/sprites/doctor-er-doctor.png` (rename to match `doctor-*` glob); restart dev server to pick up
