# Design Notes — fix-er-consult-dialog-stay-open

## Goal

Decouple "DB state for active consult" from "dialog mount lifecycle" so the dialog can finish its reveal-and-close UX even after the service layer marks the consult resolved.

## Considered approaches

### A. Service-layer split — `recordAnswer` + `closeERConsult` (rejected)

Split `answerERConsult` into two: one records mastery/reward/log without clearing `erConsultActive`, second (new `closeERConsult`) clears the DB row. Dialog calls record on option click, calls close on auto-timer / button click.

**Why rejected**: invasive — touches service layer signatures, requires per-call-site refactor; introduces double-credit risk if user re-opens dialog before calling close (e.g., browser refresh) because mastery/reward already recorded but `erConsultActive` still set, so dialog re-mounts and another option click re-records. Would need a `resolved` flag added to `ERConsultActiveState` schema as additional guard.

### B. Sticky local-state in wrapper (chosen)

The dialog wrapper `ERConsultDialog` holds the most-recently-seen active state in `useState`. While `useLiveQuery` reports a value, local state mirrors it. When `useLiveQuery` transitions to null (because `answerERConsult` / `skipERConsult` cleared the DB), local state stays — the dialog keeps rendering from local. The dialog inner component receives an `onClose` callback; only that callback clears the local state, letting the wrapper return null and the dialog unmount.

**Why this is the right shape**: the service layer concern is "did the user resolve this consult" (yes — answer recorded / skipped / auto-skipped). The UX concern is "when does the modal go away" (after the user finishes reading the explanation or auto-timer fires). These are genuinely different lifecycle events; tying them together via shared DB state was the bug. Local React state is the right abstraction for "dialog visible to user."

Edge cases handled:
- **Browser close mid-explanation**: `erConsultActive` is already null in DB; on reload, wrapper renders nothing. The answer was recorded (mastery + log) so no data loss. User loses the ability to re-read the explanation in this session but bookmark feature covers re-study. Acceptable trade-off — rare edge case, no data corruption.
- **Auto-skip after 10 min**: `tick.ts` clears `erConsultActive` independently. If the user is mid-read when the tick fires, sticky local state preserves the dialog until they hit 「關閉」. The mastery/reward already recorded so closing later is fine.
- **Skip path**: `confirmSkip` calls `skipERConsult` (clears DB) then explicit `onClose()` — sticky local state cleared, dialog unmounts.
- **Settings toggle off mid-dialog**: `disableERConsult` clears DB; sticky local state preserves rendered dialog. User can still close via 「關閉」 / 跳過 buttons. Slight UX quirk but harmless — settings toggle effect kicks in for next consult.

## Component shape

```tsx
function ERConsultDialog(): JSX.Element | null {
  const counters = useLiveQuery(...)
  const dbActive = counters?.erConsultActive ?? null
  const [sticky, setSticky] = useState<ERConsultActiveState | null>(null)

  // Adopt new active from DB; do NOT clear sticky just because DB cleared
  useEffect(() => {
    if (dbActive) setSticky(dbActive)
  }, [dbActive])

  if (!sticky) return null
  return <ERConsultDialogInner active={sticky} onClose={() => setSticky(null)} />
}
```

Inner component receives `onClose: () => void`:
- `handlePickOption` correct path: `setTimeout(onClose, 2000)` (replaces existing no-op)
- `handlePickOption` wrong path: no auto-close (waits for 關閉 button)
- New 「關閉」 button JSX rendered when `revealed && !wasCorrect`
- `confirmSkip`: call `onClose()` after `await skipERConsult(active)`

`wasCorrect` derivation stays the same (`question.disputed || selectedOption === question.answer`) — local React state, preserved across DB transitions.

## Why no schema change

Adding `resolved?: boolean` to `ERConsultActiveState` would let us address the browser-close-mid-read case (open dialog on next load in revealed state). But:
1. It expands scope — schema migration, cloud sync, type ripple
2. The bookmark feature already covers re-read
3. Browser-close-mid-explanation is rare; correctness (no double-credit) matters more than convenience

Defer schema-extension follow-up to a separate change if usage data shows it's worth it.

## Visual reverify plan

Chrome MCP injection scenario (same path proven by `/verify` flow during fix-explanation-markdown-render):
1. Inject `erConsultActive` via raw IDB write
2. Reload page → dialog opens
3. Click wrong answer
4. **Verify**: explanation block visible with markdown rendered (selected wrong option red + correct option green + 解析 block with `### / **bold** / bullets`)
5. **Verify**: 「關閉」 button visible
6. Click 關閉 → dialog unmounts
7. Reload → no dialog reopens (DB already cleared)

Repeat for correct answer (auto-close after 2s) and skip path (immediate close).
