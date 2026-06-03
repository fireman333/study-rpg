## 1. Dexie v8 schema

- [x] 1.1 In `apps/neurons-tw/src/lib/db.ts`, add `version(8).stores({ questionFlags: 'questionId, easyMarked, guessedMarked, updatedAt' })`. Repeat all prior stores in the version chain.
- [x] 1.2 Declare `QuestionFlagRow` interface + add `questionFlags: EntityTable<QuestionFlagRow, 'questionId'>` field.

## 2. Service

- [x] 2.1 Create `apps/neurons-tw/src/lib/services/question-flags.ts`.
- [x] 2.2 `getFlag(questionId): Promise<QuestionFlagRow | null>`.
- [x] 2.3 `setEasy(questionId, value)`: tx — upsert, preserve `guessedMarked`, refresh `updatedAt`.
- [x] 2.4 `setGuessed(questionId, value)`: tx — upsert, preserve `easyMarked`, refresh `updatedAt`.
- [x] 2.5 `toggleEasy(questionId): Promise<boolean>` and `toggleGuessed(questionId): Promise<boolean>` returning new state.
- [x] 2.6 `useFlag(questionId): {easyMarked, guessedMarked}` React hook via liveQuery+subscribe.
- [x] 2.7 `useAllFlags(): QuestionFlagRow[]` React hook for filter queries.

## 3. Hotkey wiring

- [x] 3.1 In `useQuizHotkeys.ts`, change answered-phase `2` / `3` branches from `noop` → `{kind:'toggle-easy'}` / `{kind:'toggle-guessed'}`.
- [x] 3.2 Add `onToggleEasy: () => void` + `onToggleGuessed: () => void` to `UseQuizHotkeysOptions`.
- [x] 3.3 In switch, change `toggle-easy` / `toggle-guessed` cases from no-op to `event.preventDefault(); opts.onToggleEasy()` (etc.).

## 4. QuizModal buttons

- [x] 4.1 Import `useFlag` + `toggleEasy` / `toggleGuessed` in QuizModal.
- [x] 4.2 Add ✨ button + 🤔 button to footer, render only in answered phase. Inline styles with accent colors. `aria-pressed` reflects flag state.
- [x] 4.3 Wire `onToggleEasy: () => q && toggleEasy(q.id)` + `onToggleGuessed: () => q && toggleGuessed(q.id)` into `useQuizHotkeys({...})`.
- [x] 4.4 Mobile collapse via `.flag-btn-label { display: none }` in inline `<style>`.

## 5. Banner v3 → v4

- [x] 5.1 Bump `STORAGE_KEY` to `neurons-quiz-hotkeys-banner-dismissed-v4`.
- [x] 5.2 Append `, <kbd>2</kbd> ✨ 太簡單、<kbd>3</kbd> 🤔 我亂猜的` to copy.
- [x] 5.3 Comment update referencing v3 → v4 rationale.

## 6. HelpMenu copy updates

- [x] 6.1 In `HelpMenu.tsx`, update `hotkeys` section body: add「答題後 <kbd>2</kbd> 標 ✨ 太簡單、<kbd>3</kbd> 標 🤔 我亂猜的」 mention.
- [x] 6.2 Update `bookmark` section body: mention 「卡片可顯示 ✨ / 🤔 標記，BookmarksPage 可按標記篩選」.

## 7. BookmarksPage extensions

- [x] 7.1 Add `useAllFlags()` import + use the hook to build a `flagMap: Map<questionId, {easyMarked, guessedMarked}>`.
- [x] 7.2 Each row: render ✨ / 🤔 chips next to family badge when flags set.
- [x] 7.3 Add new filter row above family chips: 2 chips「✨ 只看太簡單」 + 「🤔 只看我亂猜的」, default off. Filter logic AND-combined with family filter.

## 8. R2 sync wiring

- [x] 8.1 In `lib/sync/tables.ts`, add `questionFlagsAdapter` (LWW per `questionId` using `updatedAt`).
- [x] 8.2 Add to `NEURONS_ADAPTERS` export.
- [x] 8.3 In `lib/sync/r2/bundles.ts`, bump `SCHEMA_VERSION` from 3 to 4 + update version history comment.

## 9. Tests

- [x] 9.1 Create `apps/neurons-tw/src/__tests__/question-flags.test.ts` (~6 cases: setEasy creates row / setGuessed creates row / toggleEasy off→on→off / both flags coexist on same row / getFlag null on nonexistent / setEasy preserves guessedMarked).
- [x] 9.2 Update `quiz-hotkeys.test.ts`: change the answered-phase `2`/`3` noop test to assert `toggle-easy` / `toggle-guessed` returns.
- [x] 9.3 Update `dmn-bundle-cross-version.test.ts` SCHEMA_VERSION assertion 3 → 4.

## 10. Type / test / smoke

- [x] 10.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean.
- [x] 10.2 `pnpm --filter @study-rpg/neurons-tw test` — expect 80 + ~7 = ~87 passing.
- [x] 10.3 Chrome MCP smoke: open QuizModal → submit answer → press `2` → ✨ button activates; press `3` → 🤔 activates; press `2` again → ✨ deactivates. Navigate to `/bookmarks` → see ✨ / 🤔 chips on flagged bookmarks; toggle flag filter chip → list restricts. Console clean.

## 11. Validate + archive + commit

- [ ] 11.1 `openspec validate add-neurons-srs-binary-modifiers --strict` → valid.
- [ ] 11.2 Sync delta into main spec (ADD flag req + MODIFY hotkey / banner / bookmark / HelpMenu reqs).
- [ ] 11.3 Move to archive: `mv openspec/changes/add-neurons-srs-binary-modifiers openspec/changes/archive/2026-05-29-add-neurons-srs-binary-modifiers`.
- [ ] 11.4 `openspec validate --all --strict` → all green.
- [ ] 11.5 Commit: `spec(archive): merge add-neurons-srs-binary-modifiers — Dexie v8 / R2 v4 question flags + ✨ 太簡單 / 🤔 我亂猜的 buttons + hotkey 2/3 + BookmarksPage filter chips + banner v4`.
- [ ] 11.6 Push to `track-neurons`.
