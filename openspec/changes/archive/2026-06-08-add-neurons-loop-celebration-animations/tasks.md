## 1. Feature B — streak-scaled correct-answer feedback (pure presentational, do first / lowest risk)

- [x] 1.1 Add a dogfood-tunable pure helper `streakFeedbackIntensity(streak): number` = `clamp(1 + streak * STREAK_INTENSITY_STEP, 1, STREAK_INTENSITY_MAX)` with named constants (initial: step 0.12, max 2.2). Place near the motion lib / QuizModal feedback path.
- [x] 1.2 Extend `SpikeTrainFiring` to accept an `intensity` prop that scales visual magnitude only (stroke width / glow / spike amplitude) — MUST NOT touch any timing token; reduced-motion path stays static.
- [x] 1.3 In `QuizModal` correct-answer flow, read the current streak (`getStreaks()` → `current`) and pass `streakFeedbackIntensity(current)` into the spike-train. Kept non-blocking (best-effort try/catch, never gates answer resolution).
- [x] 1.4 Unit-test `streakFeedbackIntensity`: monotonic increase, clamped at cap, returns 1 at streak 0.

## 2. Feature A — synced per-family celebration marker (sync surface)

- [x] 2.1 Add helper `lib/services/maze-celebration.ts`: `hasCelebrated(familyId)` + `markCelebrated(familyId)` reading/writing meta key `mazeSecondLapCelebrated:<familyId>` (ISO stamp). Exports `PER_FAMILY_CELEBRATION_KEYS` (single source for the allowlist). Set-once → metaAdapter first-write-wins suffices (no backfill post-pass; presence is all that matters).
- [x] 2.2 In `lib/sync/tables.ts`, extend `SYNCED_META_KEYS` by spreading `PER_FAMILY_CELEBRATION_KEYS` (derived from `FAMILY_IDS`, not hardcoded). Meta sync filter (`SYNCED_META_KEYS.has(key)`) now admits them.
- [x] 2.3 Bump R2 neurons bundle `SCHEMA_VERSION` 18 → 19 in `lib/sync/r2/bundles.ts` + add v19 history-comment entry (additive marker keys; reader-tolerant; v18 clients drop unknown keys). Updated 7 version-pin assertions in 4 bundle tests 18→19.
- [x] 2.4 Confirmed NO Dexie `.version()` change → `pnpm lint:dexie-fixtures` green (`[lint:dexie] OK`).

## 3. Feature A — completion celebration detection + render

- [x] 3.1 In `OverviewPage` (the single `useMaze` subscriber), hold a per-family `prevCompleteRef` (Map<familyId, boolean isComplete>); on each `mazeView` update detect families whose `target` went non-null → null this session.
- [x] 3.2 For each live-completed family, gate on `!(await hasCelebrated(familyId))`; if eligible, `await markCelebrated(familyId)` + `setCelebration({familyId,label,nonce})`. Ref set to complete BEFORE the async gate → idempotent against liveQuery re-fire.
- [x] 3.3 New `components/MazeCompletionCelebration.tsx`: `pointer-events:none` overlay over the maze band (MazeGrid wrapped in `position:relative`) composing `CelebrationHalo` (intensity 3) + `ParticleBurst` + a 「{科}・全腦點亮！」 banner. Auto-clears after 2200ms.
- [x] 3.4 Reduced-motion: `MazeCompletionCelebration` returns null under `useRespectsReducedMotion` → nothing animated; lit nodes remain as the static completed end-state.
- [x] 3.5 No retroactive backfill: detection fires ONLY on a live `false → true` complete transition with a prior observation (`had && wasComplete===false`); a family already `null` at first mount (`had===false`) does NOT celebrate.

## 4. Verification

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw test` (405 pass) + `pnpm --filter @study-rpg/neurons-tw typecheck` (clean) + `pnpm lint:dexie-fixtures` (OK) all green.
- [x] 4.2 Chrome MCP dev smoke (B): spike-train renders via `/motion-demo` (`stroke-width 1.5` @ intensity 1, formula `1.5×i`); intensity math unit-tested (`streakFeedbackIntensity(16)=2.2`) + wiring typecheck-verified → chain confirmed (streak 16 → 2.2 → 3.3). NOTE: a live-quiz spike screenshot wasn't deterministically captured — the random-quiz modal advanced questions between answer-click and DOM read (harness friction, not a defect); component+math+wiring each confirmed instead.
- [x] 4.3 Chrome MCP dev smoke (A): forced 解剖學 `settles` to completion (DEV `__db`) → live `target` non-null→null fired ONE celebration (banner `✨ DRG Sensory Afferent — Scout・全腦點亮！` + 46 overlay spans + synced marker written); reload → NO replay, marker persists. reduced-motion → overlay returns null (code-verified via `useRespectsReducedMotion`; OS pref not runtime-togglable via MCP).
- [x] 4.4 Sync round-trip (A): marker no-replay verified locally (reload). Full cross-device R2 round-trip NOT run in dev — dev R2 push fails by design (`onPushComplete` never fires on localhost, per project memory); cross-device covered by `SYNCED_META_KEYS` membership + bundle round-trip unit tests + first-write-wins presence semantics.
- [ ] 4.5 Prod (after merge): SPA three-piece check on the homepage route (in-app nav + direct URL + F5) per the SPA-routing discipline; spot-check A + B on prod build.

## 5. Ship

- [x] 5.1 `/simplify` pass (4 parallel review agents): applied 3 cleanups (dropped unused `celebration.familyId`, redundant `had` loop guard, redundant `markCelebrated` read-before-write); skipped altitude/efficiency suggestions with reasons. Tests + typecheck re-confirmed green.
- [x] 5.2 `/opsx:archive` — synced the 2 ADDED requirements into `openspec/specs/{neurons-maze-second-lap,neurons-motion-library}/spec.md` (validate --all 85/85), moved change to `archive/2026-06-08-...`, committed.
