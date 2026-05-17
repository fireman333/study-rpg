## Context

The 二階 hospital `StudySessionController` (in `packages/content-medexam2-tw/src/study-session.ts`) inherited its anti-cheat model from 一階's `reading-loop` capability: `visibilitychange` auto-pause + 90-second idle (no `mousemove` / `keydown` / `touchstart` / `scroll`) auto-pause. These were appropriate when「reading」meant scrolling through an article in the browser. In 二階 the「念書 session」is a pure timer with no in-browser interaction expected — the player reads a paper book or writes on paper while the timer accumulates revenue / reputation. Session B/C dogfood (2026-05-17 / 18) confirmed the 90s idle pause fires within a real study window and forces the player to re-click「繼續唸書」repeatedly.

Anti-cheat is still desirable but already enforced by `reading-loop`'s normative rate cap「每分鐘最多 +1 屬性」(currently `MAX_ATTRIBUTE_PER_MINUTE = 1` applied at the tick scheduler level). Even with idle-timeout removed, a player who lets the session run while away from the keyboard can only accumulate at most the rate cap × wall-clock minutes; the upside of leaving it running matches the upside of running a legitimate Pomodoro session.

The secondary issue — visibility-return failing to auto-resume after a tab switch — is a separate small ergonomic gap that this change fixes in the same controller refactor.

## Goals / Non-Goals

**Goals:**
- Remove the 90s idle auto-pause so a player can leave the session running while reading a physical textbook for 25–50+ minutes without interruption.
- When the tab regains visibility AND the session was paused specifically because of `visibility-hidden`, auto-resume without requiring a manual click.
- Preserve the player's intent: a manual pause survives a tab switch (i.e. switching away and back does NOT silently resume a manually-paused session).
- Keep the controller's API otherwise stable — `onStart` / `onPause` / `onResume` / `onStop` callback shapes unchanged so `apps/medexam2-hospital-tw/src/lib/tick.ts` wiring continues to work.

**Non-Goals:**
- Modifying 一階's `reading-loop` controller or its idle policy (different content pack, different UX).
- Touching `openspec/project.md` line 43 (the「reading timer 必須抓 visibilitychange + idle > 90s」note remains as-is, scoped to 一階).
- Adding new anti-cheat layers beyond what `reading-loop` rate cap already provides.
- Adding Pomodoro-specific features (break cycles, notifications, document.title countdown). Those are separate enhancements deferred to a future change.
- Migrating existing sessions / state (`currentSessionStartedAt` field semantics unchanged).
- Fixing the F1 SPA-fallback bug or the tick.ts toast-event reputation-floor mismatch — both tracked separately.

## Decisions

### D1: Remove idle-timeout entirely, do not just lengthen the threshold

**Choice:** Strip out `ACTIVITY_EVENTS`, `armIdleTimer`, `clearIdleTimer`, `onActivity`, `idleTimer`, `idleTimeoutMs` option, and `'idle-timeout'` from the `StudySessionPauseReason` union.

**Alternative considered:** Keep the mechanism but lengthen the threshold (e.g., 30 minutes). Rejected — the player intent is「stop punishing offline study」, and any threshold short of「never」still introduces the「why did my timer pause again?」surprise. Reading-loop's rate cap covers the worst-case exploit anyway.

**Rationale:** Pure removal simplifies the controller (~50 LOC drop), eliminates 4 document event listeners, and matches the player's mental model of a Pomodoro timer. The TypeScript-level breaking change (`'idle-timeout'` removed from `StudySessionPauseReason`) is acceptable — current callers (`tick.ts`, `StudySessionPage.tsx`) don't branch on this reason; only the controller's internal `pause()` call references it, and that call site disappears.

### D2: Track `lastPauseReason` in controller closure for auto-resume

**Choice:** Add a `let lastPauseReason: StudySessionPauseReason | null = null` closure variable. Set it inside `pause()` before invoking `opts.onPause?.(reason)`. Read it inside `onVisibilityChange()` when handling the `visibility-visible` branch. Clear it inside `resume()` (to `null`) and inside `stop()` (to `null`).

**Alternative considered:** Hoist `lastPauseReason` to the public API (e.g., expose via `getPauseReason()` getter). Rejected — internal state, no external caller needs it. Keeping it in closure preserves encapsulation.

**Alternative considered:** Pass `pauseReason` through `opts.onPause` and let the app store it, then check via a new opt callback. Rejected — leaks controller internals into app code; the auto-resume decision lives naturally inside `onVisibilityChange`.

### D3: Auto-resume only fires for `visibility-hidden` pauses

**Choice:** Inside `onVisibilityChange()`:
```ts
if (document.visibilityState === 'visible' && state === 'paused' && lastPauseReason === 'visibility-hidden') {
  resume('visibility-return')
}
```
Manual pause (reason `'manual'`) → stays paused regardless of subsequent tab switches.

**Rationale:** Preserves the player's explicit intent. If a player pressed「暫停」, they want the session to remain paused — a tab switch unrelated to the pause action shouldn't silently un-pause it. The `lastPauseReason` check enforces this contract.

### D4: Keep `visibility-hidden` auto-pause behavior unchanged

