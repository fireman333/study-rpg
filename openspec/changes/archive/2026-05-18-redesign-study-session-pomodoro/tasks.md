## 1. Core controller refactor (`packages/content-medexam2-tw/src/study-session.ts`)

- [x] 1.1 Update file-header JSDoc lines 4–8: remove「2. ≥ 90s without mousemove / keypress / touchstart / scroll → auto-pause」; rewrite「Encapsulates the reading-mode lifecycle ...」comment to reflect visibility-only + auto-resume policy.
- [x] 1.2 Remove `'idle-timeout'` from `StudySessionPauseReason` union (line 26).
- [x] 1.3 Remove `idleTimeoutMs?: number` option from `StudySessionControllerOptions` (line 38–42, including JSDoc).
- [x] 1.4 Remove `DEFAULT_IDLE_TIMEOUT_MS` const (line 63).
- [x] 1.5 Remove `ACTIVITY_EVENTS` const (lines 65–70).
- [x] 1.6 Remove `idleTimer` closure variable + `clearIdleTimer()` + `armIdleTimer()` + `onActivity()` helper functions (lines 78, 83–96, 98–100).
- [x] 1.7 Add `let lastPauseReason: StudySessionPauseReason | null = null` closure variable near the `state` declaration.
- [x] 1.8 Modify `attachListeners()` to drop the `for (const evt of ACTIVITY_EVENTS)` loop. Keep only the `visibilitychange` listener registration.
- [x] 1.9 Modify `detachListeners()` to drop the activity-event teardown loop. Keep only the `visibilitychange` teardown.
- [x] 1.10 Modify `onVisibilityChange()` body:
    - When `visibilityState === 'hidden' && state === 'active'` → call `pause('visibility-hidden')` (existing).
    - When `visibilityState === 'visible' && state === 'paused' && lastPauseReason === 'visibility-hidden'` → call `resume('visibility-return')`.
- [x] 1.11 Modify `pause(reason)`: set `lastPauseReason = reason` BEFORE invoking `opts.onPause?.(reason)`.
- [x] 1.12 Modify `resume(reason)`: clear `lastPauseReason = null` after the state transition (before `opts.onResume?.(reason)` is fine either way).
- [x] 1.13 Modify `stop()`: clear `lastPauseReason = null` after the state transition. Remove `clearIdleTimer()` call.
- [x] 1.14 Modify `start()`: remove `armIdleTimer()` call.
- [x] 1.15 Modify `dispose()`: remove `clearIdleTimer()` call (already drops `clearIdleTimer` from line 156); keep `detachListeners()` + reset state.

## 2. App-side wiring touch-ups (no behavior change)

- [x] 2.1 `apps/medexam2-hospital-tw/src/lib/tick.ts` line 7 — file-header JSDoc: rewrite「Anti-cheat (visibility + idle); this module owns DB writes + tier-upgrade evaluation.」to drop idle reference.
- [x] 2.2 `apps/medexam2-hospital-tw/src/lib/tick.ts` line 289 — `getStudySessionController` JSDoc: rewrite「Anti-cheat (visibility + idle 90s) handled by the controller」to drop idle reference.
- [x] 2.3 `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx` line 7 — file-header JSDoc: rewrite「Anti-cheat: visibility-hidden + 90s idle auto-pause are handled by the content-pack ...」to drop idle reference.

## 3. UI copy updates

- [x] 3.1 `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx` line 112 — change paused-state banner from「⏸️ 已暫停（離開分頁或閒置 ≥ 90 秒）」to「⏸️ 已暫停（離開分頁，回來會自動繼續）」.
- [x] 3.2 `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx` lines 133–137 — review paused-state hint text below the banner ("移動滑鼠或點任意處不會自動繼續，請按「繼續唸書」回到 active"). Rewrite to reflect that auto-resume now happens on tab return; manual click is only needed if the player paused themselves (not for tab-switch pauses). New copy suggestion: 「自動暫停（離開分頁）會在回到分頁時自動繼續。若是手動暫停，請按「繼續唸書」回到 active。」
- [x] 3.3 `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` line 29 — section「📖 唸書 session — 進度的唯一引擎」copy: replace「離開分頁或閒置 90 秒會自動暫停。」with「離開分頁會自動暫停，回到分頁自動繼續；手動暫停則需主動「繼續唸書」。」
- [x] 3.4 `apps/medexam2-hospital-tw/src/components/V6MigrationModal.tsx` line 60 — replace「90 秒會自動暫停」with「離開分頁會自動暫停」.
- [x] 3.5 Grep verify after edits — `grep -rn "閒置\|90 *秒\|idle.*pause" apps/medexam2-hospital-tw/src` SHOULD return zero user-facing matches (only `*--idle` CSS classes, `'idle'` state literals, and `sync.*'idle'` string constants are acceptable).

## 4. Validation + smoke verify

- [x] 4.1 Run `pnpm -r typecheck` — verify the breaking change cascades cleanly (only `study-session.ts` itself should produce zero errors; no app-side caller should need updating).
- [x] 4.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw build` — verify production build succeeds.
- [x] 4.3 Run `pnpm --filter @study-rpg/medexam2-hospital-tw dev` locally (port 5174). Open Chrome MCP smoke test:
    - **T1** — click 開始唸書, wait 95s with no MCP interaction, verify session remains active (idle removed).
    - **T2** — click 開始唸書, stub `document.visibilityState = 'hidden'` + dispatch visibilitychange, verify pause → un-stub to `'visible'` + dispatch, verify auto-resume to active with `currentSessionStartedAt` non-null again.
    - **T3** — click 開始唸書, click 暫停 (manual pause), then stub hidden + visible cycle, verify state stays paused (manual lock).
- [x] 4.4 Run `openspec validate redesign-study-session-pomodoro` — confirm spec delta still valid.
- [x] 4.5 Manual visual check — open StudySessionPage at active / paused / idle states, confirm banner copy reads as updated (no stale「90 秒」text anywhere).

## 5. Spec sync + archive prep

- [x] 5.1 Run `/opsx:verify` to confirm coherence (proposal ↔ design ↔ specs ↔ tasks all consistent).
- [ ] 5.2 Run `/opsx:archive redesign-study-session-pomodoro` (will prompt for sync gate — confirm sync of delta into main `openspec/specs/hospital-study-session/spec.md`).
- [ ] 5.3 Verify post-archive: `openspec/specs/hospital-study-session/spec.md` no longer contains the removed requirement; new requirement is present with all 5 scenarios.
- [ ] 5.4 Commit (per Curator rules — wait for user explicit confirmation before `git commit`).
