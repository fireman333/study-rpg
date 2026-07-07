## 1. Core engine — reviewCardBinaryInsight

- [x] 1.1 In `packages/core/src/lib/srs.ts`, add `export const INSIGHT_EASE_MULTIPLIER = 0.8` (near `WRONG_EASE_MULTIPLIER`).
- [x] 1.2 Add `export function reviewCardBinaryInsight({ prev, now })`: `interval = GUESSED_RESET_INTERVAL` (1), `easeFactor = Math.max(EASE_FLOOR, prev.easeFactor * INSIGHT_EASE_MULTIPLIER)`, `nextDueAt = now + GUESSED_RESET_INTERVAL * DAY`. Mirror the `reviewCardBinaryGuessed` signature/shape. Additive export only (non-breaking → PATCH publish for the 二階 consumer).
- [x] 1.3 Ensure it's exported from `packages/core/src/index.ts` (alongside `reviewCardBinaryGuessed`).

## 2. App — applyInsightModifier + QuizModal swap

- [x] 2.1 In `apps/neurons-tw/src/lib/services/srs-scheduler.ts`, import `reviewCardBinaryInsight` and add `applyInsightModifier(questionId, prev, now)` mirroring `applyGuessedModifier` (writes interval/easeFactor/nextDueAt/updatedAt to `questionHistory`).
- [x] 2.2 In `apps/neurons-tw/src/components/QuizModal.tsx`, import `applyInsightModifier` and in `runWrongCauseToggle('insight')` swap the toggle-ON call `applyGuessedModifier` → `applyInsightModifier`. Leave the toggle-OFF `restoreDefaultSrs` path unchanged (three-state restore preserved). Update the inline comment (no longer "mirroring guessed").

## 3. Tests

- [x] 3.1 Core Vitest (`packages/core/**/__tests__` or the existing srs test): for a fixed `prev` with ease above floor, assert `reviewCardBinaryInsight` → `interval === 1` AND `insightEase === prev.ease * 0.8` AND the three modifiers are distinct on ease: `insightEase < plainWrongEase (prev.ease*0.85) < guessedEase (prev.ease preserved)`.
- [x] 3.2 Assert the ease floor holds: a `prev.easeFactor` at/near `EASE_FLOOR` does not drop below `EASE_FLOOR`.
- [x] 3.3 Run `pnpm --filter @study-rpg/core build` + `pnpm --filter @study-rpg/core test` + `pnpm --filter @study-rpg/neurons-tw test` — all green.

## 4. Verify

- [x] 4.1 `pnpm -r typecheck` clean (core dist rebuilt so the app sees the new export).
- [x] 4.2 Chrome / preview smoke: answer wrong → tap 💡觀念洞 → confirm the flag sets AND the schedule is interval 1 with a lowered ease (inspect `questionHistory` row via DEV globals or a targeted read); tap 觀念洞 again → schedule restored to default; 看錯 leaves schedule unchanged.
- [x] 4.3 Confirm no schema drift: no Dexie `.version()` added (fixture lint no-op), no R2 `SCHEMA_VERSION` bump, no new synced field. Core version bumped PATCH; export is additive (二階 consumer unaffected).
