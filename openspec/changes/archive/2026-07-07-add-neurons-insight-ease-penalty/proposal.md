## Why

When a player taps 💡「觀念洞」on a wrong answer, the QuizModal currently applies `applyGuessedModifier` → `reviewCardBinaryGuessed`, which forces `interval = 1` but **preserves the ease factor** — the identical schedule used by 🤔「我亂猜的」(a lucky guess on a *correct* answer). But a self-declared concept gap and a lucky guess are opposite signals: a guess means "I actually know this, that was noise"; 觀念洞 means "I genuinely don't." Reusing the guess schedule means a flagged concept gap keeps its ease, so after a single correct answer it re-graduates to a long interval **as fast as a lucky guess** — the opposite of the "come back sooner and stay stickier" behavior the flag promises. This is a latent bug, not an optimization.

## What Changes

- **New core SRS function** `reviewCardBinaryInsight` in `packages/core/src/lib/srs.ts`: `interval = 1` (like guessed) **plus** an ease decrement `easeFactor × INSIGHT_EASE_MULTIPLIER` (new constant `= 0.8`), floored at the existing `EASE_FLOOR = 1.3`. Additive export — no breaking change, a PATCH publish for the standalone 二階 consumer.
- **New app helper** `applyInsightModifier` in `apps/neurons-tw/src/lib/services/srs-scheduler.ts`, mirroring `applyGuessedModifier` but calling `reviewCardBinaryInsight`.
- **Swap the QuizModal call**: `runWrongCauseToggle('insight')` toggle-ON applies `applyInsightModifier` instead of `applyGuessedModifier`. Toggle-OFF still restores the default post-answer snapshot via the existing `restoreDefaultSrs` (unchanged).
- **Net effect**: the three "quality" schedules become distinct on ease — 觀念洞 (`0.8×`, lowest) < plain-wrong (`0.85×`) < 我亂猜的 (ease preserved, highest) — all sharing `interval = 1` where applicable, so a concept gap re-graduates *slower* than both a plain wrong and a lucky guess.
- **No** concept-tag sibling expansion (deferred per Fable review — premature, noise risk, needs real tag-cooccurrence data first).
- **Zero schema**: reuses the already-synced `questionHistory` SRS fields; no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no new synced field.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `neurons-quiz-modes`: the 觀念洞 error-cause modifier's SRS effect changes from "mirroring `reviewCardBinaryGuessed` (interval-reset, ease preserved)" to a **distinct schedule** — interval 1 **plus** an ease decrement (harsher than a plain wrong), so a concept gap re-graduates slower than a lucky guess.

## Impact

- **Core** (`packages/core/src/lib/srs.ts`): add `INSIGHT_EASE_MULTIPLIER` + `reviewCardBinaryInsight` (additive; PATCH version bump; the API-surface addition is non-breaking so no fork-contract break).
- **App** (`apps/neurons-tw/`): `lib/services/srs-scheduler.ts` (add `applyInsightModifier`), `components/QuizModal.tsx` (import + swap one call in `runWrongCauseToggle`).
- **Tests**: a core Vitest asserting all three modifiers now yield distinct ease outcomes (觀念洞 `interval===1 && insightEase < plainWrongEase < guessedEase`).
- **Sync / storage**: none — no schema bump, no new synced state. The upgrade-fixture rule does not trigger (no `.version()` bump).
