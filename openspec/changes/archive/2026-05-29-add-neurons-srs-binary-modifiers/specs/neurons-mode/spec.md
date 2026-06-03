## ADDED Requirements

### Requirement: Neurons-tw SHALL persist per-question binary modifier flags with cross-device sync

The neurons-tw app SHALL provide two binary modifier flags per question — `easyMarked` (「✨ 太簡單」) and `guessedMarked` (「🤔 我亂猜的」) — so players can self-label questions for later targeted review. Flags SHALL persist locally (Dexie) and SHALL sync across devices via the existing R2 LWW bundle pipeline.

When a future `add-neurons-srs-pipeline` change ships an SRS scheduler, the engine SHALL consume these flags as scheduling inputs (easy → longer interval, guessed → shorter / re-queue). Until then the flags' user-facing value is: BookmarksPage filter for「only review the questions I marked ✨ / 🤔」 + at-a-glance visual badges on bookmark cards.

**Schema** (Dexie v8):

- Table name: `questionFlags`
- Primary key: `questionId` (string — one row per question, regardless of which flags are set)
- Indexed columns: `easyMarked`, `guessedMarked` (for filter queries), `updatedAt` (for LWW sync)
- Row shape: `{ questionId: string, easyMarked: boolean, guessedMarked: boolean, updatedAt: number }`
- Both flags coexist on the same row — a question CAN be both easy and guessed (semantically unusual but not forbidden; user can flip their mind).
- Row is created lazily: if a question has never been flagged, no row exists. Reading missing row → both flags treated as `false`.

**Service surface** (`apps/neurons-tw/src/lib/services/question-flags.ts`):

- `getFlag(questionId): Promise<QuestionFlagRow | null>` — returns row if exists, else null.
- `setEasy(questionId, value: boolean): Promise<void>` — upsert; refreshes `updatedAt` (and preserves `guessedMarked`).
- `setGuessed(questionId, value: boolean): Promise<void>` — upsert; refreshes `updatedAt` (and preserves `easyMarked`).
- `toggleEasy(questionId): Promise<boolean>` — convenience returning new `easyMarked` state.
- `toggleGuessed(questionId): Promise<boolean>` — convenience returning new `guessedMarked` state.
- `useFlag(questionId): { easyMarked: boolean, guessedMarked: boolean }` — React hook via liveQuery+subscribe.
- `useAllFlags(): QuestionFlagRow[]` — React hook for filter queries on BookmarksPage.

**QuizModal buttons** (visible only in answered phase):

- 「✨ 太簡單」 button: yellow accent (`#d4a04d`) when `easyMarked === true`; outline (transparent + gray border) when not. `aria-pressed` reflects state. Tooltip: 「標記 ✨ 太簡單（鍵盤 2）」 / 「取消 ✨ 標記（鍵盤 2）」.
- 「🤔 我亂猜的」 button: blue accent (`#6a9bc4`) when `guessedMarked === true`; outline when not. `aria-pressed` reflects state. Tooltip: 「標記 🤔 我亂猜的（鍵盤 3）」 / 「取消 🤔 標記（鍵盤 3）」.
- Layout: `[⭐ 收藏] [✨ 太簡單] [🤔 我亂猜的]    [結束] [下一題]` — flag/bookmark group left (margin-right: auto on first), action buttons right.
- Mobile (`@media (max-width: 600px)`): both buttons collapse to icon-only via `display: none` on `.flag-btn-label`.
- These buttons SHALL render in answered phase only (not asking phase). The semantic「太簡單 / 我亂猜的」 requires having seen the answer.

**Hotkey `2` and `3` in answered phase**:

- The answered-phase `2` slot SHALL dispatch `{ kind: 'toggle-easy' }`.
- The answered-phase `3` slot SHALL dispatch `{ kind: 'toggle-guessed' }`.
- `useQuizHotkeys` hook SHALL accept new non-optional `onToggleEasy: () => void` + `onToggleGuessed: () => void` callback props.
- QuizModal SHALL pass `onToggleEasy: () => void toggleEasy(q.id)` + `onToggleGuessed: () => void toggleGuessed(q.id)` when wiring the hook.

