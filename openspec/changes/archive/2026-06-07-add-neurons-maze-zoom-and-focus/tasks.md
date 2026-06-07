## 1. Pre-flight code-verification (design Open Questions — confirm before building)

- [x] 1.1 Confirm settle auto-triggers on threshold in `lib/maze/useMaze.ts` (`affordableSettles(earned) > settles` → `reconcileSettles`) and that an answer's accrual can be diffed via `affordableSettles(before)` vs `(after)` — basis for the QuizModal escalation
- [x] 1.2 Confirm reading footprint: `lib/services/reading-timer.ts` fires `meta['totalStudyMinutes']++` (keep global) + the energy faucet (change); confirm `achievements` `study` reads `totalStudyMinutes` (global, unaffected) and DMN is expedition-bound (no reading coupling) → only `economy.ts` + `reading-timer.ts` change
- [x] 1.3 Confirm zero-schema: no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no new `SYNCED_META_KEYS` key needed; per-subject reading reuses existing `maze:<familyId>:earned`. If any persistence is required, STOP and surface (re-scope) rather than bump silently

## 2. Reading becomes per-subject (economy + timer)

- [x] 2.1 `lib/maze/economy.ts`: remove `accrueReadingEnergyActiveFamilies` (orphaned split helper); reading now uses the existing `accrueMazeEnergy(familyId, READING_MINUTE_ENERGY)`
- [x] 2.2 `lib/services/reading-timer.ts`: the session carries a `familyId`; `start(familyId)` stores it; per game-minute fire `(a) totalStudyMinutes++` (UNCHANGED) + `(b) accrueMazeEnergy(currentFamilyId, READING_MINUTE_ENERGY)`; switching family = `stop()` then `start(other)` (one subject at a time); keep all anti-cheat (visibilitychange / 90s idle / ≤ +1/min)
- [x] 2.3 `lib/hooks/useReadingTimer.ts`: expose the current reading `familyId` + `start(familyId)`
- [x] 2.4 Starting a reading session emits a sticky camera focus to that subject (wire to the maze-focus bus from §3)

## 3. Camera: mobile touch + sticky manual focus + recenter

- [x] 3.1 `lib/maze/maze-focus.ts`: extend `emitMazeFocus(familyId, { manual?: boolean })` (manual = sticky, no expiry) + add `emitMazeRecenter()` / `onMazeRecenter`
- [x] 3.2 `components/maze/MazeGrid.tsx`: generalize the focus state — sticky manual focus (no `until`) takes precedence over the time-boxed answer auto-focus (`focusRef`/`manualUntilRef`); answer auto-focus does NOT interrupt active sticky focus
- [x] 3.3 `MazeGrid.tsx`: add a 「全覽 / recenter」 button overlay that clears sticky focus and frames the whole map (`emitMazeRecenter`)
- [x] 3.4 `MazeGrid.tsx`: add touch handlers — two-finger pinch-zoom (anchor on midpoint), one-finger pan, double-tap recenter; write the same `targetRef`/`camRef` the wheel/drag path uses; set `manualUntilRef` so contextual framing yields
- [x] 3.5 `MazeGrid.tsx`: scope gestures against page scroll — `touch-action: none` on the canvas + `preventDefault` only inside the maze touch handlers (panel already has `overscroll-behavior` containment)
- [x] 3.6 `MazeGrid.tsx`: continuous zoom clamped between whole-map fit and single-cluster framing; NOT persisted (default framing on remount); reduced-motion → instant camera cut

## 4. FamilyPicker reading + focus hub; remove the global reading toggle

- [x] 4.1 `components/FamilyPicker.tsx`: add a per-family 📖 閱讀 entry on each card (starts that subject's reading via the §2 timer; reflects active-reading state for the selected subject)
- [x] 4.2 `FamilyPicker.tsx`: tapping a family card emits a sticky camera focus to that family (`emitMazeFocus(familyId, { manual: true })`)
- [x] 4.3 `routes/OverviewPage.tsx`: remove the global 「📖 開始閱讀」 toggle from the CTA toolbar (keep 🎲 random + ⚔️ 出征); wire `onStartReading(familyId)` + `onFocusFamily(familyId)` down to the FamilyPicker; keep the 累積閱讀 status chip (reads global `totalStudyMinutes`)

## 5. QuizModal energy feedback strip + settle escalation

- [x] 5.1 `components/QuizModal.tsx`: add a non-interactive `EnergyFeedbackStrip` (DOM/CSS — family sprite + `walkerFraction` progress bar + `+N energy` label) shown above the 詳解 AFTER a correct answer; mobile ~64px / desktop ~120px; `pointer-events:none`; reduced-motion → static cue
- [x] 5.2 `QuizModal.tsx`: detect a settle-threshold crossing on the correct answer (`affordableSettles(before)` vs `(after)` for the family); on crossing, escalate the strip to a one-shot "walker advances one node" replay (the real settle/pull is done by the homepage `useMaze` reconcile — the strip never performs the settle)
- [x] 5.3 `QuizModal.tsx`: bound the escalation — implemented as a one-shot CSS `@keyframes energy-advance` tween (the lighter bespoke path per design D4, no 2nd canvas/rAF), gated off for reduced-motion; renders only the focused family's sprite

## 6. Tests (Vitest)

- [x] 6.1 economy: reading accrues entirely to the chosen family (no split); `accrueReadingEnergyActiveFamilies` removed
- [x] 6.2 reading-timer: session-switch path — switching subject stops the prior session, does not double-count `totalStudyMinutes`, and routes per-minute energy to the new family only
- [x] 6.3 settle-crossing detection helper: `affordableSettles(before)` vs `(after)` correctly flags exactly the answers that cross a node threshold (drives the escalation)
- [x] 6.4 maze-focus: sticky manual focus takes precedence over time-boxed auto-focus; recenter clears sticky

## 7. Verify

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` green
- [x] 7.2 `pnpm lint:dexie-fixtures` is a no-op (no `.version()` bump) — confirms zero Dexie footprint
- [x] 7.3 Mobile baseline + RWD: Chrome MCP class-override probe (`chrome_mcp_rwd_probe.md`; resize_window is unreliable) on 360 / 414 / 768 — pinch/pan/double-tap work, gestures don't hijack page scroll, FamilyPicker 📖 reading + focus reachable, QuizModal strip stays compact and doesn't push 詳解 below the fold
- [x] 7.4 Chrome MCP functional smoke (dev): global reading toggle gone / 11 per-family 📖 reading buttons / 🔭 全覽 recenter / `canvas touch-action:none` present; per-subject reading toggle→switch→stop = exactly one active at a time; family-card focus tap (no throw); correct answer → `EnergyFeedbackStrip` renders 「⚡ +N 能量 · <family>」 above 詳解, `pointer-events:none`, ≤72px; console clean. (Escalation 「推進一格」 visual NOT cleanly reproduced in automation — test-harness `__maze` writes raced the live reconcile; the crossing logic is unit-tested in 6.3, render is a trivial branch on the proven strip — visual-confirm in `/verify` or play.)
- [ ] 7.5 SPA 三件套 on prod after deploy (`/` in-app nav + direct URL + F5); console clean
- [ ] 7.6 Confirm grep: built bundle has no new synced meta key; `totalStudyMinutes` still increments under reading (achievements/leaderboard/character-card unaffected)
