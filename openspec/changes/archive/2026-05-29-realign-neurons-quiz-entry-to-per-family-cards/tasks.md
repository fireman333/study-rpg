## 1. FamilyPicker → per-family direct-entry card grid

- [x] 1.1 In `apps/neurons-tw/src/components/FamilyPicker.tsx`, change `Props` from `{ pack, selectedFamilyId, onSelect }` → `{ pack, onStartQuiz }` where `onStartQuiz: (familyId: string) => void`.
- [x] 1.2 Remove `AllChip` component and the「全部」 chip from the picker section header (moved to OverviewPage hero CTA per Req 2).
- [x] 1.3 Remove `selected` prop / `selectedCardStyle` / `selectedHintStyle` / selection confirmation banner from `FamilyCard` and the picker section (no filter state anymore).
- [x] 1.4 Rewrite `FamilyCard` body: top row = sprite (52×52) + primary `family.id` + secondary `family.displayName` (single-line ellipsis); middle row = inline `MasteryChip familyId={family.id} displayName={family.displayName}` + 題數 chip; bottom = full-width「🎯 答題」 button with `onClick={onStartQuiz}`.
- [x] 1.5 Add `isEmpty = family.totalQuestions === 0` defensive branch → button gets `disabled` attr + `title="本 family 目前無題目"` + `quizButtonDisabledStyle` (muted bg).
- [x] 1.6 Change branch row layout from `flex-wrap` chip strip to CSS grid `repeat(auto-fill, minmax(170px, 1fr))` so cards reflow 4 / 2 / 1 cols across viewport.
- [x] 1.7 Section header hint text updated to:「{N} family · 4 NT 分支 · 同日跨 family 答對 5 題 → wire synapse」 (replaces the old「家族熟練度」 standalone line that lived on OverviewPage).

## 2. OverviewPage hero CTA + state surgery

- [x] 2.1 In `apps/neurons-tw/src/routes/OverviewPage.tsx`, drop `selectedFamilyId` React state + `selectedFamilyDisplayName` derived value (no longer needed).
- [x] 2.2 Replace `quizOpen: boolean` with `quizEntry: string | null | undefined` three-state (`undefined` = closed, `null` = random, `string` = specific family). Lock the modal to a single mount per entry, no carry-over.
- [x] 2.3 `quizPool` `useMemo` now derives from `quizEntry`: `quizEntry === undefined ? [] : filterPoolByFamily(pack.questions, quizEntry)`. Empty array when closed avoids the leftover-pool gotcha.
- [x] 2.4 Replace the prior「🎯 開始答題」 big yellow CTA with a CTA row containing the existing「📖 開始閱讀」 button (left) + new「🎲 隨機跨 family 答題」 button (right, gold `#d4a04d`). Both buttons use `flex: 1 1 220px` to wrap gracefully.
- [x] 2.5 Random CTA shows inline count chip with `pack.questions.length` (currently 3291); `onClick` calls `setQuizEntry(null)`.
- [x] 2.6 Remove the standalone「🎓 家族熟練度」 `<section>` block at the bottom of OverviewPage (mastery now inline in each family card per task 1.4).
- [x] 2.7 Replace `<FamilyPicker pack selectedFamilyId onSelect />` with `<FamilyPicker pack onStartQuiz={(familyId) => setQuizEntry(familyId)} />`.
- [x] 2.8 Trim CTA hint paragraph copy: now focuses on reading mechanics + points to family cards for targeted practice (was previously verbose with selected-family interpolation).

## 3. Type / lint / test

- [x] 3.1 Run `pnpm --filter @study-rpg/neurons-tw typecheck` → expect clean (`tsc --noEmit` clean per dogfood log 09:28).
- [x] 3.2 Run `pnpm --filter @study-rpg/neurons-tw test` → expect 50/50 pass; the unchanged `filterPoolByFamily` test still covers `null` / `string` / `undefined` family-id branches.
- [x] 3.3 No new Vitest required — UI surface change covered by Chrome MCP smoke per project pattern.

## 4. Chrome MCP smoke (verified during apply)

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw dev` boots on http://localhost:5183/.
- [x] 4.2 DOM query confirms 11 cards rendered, 4 NT-branch groups, each card has 答題 button + MasteryChip + 題數 chip + sprite.
- [x] 4.3 Click `藥理學` card 答題 button → QuizModal opens with question stem rendered (verified via `[role="dialog"]` query + first stem text).
- [x] 4.4 Esc closes modal cleanly; no residual selected state on cards.
- [x] 4.5 Click random CTA → QuizModal opens with question stem rendered (different stem from family-specific case; pool unrestricted).
- [x] 4.6 RWD probe: at 768 / 414 / 360 px wrapper widths, card grid renders 4 / 2 / 1 cols respectively and CTA buttons wrap correctly (`flex: 1 1 220px` honored). Verified via injected style override + `getBoundingClientRect` measurement, then probe cleaned.
- [x] 4.7 `read_console_messages onlyErrors=true` → no errors during full flow.

## 5. Validate + verify

- [x] 5.1 Run `openspec validate realign-neurons-quiz-entry-to-per-family-cards --strict` → expect「valid」.
- [x] 5.2 Optionally run `/opsx:verify realign-neurons-quiz-entry-to-per-family-cards` → expect 0 CRITICAL / 0 WARNING across completeness / correctness / coherence dimensions. _(verified 2026-05-29: 0 CRITICAL / 0 WARNING / 0 SUGGESTION; 2/2 reqs covered, 12/12 scenarios have implementation evidence)_

## 6. Archive + commit

- [ ] 6.1 Run `/opsx:archive realign-neurons-quiz-entry-to-per-family-cards` → sync delta into `openspec/specs/neurons-mode/spec.md` main spec (replaces the prior「filter chip」 wording with the new「direct-entry card」 body + adds the new hero CTA requirement).
- [ ] 6.2 Confirm archived change folder lands under `openspec/changes/archive/<YYYY-MM-DD>-realign-neurons-quiz-entry-to-per-family-cards/`.
- [ ] 6.3 Use auto-git skill to commit with template:`spec(archive): merge realign-neurons-quiz-entry-to-per-family-cards — Overview homepage adopts 二階-style per-family direct-entry cards + hero random CTA`.
- [ ] 6.4 Push to `track-neurons` branch.
- [ ] 6.5 (Future) Plan a `track-neurons → main` merge sync after a small batch of neurons polish changes lands.
