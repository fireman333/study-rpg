## 1. Wrapper sticky-state plumbing

- [x] 1.1 In `apps/medexam2-hospital-tw/src/components/ERConsultDialog.tsx`, add `useState<ERConsultActiveState | null>(null)` for `sticky` inside `ERConsultDialog` wrapper
- [x] 1.2 Add `useEffect` that mirrors `dbActive` → `sticky` only when `dbActive` is non-null (never clear sticky from this effect)
- [x] 1.3 Render inner component from `sticky` instead of `dbActive`; pass new `onClose={() => setSticky(null)}` prop
- [x] 1.4 Early-return `null` when `sticky` is null

## 2. Inner component close wiring

- [x] 2.1 Extend `ERConsultDialogInner` props with `onClose: () => void`
- [x] 2.2 In `handlePickOption` correct branch, replace the no-op `setTimeout` callback with `setTimeout(onClose, 2000)`
- [x] 2.3 In `confirmSkip`, call `onClose()` after `await skipERConsult(active)`
- [x] 2.4 Add 「關閉」 button JSX, visible only when `revealed && wasCorrect === false` (i.e., wrong answer path); `onClick={onClose}`; reuse `.er-consult__skip-btn` styling or add new `.er-consult__close-btn` if visually distinct is needed
- [x] 2.5 Compute `wasCorrect` as a derived value inside the inner component (already used by `reply` useMemo — extract to a const or memo so the close button can read it too)

## 3. Spec delta

- [x] 3.1 Modify `openspec/changes/fix-er-consult-dialog-stay-open/specs/er-consultation/spec.md` — clarify in MODIFIED Requirement that dialog SHALL remain rendered after answer recording until user dismisses (correct = auto-close 2s; wrong = user clicks 「關閉」; skip = immediate clear)
- [x] 3.2 Add new Scenario explicitly covering wrong-answer reveal-and-close flow (dialog stays open after answer recorded, 關閉 button appears, click closes)
- [x] 3.3 Add Scenario for correct-answer 2-second auto-close lifecycle
- [x] 3.4 Document edge case: browser refresh mid-explanation does NOT reopen dialog (DB already cleared); answer was recorded so no data loss

## 4. Typecheck & build

- [x] 4.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` green
- [x] 4.2 `pnpm -r typecheck` green (catch any cross-package fallout — should be none)

## 5. Smoke testing (Chrome MCP)

- [x] 5.1 Start dev server, navigate to live app, inject `erConsultActive` via raw IDB write (same recipe used in fix-explanation-markdown-render verify), reload
- [x] 5.2 **Wrong answer path** — click obviously-wrong option → verify: explanation block visible with markdown rendered (per the prior change), 「關閉」 button visible, dialog does NOT auto-close → click 關閉 → dialog unmounts → reload → no dialog reopens
- [x] 5.3 **Correct answer path** — inject again, click correct option → verify: gratitude reply shown, toast `+X 💰 / +X 聲望`, dialog auto-closes after ~2s
- [x] 5.4 **Skip path** — inject again, click 跳過 → confirm dialog → click confirm → main dialog closes immediately
- [x] 5.5 **Onboarding overlay** — first run shows onboarding; click option dismisses onboarding + records answer + shows explanation (combined behavior); 關閉 button still works

## 5.5 UI polish (added after first visual reverify exposed two issues — user 2026-05-19)

- [x] 5.5.1 `.explanation-markdown` add `text-align: left` to override `.modal-card { text-align: center }` inheritance — bullets in 解析 block now left-aligned (per bullet-list design convention). Also corrects quiz modal explanation (same root cause, same fix).
- [x] 5.5.2 `.er-consult__confirm-cancel` upgrade from `background: transparent` (blended into dark backdrop) to warm-beige solid bg + dark text + bold — visually clear "secondary action" against the red 跳過 OK button. No layout change.

## 6. Verify

- [x] 6.1 `openspec validate fix-er-consult-dialog-stay-open` green
- [x] 6.2 Dead code audit — confirm no orphan imports / unused state vars added

## 7. Commit (gated)

- [x] 7.1 User explicit confirm before `git commit`
- [x] 7.2 Explicit `git add <paths>`; verify `git diff --cached --name-status` only contains this change scope
- [x] 7.3 Commit message template:
      ```
      fix(hospital-er-consult): dialog stays open after wrong answer (verify-passed)

      Root cause: answerERConsult cleared erConsultActive in DB
      immediately on click; Dexie liveQuery race-unmounted the
      dialog before user could read the explanation. Spec L148/L174
      mandate dialog reveal + 關閉 button before close.

      Fix: wrapper holds sticky local state; inner dialog gets
      onClose callback. Correct = auto-close 2s; wrong = user
      clicks 關閉; skip path calls onClose after skipERConsult.

      Service layer untouched; no schema change. Edge case (browser
      close mid-read) handled by existing cleared DB state.

      OpenSpec change: fix-er-consult-dialog-stay-open
      ```

## 8. Archive (deferred to user)

- [x] 8.1 `/opsx:archive` after commit
