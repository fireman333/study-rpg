## 1. Port hotkey hook (scope-down from 二階 — keep highlight + scroll, drop bookmark/quality)

- [x] 1.1 Create `apps/neurons-tw/src/lib/hooks/useQuizHotkeys.ts`. Borrow the `dispatchKey` pure function structure from `medexam2-hospital-tw/src/lib/use-quiz-hotkeys.ts`. STRIP the bookmark / easy / guessed branches initially (`toggle-bookmark` / `toggle-easy` / `toggle-guessed` in the union resolve to `noop` for now — reserved for sibling changes). KEEP: phase enum, input-focus guard, phase-cooldown ref, highlight branch, scroll branch with container ref.
- [x] 1.2 `HotkeyAction` union: `{ kind: 'highlight', key: string } | { kind: 'submit', key: string } | { kind: 'advance' } | { kind: 'scroll', direction, amount } | { kind: 'toggle-bookmark' } | { kind: 'toggle-easy' } | { kind: 'toggle-guessed' } | { kind: 'skip' } | { kind: 'noop' }`. The toggle-* variants are reserved (dispatcher never returns them yet); hook execution treats them as `noop` until a sibling change wires them.
- [x] 1.3 Asking-phase logic: `1/2/3/4` → `{ kind: 'highlight', key: optionKeys[N-1] }` (bounds-checked); `5/6/7/8/9/0` → `noop`; `Enter` → `{ kind: 'submit', key: highlightedKey }` IFF highlight set, else `noop`.
- [x] 1.4 Answered-phase logic: `Enter` or `' '` (Space) → `{ kind: 'advance' }` IFF `msSincePhaseChange >= PHASE_COOLDOWN_MS`, else `noop`. `1` / `2` / `3` → `noop` (reserved, see 1.2). Other keys → `noop`.
- [x] 1.5 Scroll bindings (both phases — handled BEFORE phase-specific logic):  `Space` (no shift) → page-down (scroll); `Shift+Space` → page-up; `ArrowDown` → step-down; `ArrowUp` → step-up; `Home` → edge-top; `End` → edge-bottom. **Exception**: in answered phase, `Space` (no shift, no input focus) is intercepted as `advance` instead of `scroll` (per scenario「Answered phase Space also advances」). In asking phase, `Space` always scrolls down.
- [x] 1.6 Input-focus guard: if `event.target instanceof HTMLInputElement || HTMLTextAreaElement`, return `{ kind: 'skip' }` BEFORE any phase / scroll logic.
- [x] 1.7 Hook signature: `useQuizHotkeys({ isOpen, phase, optionKeys, highlightedKey, scrollContainerRef, setHighlightedKey, onSubmit, onAdvance }): void`. Internally manages `optionsRef`, `phaseChangedAtRef`, `prevPhaseRef`. Document listener gated on `isOpen`; cleanup on unmount. The hook executes scroll actions directly on `scrollContainerRef.current` (matching 二階's scroll-container approach).
- [x] 1.8 Export `dispatchKey`, `PHASE_COOLDOWN_MS`, `ARROW_STEP_PX`, `PAGE_FRACTION`, `QuizPhase`, `HotkeyAction`, `DispatchContext` named exports so tests can import.

## 2. Add Vitest unit coverage for `dispatchKey`

- [x] 2.1 Create `apps/neurons-tw/src/__tests__/quiz-hotkeys.test.ts`.
- [x] 2.2 Test: asking phase `1` returns `{kind:'highlight', key:'A'}` given `optionKeys=['A','B','C','D']`.
- [x] 2.3 Test: asking phase `4` returns `{kind:'highlight', key:'D'}`.
- [x] 2.4 Test: asking phase `5` returns `{kind:'noop'}`.
- [x] 2.5 Test: asking phase `3` with `optionKeys=['A','B']` returns `{kind:'noop'}` (out of bounds).
- [x] 2.6 Test: asking phase `Enter` with `highlightedKey: 'C'` returns `{kind:'submit', key:'C'}`.
- [x] 2.7 Test: asking phase `Enter` with `highlightedKey: null` returns `{kind:'noop'}`.
- [x] 2.8 Test: answered phase `Enter` with cooldown OK returns `{kind:'advance'}`.
- [x] 2.9 Test: answered phase `Enter` with `msSincePhaseChange=50` returns `{kind:'noop'}`.
- [x] 2.10 Test: answered phase `' '` (Space) with cooldown OK returns `{kind:'advance'}` (NOT scroll).
- [x] 2.11 Test: asking phase `' '` (Space) returns `{kind:'scroll', direction:'down', amount:'page'}`.
- [x] 2.12 Test: any phase `Shift+Space` returns `{kind:'scroll', direction:'up', amount:'page'}`.
- [x] 2.13 Test: any phase `ArrowDown` returns `{kind:'scroll', direction:'down', amount:'step'}`.
- [x] 2.14 Test: any phase `Home` returns `{kind:'scroll', direction:'up', amount:'edge-top'}`.
- [x] 2.15 Test: input focus (`isInputFocused: true`) on any key returns `{kind:'skip'}`.
- [x] 2.16 Test: Escape returns `{kind:'noop'}` (handled by existing modal listener, not the hook).
- [x] 2.17 Test: any phase, reserved keys for follow-ups (asking `1` ≠ bookmark slot since asking-`1` is highlight; answered `1`/`2`/`3`) → `{kind:'noop'}` until sibling changes ship.

## 3. Wire hook into QuizModal (highlight state + scroll container)

- [x] 3.1 In `apps/neurons-tw/src/components/QuizModal.tsx`, add `const [highlighted, setHighlighted] = useState<string | null>(null)` alongside existing `picked` state.
- [x] 3.2 Add `const scrollContainerRef = useRef<HTMLDivElement | null>(null)`.
- [x] 3.3 Wrap the modal body content (the `<div style={bodyStyle}>` block) with `<div ref={scrollContainerRef} style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>`. Adjust modal layout so the wrapper sits between header and footer. Footer (`primaryBtnStyle` button + close) stays outside the scroll container.
- [x] 3.4 Derive `phase`: `const phase: QuizPhase = picked === null ? 'asking' : 'answered'`.
- [x] 3.5 Call `useQuizHotkeys({ isOpen: q !== undefined && !exhausted, phase, optionKeys: q ? Object.keys(q.options) : [], highlightedKey: highlighted, scrollContainerRef, setHighlightedKey: setHighlighted, onSubmit: (key) => { setHighlighted(null); handlePick(key) }, onAdvance: () => { setHighlighted(null); handleNext() } })`. The setHighlighted-clear before submit/advance ensures the next question starts fresh.
- [x] 3.6 Update option button rendering: each option button gets a `highlightAccent` style branch when `highlighted === key && picked === null`. The accent SHALL match the existing hover style (thicker border + slight glow). `aria-pressed` toggled to `true` for the highlighted button.
- [x] 3.7 On phase reset (next question loads via `handleNext`), `setHighlighted(null)` is called inside the wrapped `onAdvance` callback. No additional reset needed.
- [x] 3.8 Keep the existing `useEffect` Escape listener (line 60-65). Do NOT remove. Esc remains a single-source listener separate from the hotkey hook.
- [x] 3.9 Verify `handlePick` already guards against double-pick via `picked !== null || busy` (it does — no change needed; hotkey path also benefits from the guard).

## 4. Add announcement banner

- [x] 4.1 Create `apps/neurons-tw/src/components/QuizHotkeysAnnouncementBanner.tsx`. Port the 二階 banner structure: localStorage key `neurons-quiz-hotkeys-banner-dismissed-v1`, `isDismissed()` / `markDismissed()` try-catch helpers, `useState` initialized from localStorage, `handleDismiss` updates both.
- [x] 4.2 Banner copy (neurons-flavored): headline「新功能：答題系統鍵盤快捷鍵」+ body covering all initial hotkeys: 「題目階段 <kbd>1</kbd>–<kbd>4</kbd> 選答案、<kbd>Enter</kbd> 送出；答題後 <kbd>Enter</kbd>/<kbd>Space</kbd> 下一題；<kbd>Space</kbd>/<kbd>Shift+Space</kbd> 翻頁、<kbd>↓</kbd><kbd>↑</kbd> 微捲、<kbd>Home</kbd>/<kbd>End</kbd> 跳邊；<kbd>Esc</kbd> 隨時關閉。」. Use `<kbd>` for keys. NO HelpMenu reference yet (`add-neurons-helpmenu` change appends it later via key bump to `-v2`).
- [x] 4.3 Add CSS to `apps/neurons-tw/src/index.css` (or `App.css` — whichever neurons uses for global styles): class `.quiz-hotkeys-banner` styled with warm gold border / accent matching CTA section. Wrap rule in `@media (hover: hover) and (pointer: fine)` so touch devices skip. Use `display: none` outside the media query.
- [x] 4.4 Accessibility: `role="region"` + `aria-label="新功能公告：鍵盤快捷鍵"` on outer wrapper; dismiss button `aria-label="關閉公告"`. `<kbd>` elements naturally accessible.

## 5. Wire banner into OverviewPage

- [x] 5.1 In `apps/neurons-tw/src/routes/OverviewPage.tsx`, import `QuizHotkeysAnnouncementBanner`.
- [x] 5.2 Render `<QuizHotkeysAnnouncementBanner />` immediately above the existing `<LeaderboardPromoBanner />`.

## 6. Type / lint / test

- [x] 6.1 Run `pnpm --filter @study-rpg/core build` (prebuild dep for typecheck).
- [x] 6.2 Run `pnpm --filter @study-rpg/neurons-tw typecheck` → expect clean.
- [x] 6.3 Run `pnpm --filter @study-rpg/neurons-tw test` → expect 50 + 16 = 66 tests passing.

## 7. Chrome MCP smoke

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw dev` → open Overview at localhost.
- [x] 7.2 Confirm announcement banner renders above LeaderboardPromoBanner with ⌨️ icon + headline + all key hints + ✕ dismiss button.
- [x] 7.3 Open QuizModal via any family card. Press `2` → confirm option B button gets highlighted (visual ring + `aria-pressed=true`), no submission yet.
- [x] 7.4 Press `4` → highlight moves to option D.
- [x] 7.5 Press `Enter` → option D submitted (reveal renders, mastery counters update).
- [x] 7.6 In answered phase, press `Enter` → next question loads (highlight reset to null).
- [x] 7.7 Open another question, press `2`, immediately press `Enter` to submit B, then press `Enter` again within 150ms → confirm 2nd Enter is no-op (cooldown), reveal stays. Wait 200ms, press `Enter` → advance works.
- [x] 7.8 Open a long-stem question (or programmatically scroll-test); press `Space` in asking phase → modal body scrolls down ~80% viewport, page stays put.
- [x] 7.9 Press `Shift+Space` → modal body scrolls up.
- [x] 7.10 Press `↓` / `↑` → modal scrolls 40px steps.
- [x] 7.11 Press `Home` → modal scrolls to top; `End` → bottom.
- [x] 7.12 In answered phase, press `Space` → confirm advance (NOT scroll — phase override working).
- [x] 7.13 Press `Esc` mid-quiz → modal closes (existing behavior).
- [x] 7.14 Mouse-click any option (no prior keyboard) → submits immediately, no highlight intermediate (mouse bypass working).
- [x] 7.15 Dismiss banner via ✕ → reload page → banner does NOT reappear; `localStorage.getItem('neurons-quiz-hotkeys-banner-dismissed-v1') === 'true'`.
- [x] 7.16 `read_console_messages onlyErrors=true` → no errors.
- [x] 7.17 RWD probe at 360 / 414 / 768 px: confirm modal scroll container respects `max-height: calc(100vh - 200px)`, footer stays visible.

## 8. Validate + verify

- [x] 8.1 Run `openspec validate wire-neurons-quiz-hotkeys --strict` → expect「valid」.
- [ ] 8.2 Optionally run `/opsx:verify wire-neurons-quiz-hotkeys` → expect 0 CRITICAL / 0 WARNING.

## 9. Archive + commit

- [ ] 9.1 Run `/opsx:archive wire-neurons-quiz-hotkeys` → sync 2 ADDED requirements into `openspec/specs/neurons-mode/spec.md` main spec.
- [ ] 9.2 Commit with template:`spec(archive): merge wire-neurons-quiz-hotkeys — QuizModal accepts 1/2/3/4 highlight + Enter submit + Enter/Space advance + scroll keys + dismissible homepage announcement banner`.
- [ ] 9.3 Push to `track-neurons` branch.

## 10. Hand-off to follow-up changes

- [x] 10.1 Confirm `useQuizHotkeys.ts` exports the `toggle-bookmark` / `toggle-easy` / `toggle-guessed` `HotkeyAction` variants (currently `noop` placeholders) so sibling changes can wire them without modifying the hook signature.
- [x] 10.2 Confirm the announcement banner localStorage key is versioned (`-v1`) so `add-neurons-helpmenu` can bump to `-v2` when it appends the HelpMenu reference.
- [x] 10.3 Confirm sibling changes referenced (`add-neurons-helpmenu`, `add-neurons-question-bookmarks`, `add-neurons-srs-binary-modifiers`) are listed in proposal「Out of scope」 section.