**BookmarksPage integration**:

- Each row SHALL display flag badges next to the family badge:
  - ✨ chip when `easyMarked === true`
  - 🤔 chip when `guessedMarked === true`
  - Both chips can coexist
  - No chips if neither flag set
- New filter row above the existing family chip bar: 2 toggle chips「✨ 只看太簡單」 + 「🤔 只看我亂猜的」. Default: both off (show all). When ON, restrict list to bookmarks whose `questionId` has matching flag set.
- Filter logic: AND across flag chips (both ON → must have BOTH flags). Family filter remains independent — flags filter applies on top.

**Sync via R2 LWW**:

- New `questionFlagsAdapter` in `apps/neurons-tw/src/lib/sync/tables.ts` (LWW per `questionId` using `updatedAt`).
- Bundle `SCHEMA_VERSION` bumps from `3` → `4` in `apps/neurons-tw/src/lib/sync/r2/bundles.ts`.
- No tombstones needed — flag rows are mergeable not deletable (setting both flags to `false` keeps the row alive with `easyMarked=false, guessedMarked=false`).
- Forward-compat: existing v3 clients silently drop the `questionFlags` field per existing `validateBundleMeta` tolerance.

#### Scenario: Click ✨ button toggles easyMarked and updates icon

- **GIVEN** the QuizModal is open in answered phase showing question X (no flags set)
- **WHEN** the player clicks the「✨ 太簡單」 button
- **THEN** the button SHALL render with yellow accent + `aria-pressed="true"`
- **AND** a row SHALL appear in Dexie `questionFlags` with `questionId === X.id`, `easyMarked === true`, `guessedMarked === false`
- **WHEN** the player clicks the「✨ 太簡單」 button again
- **THEN** the button SHALL revert to outline style + `aria-pressed="false"`
- **AND** the row SHALL update with `easyMarked === false` (row persists; both flags now false)

#### Scenario: Both flags can coexist on same question

- **GIVEN** the QuizModal is open in answered phase showing question Y
- **WHEN** the player clicks both「✨ 太簡單」 and「🤔 我亂猜的」
- **THEN** the `questionFlags` row for Y SHALL have `easyMarked === true` AND `guessedMarked === true`
- **AND** both buttons SHALL render in active accent style

#### Scenario: Hotkey `2` toggles easy in answered phase

- **GIVEN** the QuizModal is open in answered phase
- **WHEN** the player presses `2`
- **THEN** the dispatcher SHALL return `{kind:'toggle-easy'}` and the hook SHALL invoke `onToggleEasy()`
- **AND** the「✨ 太簡單」 button SHALL update its visual state

#### Scenario: Hotkey `3` toggles guessed in answered phase

- **GIVEN** the QuizModal is open in answered phase
- **WHEN** the player presses `3`
- **THEN** the dispatcher SHALL return `{kind:'toggle-guessed'}` and the hook SHALL invoke `onToggleGuessed()`
- **AND** the「🤔 我亂猜的」 button SHALL update its visual state

#### Scenario: BookmarksPage shows flag badges on rows

- **GIVEN** the player has bookmarked question X with `easyMarked === true` and question Y with `guessedMarked === true`
- **WHEN** the player navigates to `/bookmarks`
- **THEN** X's row SHALL display ✨ badge next to family badge
- **AND** Y's row SHALL display 🤔 badge next to family badge
- **AND** rows without flags SHALL show only the family badge

#### Scenario: BookmarksPage filter chip ✨ restricts to easy-marked bookmarks

- **GIVEN** the player has 3 bookmarks: A (✨), B (🤔), C (no flags)
- **WHEN** the player clicks「✨ 只看太簡單」 filter chip
- **THEN** the page SHALL show only row A
- **AND** the chip SHALL render in `aria-pressed="true"` accented state
- **WHEN** the player clicks the chip again
- **THEN** the filter SHALL clear; all 3 rows SHALL reappear

