# fix-er-consult-dialog-stay-open

## Why

Live dogfood reveals that the ER consult dialog **unmounts before the user can read the explanation** on wrong-answer path, violating `er-consultation` spec L148 / L174:

> Wrong answer → reveal correct option + explanation; show 「關閉」 button.
> The dialog SHALL reveal correct option + explanation before allowing close.

### Root cause

`answerERConsult` in `apps/medexam2-hospital-tw/src/services/er-consultation.ts:296` unconditionally clears `gameCounters.erConsultActive` after recording mastery / reward / log. The dialog wrapper `ERConsultDialog` subscribes to `gameCounters` via Dexie `useLiveQuery` and returns `null` the moment `erConsultActive` becomes null — race-condition with the inner component's `setRevealed(true)` local state. User sees a brief flash, never gets to read the explanation.

Also missing entirely from current implementation: a 「關閉」 button for wrong-answer path. Spec L148 mandates one. Code path for wrong answer has no auto-close timer and no manual close UI — the only way the dialog ever closes is the unmount race itself.

## What Changes

Hold the previously-seen active state in React `useState` inside the wrapper. When `useLiveQuery` reports null but local state still has an active, keep rendering — let the inner component finish its reveal-and-close flow on its own terms.

- Correct answer path: existing 2-second `setTimeout` no-op gets a real callback (clear local sticky state → dialog unmounts).
- Wrong answer path: new 「關閉」 button appears alongside the explanation; click clears local sticky state → dialog unmounts.
- Skip path: `confirmSkip` calls the same local-clear callback after `skipERConsult` (which still clears DB state).

**Service layer untouched** — `answerERConsult` / `skipERConsult` / `disableERConsult` keep their existing semantics (clear `erConsultActive` in DB after recording). No schema changes. No new DB field.

## Impact

- Affected specs: `er-consultation` (clarify dialog stay-open + 關閉 button requirements that are already implied but currently violated)
- Affected code: `apps/medexam2-hospital-tw/src/components/ERConsultDialog.tsx` only
- 一階 medexam-tw unaffected (no ER consult feature)
- No data migration; existing in-flight `erConsultActive` rows continue to work
- No bundle delta
- Edge case — user closes browser mid-explanation: on next load `erConsultActive` is null (cleared by `answerERConsult` already), dialog does NOT reopen. The answer was recorded so no double-credit. This is acceptable behavior change vs. theoretical pre-fix behavior (which also never let user finish reading anyway). For users who want to re-read explanations, the existing bookmark feature applies.
