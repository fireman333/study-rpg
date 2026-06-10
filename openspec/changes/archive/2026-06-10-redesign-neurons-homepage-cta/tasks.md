## 1. Preflight — grep dead-code dependencies before deleting

- [x] 1.1 Grep the repo for `openRandomQuiz`, `randomQuizButtonStyle`, `totalPoolSize`, `ctaCountBadgeStyle` (random usage), and `🎲` across `apps/neurons-tw/src` + any test files; record every reference so nothing is orphaned. (Found: `ctaCountBadgeStyle` also used by the ⚔️ button → would move with it; no test files reference the 🎲 entry.)
- [x] 1.2 Confirm the `quizEntry`/`quizPool` memo random branch and the random count memo are only reached by the 🎲 path; confirm the per-family branch is independent. (Confirmed — `quizEntry === null` was the only random path; per-family branch is separate.)
- [x] 1.3 Confirm `useYearFilter`/`setYearFilter` is global meta (`quiz.yearFilter`) so moving `<YearFilterBar/>` needs no prop drilling. (Confirmed in design D5.)

## 2. Remove 🎲 random-quiz entry + dead code (item 1)

- [x] 2.1 Remove the 🎲 隨機跨 family 答題 button JSX.
- [x] 2.2 Delete the now-dead `openRandomQuiz` handler, `randomQuizButtonStyle`, the random branch of the quiz pool memo, the random count badge, `totalPoolSize`, and the dead `wrongExpeditionButtonStyle`/`wrongExpeditionButtonDisabledStyle`/`ctaCardMainStyle`/`ctaCardSubStyle`/`ctaCountBadgeStyle`/`quizCtaSectionStyle`/`ctaButtonRowStyle` styles (the ⚔️ button moved into the card with its own styles). Simplified the `QuizEntry` type (`| null` removed) + `preserveOrder` expression.
- [x] 2.3 Update/remove any Vitest test that asserts the 🎲 entry's presence. (No-op — §1.1 grep found no test referencing the 🎲 entry.)

## 3. Relocate YearFilterBar into FamilyPicker (item 1)

- [x] 3.1 Remove `<YearFilterBar/>` from the CTA toolbar.
- [x] 3.2 Render `<YearFilterBar/>` at the top of the family grid inside `FamilyPicker.tsx` (above the 醫學一 / 醫學二 sections), reading the same global `quiz.yearFilter` meta. (Per-family quiz pool still year-scopes via the unchanged `filterPoolByYear(byFamily, yearSet)` in `quizPool`.)

## 4. DMN progress ring → horizontal bar (item 2, D2)

- [x] 4.1 Convert `DmnDrawProgressRing.tsx` to a horizontal progress-bar form (export name kept per spec) sharing the existing cap-aware computation; restyled for the light card theme.
- [x] 4.2 Preserve the cap-aware terminal state (「滿」/「今日出征抽卡已達上限」) and the bar caption (cumulative expedition clears today); no animation that would break reduced-motion.

## 5. Build the merged daily-loop stat card (item 2, D1/D3/D4)

- [x] 5.1 Create `components/ConnectomeStatCard.tsx` with the themed light styling (#fbf5ea bg / #d8c4a8 border).
- [x] 5.2 Top band: ⚔️ 錯題出征 full-width primary CTA reusing the expedition open handler + one-way reveal gating (`hasEverAnsweredWrong`); never-wrong player gets guidance text in the slot (no dead button). Disabled「無錯題」state preserved when revealed-but-zero-wrong.
- [x] 5.3 Body: horizontal three-stage + arrow layout — 今日出征狀態 (今日出征 ✓/✗・🔥 連續 N 天) → 修復連線數據 (穩定連線數) → DMN 進度 (the bar from §4). Flex-wrap stacks on < 768px.
- [x] 5.4 Core signals shown by default; a 「詳細」 disclosure (local UI state) reveals 本週 X/7・最強 pair・⚡ 今日連線額外能量.
- [x] 5.5 Honest empty state — zeroed signals render naturally; an extra nudge shows for a player who has wrong history but no wired connections yet.

## 6. Re-wire OverviewPage composition

- [x] 6.1 Remove the standalone connectome status strip and the standalone `<DmnDrawProgressRing/>` — their content now lives in the card.
- [x] 6.2 Mount the merged stat card as the **top dashboard above the maze** (between the header and `<MazeGrid/>`). Final order: header → 🆕 stat card → hint caption → `<MazeGrid/>` → `<StudySquadPanel/>` → status chips (kept) → `<FamilyPicker/>` (hosting YearFilterBar at its top).
- [x] 6.3 Dissolved the old CTA toolbar `<section>`: 🎲 + YearFilter + ⚔️ button all relocated; kept its hint text as a lightweight caption above the maze.

## 7. Verify

- [x] 7.1 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` green (561 passed; no assertion touched the removed 🎲 / standalone ring).
- [x] 7.2 `/simplify` on the touched files: applied 2 fixes — collapsed the `fraction` triple-ternary in `DmnDrawProgressRing` + wrapped the propless bar in `React.memo` (stops the 詳細 toggle re-rendering the live-data child). Skipped NPC-nits + an out-of-scope altitude refactor (would touch the connectome service). Dead-code audit clean (`noUnusedLocals` + zero orphan refs).
- [x] 7.3 Chrome MCP smoke (handled by `/verify`): `/` renders; 🎲 absent; merged card present as the top dashboard **above the maze** with ⚔️ primary CTA + three-stage body + DMN bar; top-to-bottom order 儀表板 → 迷宮 → 遠征隊 → chips → family grid; 「詳細」 toggle works; YearFilterBar at top of family grid still scopes a family quiz; status chips in place; < 768px reflow has no horizontal overflow; F5 + direct-URL OK; console clean.
- [x] 7.4 Confirm zero schema/sync change (no Dexie version bump, no R2 / Worker / SYNCED_META_KEYS edit); `lint:dexie-fixtures` is a no-op.