#### Scenario: Both flag filters AND together

- **GIVEN** the player has bookmarks: A (✨ only), B (🤔 only), C (both ✨ + 🤔), D (no flags)
- **WHEN** the player toggles both「✨ 只看太簡單」 AND「🤔 只看我亂猜的」 chips ON
- **THEN** the page SHALL show only row C (the only bookmark with BOTH flags)

#### Scenario: v3 client tolerates v4 bundle (forward-compat)

- **GIVEN** a v3 client (pre-`add-neurons-srs-binary-modifiers`) pulls a v4 bundle from R2
- **WHEN** `validateBundleMeta` runs
- **THEN** it SHALL log an info message about unknown fields but SHALL NOT throw
- **AND** the v3 client SHALL silently drop the `questionFlags` field
- **AND** the v3 client SHALL still apply all other v3-known adapters normally

## MODIFIED Requirements

### Requirement: QuizModal SHALL accept keyboard hotkeys for option highlight / submit / advance / scroll

The neurons-tw QuizModal SHALL respond to keyboard input from the moment it opens until it closes, in a two-phase contract that mirrors the modal's existing UI state. The hotkey path SHALL use a deliberate「highlight then commit」 pattern (parity with 二階) — mouse-click on an option still submits immediately so mouse users see no change.

**Asking phase** (`picked === null` — no option selected yet):

- Pressing `1`, `2`, `3`, or `4` SHALL set the highlighted option to A, B, C, or D respectively (order: `Object.keys(q.options)`). The highlighted option SHALL render with a visual accent ring (matching the existing mouse-hover style so the visual vocabulary stays consistent). The submission does NOT happen yet.
- Pressing `5`, `6`, `7`, `8`, `9`, or `0` SHALL be a no-op (defensive — content packs may extend option counts later; current rosters have 4).
- Pressing `Enter` SHALL submit the highlighted option IFF there is one. If no option is highlighted, `Enter` SHALL be a no-op (asking phase requires highlight before commit). Submission invokes the same handler path as a mouse click on that option button.

**Answered phase** (`picked !== null` — option already chosen, reveal showing):

- Pressing `Enter` or `Space` SHALL advance to the next question (equivalent to clicking the existing「下一題」 advance button), provided at least 150ms have elapsed since the asking → answered phase transition.
- Pressing `1` SHALL toggle the bookmark for the current question (wired by `add-neurons-question-bookmarks`).
- **Pressing `2` SHALL toggle the「✨ 太簡單」 flag** (wired by `add-neurons-srs-binary-modifiers`). The hotkey hook SHALL accept a non-optional `onToggleEasy: () => void` callback prop and dispatch `{ kind: 'toggle-easy' }`. Button-click + hotkey paths share the same `toggleEasy(q.id)` service call.
- **Pressing `3` SHALL toggle the「🤔 我亂猜的」 flag** (wired by `add-neurons-srs-binary-modifiers`). The hotkey hook SHALL accept a non-optional `onToggleGuessed: () => void` callback prop and dispatch `{ kind: 'toggle-guessed' }`. Same shared-callback pattern.

**Both phases — scroll bindings**:

- Pressing `Space` (no modifier) SHALL page-scroll the modal's body container DOWN by `0.8 × clientHeight` (smooth behavior). In answered phase this conflicts with the advance binding above; the dispatcher resolves by checking phase first — answered-phase Space advances, asking-phase Space scrolls down.
- Pressing `Shift+Space` SHALL page-scroll UP by `0.8 × clientHeight` (smooth).
- Pressing `↓` (ArrowDown) SHALL scroll down by 40px (`auto` behavior).
- Pressing `↑` (ArrowUp) SHALL scroll up by 40px.
- Pressing `Home` SHALL scroll to top of container (smooth).
- Pressing `End` SHALL scroll to bottom of container (smooth).
- All scroll operations target a dedicated `<div ref={scrollContainerRef}>` wrapping the modal body.

