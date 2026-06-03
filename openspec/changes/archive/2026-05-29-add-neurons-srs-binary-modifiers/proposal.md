## Why

Owner dogfood + cross-track audit (2026-05-29 post `add-neurons-question-bookmarks`): the QuizModal hotkey reserved-slots `2` and `3` are still no-op. Owner's original「都要做」directive included「太簡單」+「我亂猜的」 binary modifiers — these become SRS quality grading inputs in 二階 (`tune-srs-binary-modifiers-and-intervals`). Neurons has NO SRS pipeline yet (`DmnQuickReviewToast` explicitly notes「SRS-due quiz modal pipeline that doesn't exist in neurons-tw yet」), so this change ships the binary modifiers as **flag persistence + UI** only (D-thin scope per the design call), without building an SRS engine.

When a future `add-neurons-srs-pipeline` change lands, it will consume `easyMarked` / `guessedMarked` as inputs to the SRS algorithm. Until then the flags have immediate user value via the BookmarksPage filter (「只看 ✨ 太簡單」 / 「只看 🤔 我亂猜的」) — re-reviewing self-marked-easy or self-marked-guessed questions is a real study workflow even without SRS scheduling.

## What Changes

**Dexie schema bump**: `apps/neurons-tw/src/lib/db.ts` add `version(8).stores({ questionFlags: 'questionId, easyMarked, guessedMarked, updatedAt' })`.

