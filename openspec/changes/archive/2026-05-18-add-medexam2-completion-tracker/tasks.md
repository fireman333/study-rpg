## 1. Pool size + completion helper

- [x] 1.1 Add `loadPoolSizeMap(): Promise<Map<SubjectId, number>>` export in `apps/medexam2-hospital-tw/src/lib/quiz.ts` — derive from existing `bySubject` cache; idempotent on repeat calls
- [x] 1.2 Create `apps/medexam2-hospital-tw/src/lib/completion.ts` exposing `useCompletionMap(): Map<SubjectId, { answered: number; total: number }> | undefined`
  - Internally: `useLiveQuery(() => db.questionHistory.toArray(), [])` → group by `subjectId` → `new Set(rows.map(r => r.questionId)).size` as `answered`
  - Merge with `loadPoolSizeMap` result (loaded once in `useEffect`); return `undefined` until both ready
  - Return type stable across renders (memoize map shape)
- [x] 1.3 Manual smoke: open Chrome MCP, log `useCompletionMap()` output for one subject in DEV, confirm `answered` and `total` are non-zero integers

## 2. RecruitmentBanner completion chip

- [x] 2.1 Extend `RecruitmentBannerProps` in `apps/medexam2-hospital-tw/src/components/RecruitmentBanner.tsx` with `completion?: { answered: number; total: number }`
- [x] 2.2 Render `<span className="banner__completion-chip">✅ {answered} / {total}</span>` as sibling of existing `.banner__due-chip` (only when `completion` prop present)
- [x] 2.3 Add 100% variant: when `answered === total && total > 0`, swap chip class to `banner__completion-chip--complete` and icon to `🏆`
- [x] 2.4 Add `.banner__completion-chip` + `.banner__completion-chip--complete` rules in `apps/medexam2-hospital-tw/src/styles.css` next to existing `.banner__due-chip` block (~line 1139)
- [x] 2.5 Wire `useCompletionMap` in `apps/medexam2-hospital-tw/src/pages/HomePage.tsx`; pass `completion={completionMap?.get(s.id)}` to each `<RecruitmentBanner>`

## 3. QuizModal Skip-SRS toggle

- [x] 3.1 Add `const [skipSrs, setSkipSrs] = useState(false)` in `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`
- [x] 3.2 Render a toggle (checkbox + label `跳過 SRS（純隨機新題）` + helper line `（不影響 SRS 排程，到期題仍會記）`) in the modal header / controls region; `role="switch"`, `aria-checked={skipSrs}`
- [x] 3.3 Modify `loadNextQuestion(forSubject, resetSeen)`: when `skipSrs === true`, skip the entire `getNextDueCardForSubject` while-loop (lines 63-80) and proceed directly to `pickRandomQuestion`
- [x] 3.4 Confirm `wasFromDueRef.current = false` is set when `skipSrs` path is taken (so seenIds add-back logic still works correctly)
- [x] 3.5 Confirm answer-side effects (`recordCorrectAnswer` / `recordWrongAnswer` updating SRS fields) remain unchanged regardless of `skipSrs` value

## 4. Pool-exhausted toast

- [x] 4.1 Add `firedExhaustedRef = useRef<Set<SubjectId>>(new Set())` in QuizModal
- [x] 4.2 Add `toasts` state + `emitToast(text)` helper if not already present (reuse HomePage pattern if extracted; otherwise inline within modal — small `useState<{id, text}[]>` is fine)
- [x] 4.3 In `loadNextQuestion`, after `pickRandomQuestion` returns: read pool size via `loadPoolSizeMap`; if `seenIdsRef.current.size >= poolSize` AND `seenIdsRef.current.has(returnedQuestion.id)` AND `!firedExhaustedRef.current.has(forSubject)`, call `emitToast('本科獨立題已掃完，繼續會開始重練')` and add `forSubject` to `firedExhaustedRef`
- [x] 4.4 Render the toast stack within the modal (or hoist to existing `.toast-stack` overlay if applicable)
- [x] 4.5 Verify subject-switch resets nothing in `firedExhaustedRef` (each subject is tracked independently); verify modal close + re-open creates fresh `firedExhaustedRef` (because ref is component-scoped)

## 5. Typecheck + live smoke verification

- [x] 5.1 Run `pnpm -r typecheck` — must be all green
- [x] 5.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw dev`, preflight `mcp__Claude_in_Chrome__list_connected_browsers`
- [x] 5.3 Chrome MCP: navigate to `/study-rpg/hospital/`, verify every visible banner has both `🔴 N due` (when N > 0) and `✅ X / Y` chips rendering side-by-side
- [x] 5.4 Open QuizModal for any subject; verify `跳過 SRS` toggle visible, default unchecked, helper line present
- [x] 5.5 Toggle on; click 「下一題」 5× consecutively in a subject with known due cards; verify none of the due cards surface (would need DEV query against `getNextDueCardForSubject` or visual cue — alternatively check `wasFromDueRef.current` via `__sync` debug surface or temporary `console.log`)
- [x] 5.6 Answer a fresh new question; verify the corresponding banner's completion chip increments by 1 within one second (live query reactive)
- [x] 5.7 Exhaustion toast smoke: temporarily set a tiny subject pool (or use DEV button to bulk-fill `questionHistory` for one subject) to test the toast path; confirm fires exactly once per (session, subject)
- [x] 5.8 SPA prod-equivalent check: build, `pnpm --filter @study-rpg/medexam2-hospital-tw preview`, F5 on `/study-rpg/hospital/` non-root route still works (no regression to existing 404 handling)

## 6. Cleanup + spec validation

- [x] 6.1 Run `openspec validate add-medexam2-completion-tracker --strict` — must pass
- [x] 6.2 Confirm no Dexie schema migration files added (this change does not touch `packages/core/src/lib/db.ts` or `apps/medexam2-hospital-tw/src/db/schema.ts`)
- [x] 6.3 Confirm no new files outside `apps/medexam2-hospital-tw/src/` (no core / theme / content pack changes)
- [x] 6.4 Run `/verify` end-to-end gate before merging