**Both phases — close**:

- Pressing `Escape` SHALL close the modal (existing useEffect listener preserved).

**Both phases — input-focus guard**:

- When `event.target` is an `HTMLInputElement` or `HTMLTextAreaElement`, the hotkey handler SHALL skip dispatch entirely.

**Dispatch architecture**:

- The hotkey logic SHALL be implemented as a pure `dispatchKey(key, shift, ctx)` function returning a discriminated-union `HotkeyAction`. Variants now ALL wired (`highlight` / `submit` / `advance` / `scroll` / `toggle-bookmark` / `toggle-easy` / `toggle-guessed` / `noop` / `skip`) — no reserved-noop placeholders remaining.
- A separate `useQuizHotkeys` hook owns the `document.addEventListener('keydown')` lifecycle, gated on `isOpen`. The hook receives callbacks for each wired action and executes them on dispatch.
- The hook SHALL unsubscribe the document listener on modal close / unmount.

**Visual feedback on highlight**:

- Highlighted option button SHALL render with a thicker / glowing border ring matching the existing mouse-hover style. `aria-pressed="true"` SHALL be set on the highlighted button.

#### Scenario: Asking phase number key highlights option

- **GIVEN** the QuizModal is open, no option highlighted yet, options `{A,B,C,D}`
- **WHEN** the player presses `2`
- **THEN** the highlighted key SHALL be `'B'` + `aria-pressed="true"` on B

#### Scenario: Asking phase Enter submits highlighted option

- **GIVEN** asking phase with option C highlighted
- **WHEN** the player presses `Enter`
- **THEN** the option-pick handler SHALL be invoked with `'C'`

#### Scenario: Asking phase Enter with no highlight is a no-op

- **GIVEN** asking phase, no highlight
- **WHEN** the player presses `Enter`
- **THEN** no submission SHALL happen

#### Scenario: Number key switches highlight to a different option

- **GIVEN** option A currently highlighted
- **WHEN** the player presses `3`
- **THEN** highlight moves to C; A's `aria-pressed` flips to `false`

#### Scenario: Out-of-bounds number key is a no-op

- **GIVEN** question with 3 options `['A','B','C']`
- **WHEN** the player presses `4`
- **THEN** dispatcher returns `{kind:'noop'}`

#### Scenario: Answered phase Enter advances to next question

- **GIVEN** answered phase, > 150ms since phase transition
- **WHEN** the player presses `Enter`
- **THEN** advance handler fires; next question renders with both `picked` + `highlighted` reset to null

#### Scenario: Answered phase Space also advances

- **GIVEN** answered phase with cooldown OK
- **WHEN** the player presses `Space`
- **THEN** advance handler fires (same as Enter)

#### Scenario: Phase-change cooldown blocks immediate Enter advance

- **GIVEN** asking phase with B highlighted
- **WHEN** player presses Enter (submits), then Enter again within 150ms
- **THEN** second Enter is no-op

#### Scenario: Answered-phase `1` toggles bookmark

- **GIVEN** answered phase showing question X (not bookmarked)
- **WHEN** the player presses `1`
- **THEN** the dispatcher returns `{kind:'toggle-bookmark'}`
- **AND** the bookmark is added (per `add-neurons-question-bookmarks`)

#### Scenario: Answered-phase `2` toggles ✨ easy flag

- **GIVEN** answered phase showing question Y (no easyMarked flag)
- **WHEN** the player presses `2`
- **THEN** the dispatcher returns `{kind:'toggle-easy'}` and the hook invokes `onToggleEasy()`
- **AND** Dexie `questionFlags` for Y SHALL set `easyMarked = true`
- **AND** the「✨ 太簡單」 button in the modal footer SHALL render with yellow accent + `aria-pressed="true"`

#### Scenario: Answered-phase `3` toggles 🤔 guessed flag

