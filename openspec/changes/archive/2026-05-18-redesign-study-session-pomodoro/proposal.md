## Why

Session C dogfood (2026-05-18) surfaced a UX mismatch in the 二階 hospital study session: the inherited「90 秒沒互動就 auto-pause」anti-cheat behavior comes from 一階's web-article reading loop where players naturally scroll/click while reading. In 二階 the「念書 session」is a pure pass-through timer — players are expected to be reading physical textbooks / writing on paper / studying away from the screen for 25–50 minutes at a stretch (Pomodoro-style). The current idle-pause actively punishes real study by forcing a manual「繼續唸書」click every 90s. Anti-cheat fallback is already covered by `reading-loop`'s「每分鐘最多 +1 屬性」rate cap, so removing the idle-timeout doesn't open a new exploit window.

A second small UX complaint: when a player switches to another tab to look up a reference and returns, the session stays paused and they must manually click「繼續唸書」. Visibility-return should auto-resume IF the pause was caused by visibility-hidden (not by manual pause or other reason).

## What Changes

- **BREAKING (controller API)** — Remove `idle-timeout` from `StudySessionPauseReason` union type. Code that branches on `pauseReason === 'idle-timeout'` will no longer compile.
- **BREAKING (controller API)** — Remove `idleTimeoutMs` option from `StudySessionControllerOptions`. Tests that pass this option must be updated.
- Remove all 4 activity-event listeners (`mousemove` / `keydown` / `touchstart` / `scroll`) and the `idleTimer` `setTimeout` mechanism.
- Add `lastPauseReason` closure variable tracked by `pause()`.
- Modify `onVisibilityChange()` to auto-resume when `document.visibilityState === 'visible' && state === 'paused' && lastPauseReason === 'visibility-hidden'`, calling `resume('visibility-return')`.
- Update UI copy that mentions 「閒置 ≥ 90 秒」 / 「90 秒會自動暫停」 in StudySessionPage paused banner, HelpMenu accordion section, V6MigrationModal copy.
- Update file-header comments in `study-session.ts`, `tick.ts`, `StudySessionPage.tsx` that reference idle-timeout anti-cheat.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `hospital-study-session`: REMOVED the 90s idle auto-pause requirement; MODIFIED the visibilitychange requirement to include auto-resume behavior keyed on `lastPauseReason`.

## Impact

- **Affected code** (5 files):
  - `packages/content-medexam2-tw/src/study-session.ts` — controller refactor (~50 LOC removed, ~15 LOC added)
  - `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx` — paused-banner copy + file header
  - `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` — accordion section copy
  - `apps/medexam2-hospital-tw/src/components/V6MigrationModal.tsx` — migration modal copy line
  - `apps/medexam2-hospital-tw/src/lib/tick.ts` — file-header + JSDoc comments
- **Affected specs** (1 file):
  - `openspec/specs/hospital-study-session/spec.md` — delta with REMOVED idle + MODIFIED visibility behavior
- **No DB schema change** — pure runtime behavior change
- **No cloud sync impact** — gameCounters fields unchanged
- **Anti-cheat fallback** — relies on existing `reading-loop` spec「每分鐘最多 +1 屬性」rate cap; no new defense layer needed
- **Out of scope** (separate changes):
  - F1 SPA fallback fix (capability `deploy-pipeline`)
  - tick.ts toast event reputation floor mismatch (capability `hospital-events` extension)
  - 一階 reading-loop idle policy review (`openspec/project.md` line 43 remains as-is; scoped to 一階's content pack)