**Choice:** The existing `pause('visibility-hidden')` branch fires when `document.visibilityState === 'hidden' && state === 'active'`. No change.

**Rationale:** Session C user feedback explicitly requested「離開分頁應該設計成暫停計時」— the existing pause-on-hidden behavior already does this. Only the resume side needs the new logic.

### D5: Add `resume('visibility-return')` reason for telemetry parity

**Choice:** `'visibility-return'` is already a member of `StudySessionResumeReason` union (line 27 of `study-session.ts`). Reuse it for the auto-resume call — no new enum value.

**Rationale:** Existing telemetry-ready enum value already exists. App-side callbacks (`onResume: () => void markSessionStart()`) ignore the reason but pass-through correctness is preserved.

### D6: Drop `idleTimeoutMs` from `StudySessionControllerOptions` (BREAKING)

**Choice:** Remove the entire option. Any test that passed `idleTimeoutMs: 100` for fast-iteration testing of the old idle pause must be updated or deleted.

**Alternative considered:** Keep `idleTimeoutMs` but make it a no-op for backward compatibility. Rejected — silent no-op is a debugging trap; cleaner to fail the compile so callers update their call sites consciously.

**Rationale:** The option's only purpose was tunable idle threshold. With idle gone, the option is meaningless. Tests for this behavior must be replaced with tests for the new visibility-auto-resume logic (covered in tasks).

### D7: UI copy strategy

Touch 4 copy strings:
- `StudySessionPage.tsx:112` paused banner: 「⏸️ 已暫停（離開分頁或閒置 ≥ 90 秒）」 → 「⏸️ 已暫停（離開分頁，回來自動繼續）」
- `HelpMenu.tsx:29` accordion section: drop「閒置 90 秒會自動暫停」, replace with「離開分頁會自動暫停、回來自動繼續」
- `V6MigrationModal.tsx:60` migration copy: drop「90 秒會自動暫停」, replace with「離開分頁會自動暫停」（auto-resume not material to v6 migration story）
- File-header / JSDoc comments in `study-session.ts:7-8`, `tick.ts:7`, `tick.ts:289`, `StudySessionPage.tsx:7` — reflect the new policy

**Rationale:** Spec-level deletion + UI copy drift is the #1 lesson from Drug Helper v1.4.x sequence — keep them in sync in one change to prevent confusing user-facing text after the behavior change ships.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Player leaves session running overnight while sleeping → 8+ hours of accumulated revenue / reputation | `reading-loop` rate cap「每分鐘最多 +1 屬性」already bounds the per-minute upside; the absolute total grows linearly with wall-clock minutes but matches what a legitimate marathon study session would yield |
| Anti-cheat regression: prior 「閒置 ≥ 90 秒」 was the only mechanism against AFK accumulation | `visibility-hidden` auto-pause still fires if player switches tabs; only fully-foreground-AFK scenarios are now uncapped, and the rate cap holds those in line |
| TypeScript breaking change (`StudySessionPauseReason` union narrowed) | Single-package consumer (`apps/medexam2-hospital-tw`); searched + confirmed no external caller branches on `'idle-timeout'`. Compile error will be obvious if any new branch is added during this change |
| UI copy missed somewhere causes player confusion (says「90 秒」but behavior changed) | Tasks.md includes explicit grep verification step (`grep -rn "90.*秒\|閒置" apps/medexam2-hospital-tw/src` returns 0 matches in user-facing text) |
| Auto-resume fires unexpectedly when a player wanted manual control | `lastPauseReason` check (D3) ensures auto-resume only triggers for `visibility-hidden` pauses; manual pauses survive tab switches |
| Test coverage gap for new auto-resume behavior | Tasks.md includes new unit tests in `packages/content-medexam2-tw/src/__tests__/study-session.test.ts` (or equivalent location) covering 4 cases: visibility-hidden→auto-resume / manual-pause-survives-visibility-cycle / start-active-state-after-visibility-cycle / multiple-tab-switches-don't-double-resume |
| `openspec/project.md` line 43 becomes stale w.r.t. 二階 behavior | Documented in proposal「Out of scope」; flagged for future reading-loop spec author to revisit. project.md is project-wide context, not a normative spec |

## Migration Plan

No data migration required — this is a pure runtime behavior change. Deployment plan:

1. Land code changes (controller + UI copy + JSDoc).
2. Land spec delta in `openspec/specs/hospital-study-session/spec.md` via OpenSpec sync.
3. Standard CI build → GitHub Pages deploy.
4. Existing `gameCounters.currentSessionStartedAt` semantics unchanged — players with an active session at deploy time keep accumulating; players with a paused session at deploy time still see「⏸️ 已暫停（離開分頁，回來自動繼續）」copy but their `lastPauseReason` is unrecoverable (was never persisted) — auto-resume will not fire for these legacy paused sessions because the new closure variable starts at `null`. Acceptable trade-off (paused sessions are rare and a single manual「繼續唸書」recovers).
5. No rollback complexity — revert the commit and deploy reverts behavior.

## Open Questions

None. Design decisions confirmed by user pre-propose (Session C transcript): (a) remove idle entirely; (b) visibility-hidden → pause, visibility-visible → auto-resume only if `lastPauseReason === 'visibility-hidden'`.