- **GIVEN** answered phase showing question Z (no guessedMarked flag)
- **WHEN** the player presses `3`
- **THEN** the dispatcher returns `{kind:'toggle-guessed'}` and the hook invokes `onToggleGuessed()`
- **AND** Dexie `questionFlags` for Z SHALL set `guessedMarked = true`
- **AND** the「🤔 我亂猜的」 button in the modal footer SHALL render with blue accent + `aria-pressed="true"`

#### Scenario: Asking phase Space scrolls modal body down

- **GIVEN** asking phase with long stem requiring scroll
- **WHEN** player presses `Space`
- **THEN** body scrolls down 0.8 × clientHeight; page does NOT scroll

#### Scenario: Shift+Space scrolls modal body up in either phase

- **GIVEN** modal open (any phase)
- **WHEN** player presses `Shift+Space`
- **THEN** body scrolls up 0.8 × clientHeight

#### Scenario: Arrow keys provide fine-grained scroll

- **GIVEN** modal open
- **WHEN** player presses `↓` → body scrolls down 40px; `↑` → scrolls up 40px

#### Scenario: Home / End jump to container edges

- **GIVEN** modal open
- **WHEN** player presses `Home` → scroll to top; `End` → scroll to bottom

#### Scenario: Escape closes the modal in any phase

- **GIVEN** modal open
- **WHEN** player presses `Escape`
- **THEN** modal closes via existing useEffect listener

#### Scenario: Input focus suspends hotkey dispatch

- **GIVEN** modal open with an `<input>` focused
- **WHEN** player presses any key
- **THEN** hotkey hook returns `{kind:'skip'}` — keypress passthroughs

#### Scenario: Hook unmounts cleanly on modal close

- **GIVEN** modal open with hotkey hook active
- **WHEN** modal closes
- **THEN** document listener is removed; subsequent Overview keystrokes don't fire quiz actions

#### Scenario: Mouse click bypass — click submits immediately

- **GIVEN** asking phase
- **WHEN** player CLICKS option B with mouse
- **THEN** option-pick handler fires immediately with `'B'` (no highlight intermediate)

### Requirement: Overview SHALL surface a dismissible hotkey announcement banner

Overview SHALL render a one-time announcement banner promoting the QuizModal keyboard hotkeys + bookmark + flag features, positioned above `LeaderboardPromoBanner` and below the top status chip. The banner SHALL be dismissible per-device and SHALL hide on touch-only devices.

The banner SHALL:

- Display a `⌨️` icon + headline「新功能：答題系統鍵盤快捷鍵」+ inline copy describing the asking-phase `1`–`4` highlight + `Enter` submit, answered-phase `Enter` / `Space` advance, answered-phase `1` ⭐ bookmark toggle, **answered-phase `2` ✨ 太簡單**, **answered-phase `3` 🤔 我亂猜的**, scroll keys (`Space` / `Shift+Space` / `↓↑` / `Home` / `End`), and `Esc` close — all using `<kbd>` semantic elements.
- Append a HelpMenu reference at the end of the copy: `... 詳見右上 ❓ →「⌨️ 鍵盤快捷鍵」section。`.
- Render a ✕ dismiss button that, when clicked, hides the banner immediately AND writes a localStorage key `neurons-quiz-hotkeys-banner-dismissed-v4` (BUMPED from `-v3` to `-v4`).
- Use CSS media query `@media (hover: hover) and (pointer: fine)`.
- Carry `role="region"` + `aria-label="新功能公告：鍵盤快捷鍵"`; dismiss button `aria-label="關閉公告"`.

Graceful localStorage failure: in-memory state still updates; banner re-renders on next load.

The version suffix SHALL be bumped on future material copy revisions.

#### Scenario: Banner shows on first Overview load OR after v3→v4 key bump

- **GIVEN** no `neurons-quiz-hotkeys-banner-dismissed-v4` localStorage key (fresh OR previously-dismissed user)
- **WHEN** Overview renders
- **THEN** banner appears above LeaderboardPromoBanner with all the keys including `1` / `2` / `3` mentioned + HelpMenu reference

