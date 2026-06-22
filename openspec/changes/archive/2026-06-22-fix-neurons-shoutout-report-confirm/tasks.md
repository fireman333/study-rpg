# Tasks — fix-neurons-shoutout-report-confirm

## 1. Two-step report on the neurons board

- [x] 1.1 `ShoutoutBoardPage.tsx`: add `reportTarget` state; card report control sets the pending target instead of calling `handleReport` directly (`onReport={setReportTarget}`)
- [x] 1.2 `handleReport` clears `reportTarget` and remains the only caller of `reportShoutout()` (fired from the dialog's confirm button)
- [x] 1.3 Add `ReportConfirmModal` (reuses `overlayStyle` / `modalStyle` / `secondaryBtnStyle` / `dangerBtnStyle`; `role="alertdialog"`); previews the targeted message; 「取消 / 確定檢舉」 + backdrop dismiss
- [x] 1.4 Add `reportPreviewStyle` for the message preview box

## 2. Verify

- [x] 2.1 `tsc --noEmit` clean (neurons app)
- [x] 2.2 `pnpm --filter @study-rpg/neurons-tw test` green (637 tests; presentation-only guard, no new component-test harness introduced — consistent with existing neurons UI changes)
- [x] 2.3 `pnpm --filter @study-rpg/neurons-tw build` clean

## 3. Deploy + verify (owner-gated)

- [ ] 3.1 Merge `track-neurons` → `main` and confirm CF Pages + dexie-fixture-lint green
- [ ] 3.2 Live verify on `med-study-rpg.com/neurons/shoutout`: tapping the report flag opens the confirm dialog (does not submit); 確定檢舉 submits; 取消 submits nothing
