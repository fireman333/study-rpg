## 1. Practice-pool priority plumbing (Requirement B)

- [x] 1.1 Add read-only `getTodayPlanSnapshotIds()` to `apps/neurons-tw/src/lib/services/prescription.ts` — reads the existing today `plan` meta key (no create), returns `Set(wrongEligibleQuestionIds ∪ breadthEligibleQuestionIds)` or `null` when today has no plan. MUST NOT call `getOrCreateTodayPlan` / write any key.
- [x] 1.2 In `CramPage.tsx`, load today's snapshot ids read-only (state + effect), and add a pure `orderPracticePool(pool, snapshotIds)` helper: shuffle, then stable-partition snapshot ids to the front (return pool unchanged when `snapshotIds` is null).
- [x] 1.3 Route both practice entry points (section CTA + drawer 「答 1 題看看」) through `orderPracticePool`, and pass `preserveOrder` to `<QuizModal>` so the ordering is not re-shuffled.

## 2. Coverage imprint chip (Requirement A)

- [x] 2.1 In `CramPage.tsx`, subscribe via existing `useQuestionHistory()` and build `consolidatedIds = Set(rows where lastResult === 'correct')`.
- [x] 2.2 Render a single low-emphasis 「✓ 已固化過」 chip on each 考古 item where `sourceQuestionIds.some(id => consolidatedIds.has(id))`; render nothing (no chip, no placeholder) otherwise. Chip text is a fixed literal — no count / % / denominator interpolation.

## 3. Spec-alignment (Requirement D4, non-behavioral)

- [x] 3.1 Confirm the on-ramp delta text (prescription-crediting exception clause + 「練幾題」) matches the implemented UI copy in `CramPage.tsx` (`▶ 用本章高頻概念練幾題`).

## 4. Tests

- [x] 4.1 Unit test `orderPracticePool` pure helper: snapshot ids move to front, non-snapshot order preserved relative to shuffle, null snapshot = no-op passthrough.
- [x] 4.2 Unit test `getTodayPlanSnapshotIds()` (fake-indexeddb): returns union set when plan exists, `null` when absent, and never writes a plan key (assert plan key still absent after call when it was absent).

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw test` green (incl. new tests) + `pnpm -r typecheck` clean.
- [x] 5.2 Chrome MCP smoke on dev `/cram`: covered 考古 item shows 「✓ 已固化過」, uncovered shows nothing; open practice, answer a snapshot question correctly → `QuizModal` shows 「🩹 連結已固化」 payoff.
- [x] 5.3 Honesty scan: grep the rendered `/cram` surface for any `%` / 分母 / 保證 / 必中 / 今年一定考 near the coverage chip — must be clean (chip is only 「✓ 已固化過」).