#### Scenario: Dismiss persists across reload via v4 key

- **GIVEN** banner visible, dismiss clicked
- **WHEN** page reloads
- **THEN** banner does NOT render
- **AND** `neurons-quiz-hotkeys-banner-dismissed-v4` is `'true'`
- **AND** legacy `-v1` / `-v2` / `-v3` keys are ignored

#### Scenario: Banner hidden on touch-only devices

- **GIVEN** device matches `@media (hover: none) or (pointer: coarse)`
- **WHEN** Overview renders
- **THEN** banner not visually shown

#### Scenario: Banner content uses `<kbd>` semantic elements + all 4 number keys mentioned

- **GIVEN** banner rendered
- **WHEN** markup parsed
- **THEN** key references wrapped in `<kbd>` including `1`, `2`, `3`, `4`, `Enter`, `Space`, arrow keys, `Esc`
- **AND** mentions ⭐ bookmark on `1`, ✨ 太簡單 on `2`, 🤔 我亂猜的 on `3`

#### Scenario: localStorage failure does not break the page

- **GIVEN** localStorage unavailable
- **WHEN** dismiss clicked
- **THEN** in-memory state updates; no error thrown; banner re-renders next load

### Requirement: Neurons-tw SHALL persist per-question bookmarks with cross-device sync

The neurons-tw app SHALL provide a per-question bookmark feature so players can mark interesting / hard / want-to-revisit questions for later review. Bookmarks SHALL persist locally (Dexie) and SHALL sync across devices via the existing R2 LWW bundle pipeline.

**Schema** (Dexie v7):

- Table name: `questionBookmarks`
- Primary key: `questionId`
- Indexed columns: `family`, `addedAt`, `updatedAt`
- Row shape: `{ questionId: string, family: string, addedAt: number, updatedAt: number }`
- `addedAt` set once on creation; `updatedAt` refreshes on every write.
- Companion table `questionBookmarkTombstones` for cross-device delete propagation.

**Service** at `apps/neurons-tw/src/lib/services/bookmarks.ts` — `addBookmark` / `removeBookmark` / `toggleBookmark` / `isBookmarked` / `useIsBookmarked` / `useAllBookmarks`.

**QuizModal ⭐ button**: footer button visible both phases; click toggles via `toggleBookmark(q)`. `aria-pressed` reflects state. Mobile collapses to icon-only.

**Hotkey `1` in answered phase**: toggles bookmark (see hotkey requirement).

**`/bookmarks` route** (`BookmarksPage`):

- Lists bookmarks by `addedAt` desc; max 200 visible (warn beyond).
- Each row: family badge + flag badges (✨ if `easyMarked`, 🤔 if `guessedMarked`) + stem (100 chars) + relative time + 「★ 取消」 unbookmark + 「🎯 重新作答」 (opens 1-question QuizModal).
- Empty state with link back to `/`.
- Filter bar at top:
  - Row 1 (NEW per `add-neurons-srs-binary-modifiers`): flag chips「✨ 只看太簡單」 + 「🤔 只看我亂猜的」, default both off, AND-combined when both on.
  - Row 2 (existing): family chips of all 11 families, default all included; click toggles exclusion.
- Both filter rows AND together (flag filter AND family filter).

**Sync**: `questionBookmarksAdapter` + `questionBookmarkTombstonesAdapter`; bundle SCHEMA_VERSION 2 → 3 (set by `add-neurons-question-bookmarks`).

#### Scenario: ⭐ button toggles bookmark and updates icon

- **GIVEN** QuizModal open, question X not bookmarked
- **WHEN** player clicks ⭐
- **THEN** icon flips to `★`, `aria-pressed="true"`, Dexie row written
- **WHEN** clicked again
- **THEN** reverts to `☆`, row removed + tombstone written

#### Scenario: BookmarksPage renders in addedAt desc order with flag badges