**Row shape**: `{ questionId: string, easyMarked: boolean, guessedMarked: boolean, updatedAt: number }`. Composite — both flags live on the same row (a question can be BOTH easy AND guessed if user changes their mind, though semantically unusual; we don't enforce mutual exclusion).

**New service** `apps/neurons-tw/src/lib/services/question-flags.ts`:

- `getFlag(questionId): Promise<QuestionFlagRow | null>` — read current flag state.
- `setEasy(questionId, easy: boolean)`: upsert easyMarked, refresh updatedAt.
- `setGuessed(questionId, guessed: boolean)`: upsert guessedMarked, refresh updatedAt.
- `toggleEasy(questionId): Promise<boolean>`: convenience returning new easyMarked state.
- `toggleGuessed(questionId): Promise<boolean>`: convenience returning new guessedMarked state.
- `useFlag(questionId): { easyMarked, guessedMarked }`: React hook via liveQuery+subscribe.
- `useAllFlags(): QuestionFlagRow[]`: React hook for filter queries.

**QuizModal 2 buttons** (visible in answered phase only — flags semantic doesn't make sense before answering):

- 「✨ 太簡單」 button: yellow accent when marked; outline when not. `aria-pressed` reflects state. Hotkey hint「(2)」 in tooltip.
- 「🤔 我亂猜的」 button: blue accent when marked; outline when not. `aria-pressed` reflects state. Hotkey hint「(3)」 in tooltip.
- Both placed in modal footer alongside the existing ⭐ bookmark + 結束 / 下一題 buttons. Layout: `[⭐ 收藏] [✨ 太簡單] [🤔 我亂猜的]      [結束] [下一題]` (flags grouped left with bookmark; action buttons right).
- Mobile: collapse text labels to icon-only.

**Hotkey wiring** (`apps/neurons-tw/src/lib/hooks/useQuizHotkeys.ts`):

- Answered-phase `2` → `{ kind: 'toggle-easy' }` (replaces reserved-noop placeholder).
- Answered-phase `3` → `{ kind: 'toggle-guessed' }` (replaces reserved-noop).
- Hook gains `onToggleEasy: () => void` + `onToggleGuessed: () => void` callback props.
- Hook switch case wires both to `event.preventDefault()` + invoke callback.

**Banner version bump** (`apps/neurons-tw/src/components/QuizHotkeysAnnouncementBanner.tsx`):

- Bump `STORAGE_KEY` from `-v3` to `-v4`.
- Copy update: append「<kbd>2</kbd> ✨ 太簡單、<kbd>3</kbd> 🤔 我亂猜的」 after the `1` bookmark mention.

**BookmarksPage extensions** (`apps/neurons-tw/src/routes/BookmarksPage.tsx`):

- Each row gains badge display: ✨ chip when `easyMarked`, 🤔 chip when `guessedMarked` (rendered next to family badge).
- New filter row above family chips: 2 toggle chips「✨ 只看太簡單」 + 「🤔 只看我亂猜的」 (default off — show all). When ON, restrict list to bookmarks with matching flag.
- Empty state copy updated to mention flag filter possibility.

**HelpMenu section update** (`apps/neurons-tw/src/components/HelpMenu.tsx`):

- Update `hotkeys` section body: add「答題後 <kbd>2</kbd> 標 ✨ 太簡單、<kbd>3</kbd> 標 🤔 我亂猜的（用來標記之後複習）」.
- Update `bookmark` section body: mention 「卡片可顯示 ✨ / 🤔 標記，BookmarksPage 也可按標記篩選」.

**R2 sync wiring**:

- New `questionFlagsAdapter` in `apps/neurons-tw/src/lib/sync/tables.ts` (LWW by `questionId`).
- Bundle `SCHEMA_VERSION` bumps from `3` → `4` in `apps/neurons-tw/src/lib/sync/r2/bundles.ts`.
- Forward-compat: v3 clients silently drop the new `questionFlags` field per existing tolerance.

## Capabilities

### New Capabilities

(none — flags live in the existing `neurons-mode` capability, parity with bookmarks)

### Modified Capabilities

- `neurons-mode`: ADD requirement「Neurons-tw SHALL persist per-question binary modifier flags with cross-device sync」. MODIFY existing「QuizModal SHALL accept keyboard hotkeys」 requirement to wire answered-phase `2` → toggle-easy, `3` → toggle-guessed (replacing reserved-noop). MODIFY existing「Overview SHALL surface a dismissible hotkey announcement banner」 requirement to bump key v3 → v4 + add flag-key copy. MODIFY existing「Neurons-tw SHALL persist per-question bookmarks」 requirement to enumerate the new flag chip filter + badges. MODIFY existing「HelpMenu accessible from every route」 requirement to surface flag hotkeys.

## Impact

- **Code**:
  - `apps/neurons-tw/src/lib/db.ts` (+10 lines: version(8) + table + types)
  - `apps/neurons-tw/src/lib/services/question-flags.ts` (~80 lines new)
  - `apps/neurons-tw/src/lib/hooks/useQuizHotkeys.ts` (~10 lines: dispatch toggle-easy / toggle-guessed + callback props)
  - `apps/neurons-tw/src/components/QuizModal.tsx` (~50 lines: 2 buttons + wiring)
  - `apps/neurons-tw/src/components/QuizHotkeysAnnouncementBanner.tsx` (~3 lines: v3 → v4 key + copy)
  - `apps/neurons-tw/src/components/HelpMenu.tsx` (~6 lines: hotkey section + bookmark section copy)
  - `apps/neurons-tw/src/routes/BookmarksPage.tsx` (~50 lines: badges + filter chips)
  - `apps/neurons-tw/src/lib/sync/tables.ts` (~50 lines: questionFlagsAdapter)
  - `apps/neurons-tw/src/lib/sync/r2/bundles.ts` (~3 lines: SCHEMA_VERSION bump + comment)
- **Data migration**: Dexie v8 schema add is additive (no row backfill). R2 bundle v3 → v4 is additive (v3 clients drop the new field gracefully).
- **Tests**: new `apps/neurons-tw/src/__tests__/question-flags.test.ts` (~6 cases: setEasy/setGuessed/toggleEasy/toggleGuessed/getFlag/upsert idempotency). Update `quiz-hotkeys.test.ts` to flip the reserved `2`/`3` noop test → `toggle-easy`/`toggle-guessed` returns. Update `dmn-bundle-cross-version.test.ts` SCHEMA_VERSION assertion 3 → 4. Total: 80 + ~7 = ~87 tests.
- **A11y**: 2 new buttons have `aria-pressed` + dynamic `aria-label`. BookmarksPage filter chips have `aria-pressed`.
- **No engine change**: flags are pure persistence + UI surface — no game-loop hook. When future SRS engine lands, it'll consume these flags as inputs.
- **Out of scope** (NOT in this change):
  - SRS scheduler engine itself (defer to `add-neurons-srs-pipeline`)
  - DmnQuickReviewToast wiring to real SRS due queue (waits on SRS engine)
  - Wrong-answer / everWrong tracking (separate `add-neurons-wrong-history` change)
  - Grace toast on wrong→correct transition (sibling to everWrong)