- **GIVEN** bookmarks X (1m ago, ✨), Y (10m ago, 🤔), Z (1h ago, no flags)
- **WHEN** player navigates to `/bookmarks`
- **THEN** 3 rows render in order X / Y / Z
- **AND** X shows ✨ chip next to family badge
- **AND** Y shows 🤔 chip
- **AND** Z shows only family badge

#### Scenario: Empty state surfaces when no bookmarks exist

- **GIVEN** no bookmarks
- **WHEN** player navigates to `/bookmarks`
- **THEN** empty-state with link「← 回總覽開始答題」 renders

#### Scenario: Family filter excludes families from list

- **GIVEN** bookmarks across 3 families
- **WHEN** player clicks 藥理學 chip to exclude
- **THEN** 藥理學 bookmarks hidden; other families remain
- **AND** chip renders dashed-border / muted with `aria-pressed="false"`

#### Scenario: Flag filter ✨ restricts to easy-marked bookmarks

- **GIVEN** bookmarks A (✨), B (🤔), C (none)
- **WHEN** player clicks「✨ 只看太簡單」 chip
- **THEN** only A shown; chip `aria-pressed="true"`
- **WHEN** clicked again
- **THEN** filter clears; all 3 shown

#### Scenario: Both flag filters AND together

- **GIVEN** bookmarks A (✨), B (🤔), C (✨+🤔), D (none)
- **WHEN** both filter chips ON
- **THEN** only C shown

#### Scenario: 「重新作答」 opens QuizModal scoped to that question

- **GIVEN** bookmark X
- **WHEN** player clicks 「重新作答」 on X
- **THEN** QuizModal opens with `pool = [X]`; exhausts after 1 question

#### Scenario: R2 sync replicates bookmarks across devices

- **GIVEN** bookmark X on Device A
- **WHEN** Device B (same account) pulls latest bundle
- **THEN** Device B's local `questionBookmarks` has row X via LWW

#### Scenario: Tombstone propagates bookmark removal

- **GIVEN** bookmark X on both devices
- **WHEN** Device A removes (writes tombstone)
- **AND** Device B pulls
- **THEN** Device B's `questionBookmarks` no longer has X
- **AND** `questionBookmarkTombstones` contains the tombstone

#### Scenario: Re-add after remove clears tombstone

- **GIVEN** X removed (tombstone exists)
- **WHEN** player re-adds X
- **THEN** new bookmark row written; tombstone deleted

#### Scenario: v2 client tolerates v3 bundle (forward-compat)

- **GIVEN** v2 client pulls v3 bundle
- **THEN** `validateBundleMeta` logs info; v2 client drops unknown fields; other adapters still applied

### Requirement: Neurons-tw SHALL surface a global HelpMenu accessible from every route

The neurons-tw app SHALL render a floating ❓ FAB at the top-right corner that opens a dismissible HelpMenu panel. The FAB SHALL be mounted at App-level so it persists across all routes (Overview / ConnectomePage / DmnCollectionPage / AchievementsPage / LeaderboardPage / MotionDemoPage / BookmarksPage).

**FAB**: `position: fixed; top: 1rem; right: 1rem; z-index: 900`, 44×44px circular, ❓ icon, warm GBA palette accent. `aria-label="開啟說明選單"`. Hover lifts; active state (panel open) accented + `aria-expanded="true"`. Mobile (`@media (max-width: 600px)`): repositions to bottom-right.

**Panel**: `role="dialog" aria-modal="true" aria-label="說明選單"`. Backdrop closes panel. Esc closes. Click ✕ closes. Mobile: bottom sheet, max-height 80vh.

**7 accordion sections**, single-expand:

1. **id=`hotkeys`, icon=⌨️, title=「鍵盤快捷鍵」** — full hotkey reference covering asking phase (1-4 highlight + Enter), answered phase (Enter/Space advance + 150ms cooldown, `1` bookmark, **`2` ✨ 太簡單, `3` 🤔 我亂猜的**), scroll keys, Esc, mouse-click bypass.
2. **id=`bookmark`, icon=⭐, title=「收藏題目」** — bookmark feature; mentions ✨ / 🤔 flag badges + filter on BookmarksPage.
3. **id=`variant-unlock`, icon=🧬, title=「變體解鎖」** — AP threshold ladder + auto-pull + `/connectome` link.
4. **id=`synapse-formation`, icon=🔗, title=「Synapse 形成」** — cross-family wire rule + weak/strong + 7-day decay.
5. **id=`dmn-draws`, icon=💎, title=「DMN 抽卡」** — time + behavior axis triggers + 20-card cap + 5 event kinds.
6. **id=`leaderboard`, icon=🏆, title=「排行榜」** — opt-in flow + nickname check + filters + opt-out.
7. **id=`bug-report`, icon=🩺, title=「回報問題」** — link out to GitHub Issues; not a form modal.

Single-expand: opening section X collapses all others; clicking expanded section closes it.

Closes: ✕, backdrop click, Esc. State not persisted.

#### Scenario: FAB renders on every route including /bookmarks

- **GIVEN** player navigates between all routes
- **WHEN** any route renders
- **THEN** FAB visible at fixed position; clickable

#### Scenario: Click FAB opens panel with 7 sections

- **GIVEN** panel closed
- **WHEN** player clicks FAB
- **THEN** panel opens with 7 collapsed sections (hotkeys / bookmark / variant-unlock / synapse-formation / dmn-draws / leaderboard / bug-report)
- **AND** panel has `role="dialog" aria-modal="true"`

#### Scenario: hotkeys section copy mentions `1` / `2` / `3` flag hotkeys

- **GIVEN** player expands the `hotkeys` section
- **WHEN** the body renders
- **THEN** the copy SHALL mention「答題後 <kbd>1</kbd> 收藏 / <kbd>2</kbd> ✨ 太簡單 / <kbd>3</kbd> 🤔 我亂猜的」 explicitly

#### Scenario: bookmark section links to /bookmarks page

- **GIVEN** player expands the `bookmark` section
- **WHEN** player clicks「收藏」 link
- **THEN** navigates to `/bookmarks`

#### Scenario: Single-expand accordion behavior

- **GIVEN** panel open with `hotkeys` expanded
- **WHEN** player clicks `dmn-draws` summary
- **THEN** `dmn-draws` expands; `hotkeys` collapses

#### Scenario: Clicking expanded section closes it (toggle)

- **GIVEN** `variant-unlock` expanded
- **WHEN** player clicks `variant-unlock` again
- **THEN** collapses

#### Scenario: Backdrop click closes panel

- **GIVEN** panel open
- **WHEN** player clicks backdrop
- **THEN** panel closes

#### Scenario: Esc key closes panel

- **GIVEN** panel open
- **WHEN** player presses Esc
- **THEN** panel closes

#### Scenario: Bug-report section links out to GitHub Issues

- **GIVEN** `bug-report` section expanded
- **WHEN** player clicks「開 GitHub Issue」
- **THEN** opens `https://github.com/fireman333/study-rpg/issues/new` in new tab with `target="_blank" rel="noopener"`

#### Scenario: Panel mounts at App level — does not interfere with QuizModal

- **GIVEN** QuizModal open via family card click
- **WHEN** player clicks FAB
- **THEN** HelpMenu panel opens over QuizModal
- **WHEN** player closes HelpMenu
- **THEN** QuizModal still visible / interactive

#### Scenario: Mobile viewport positions FAB at bottom

- **GIVEN** viewport ~414px
- **WHEN** route renders
- **THEN** FAB at bottom-right
- **WHEN** tapped, panel becomes bottom sheet up to 80vh

#### Scenario: HelpMenu state does not persist

- **GIVEN** panel opened, section expanded, panel closed
- **WHEN** panel reopened later
- **THEN** all sections collapsed (no memory)
