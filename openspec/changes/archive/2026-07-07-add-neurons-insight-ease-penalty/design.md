## Context

`add-neurons-weakness-radar-and-error-repair` added the post-wrong 👁看錯 / 💡觀念洞 error-cause modifiers. In the wiring (`QuizModal.tsx` `runWrongCauseToggle`), 觀念洞 toggle-ON reuses `applyGuessedModifier` → `reviewCardBinaryGuessed`, which forces `interval = 1` with **ease preserved**. `reviewCardBinaryGuessed` exists for 🤔「我亂猜的」— a *lucky guess on a correct answer* — where preserving ease is right (the card was correct, just uncertain). Applying that same function to a self-declared concept gap is a category error: the gap keeps its ease and escapes the review loop as fast as a guess.

Relevant existing core constants (`packages/core/src/lib/srs.ts`): `WRONG_INTERVAL_MULTIPLIER = 0.5`, `WRONG_EASE_MULTIPLIER = 0.85`, `GUESSED_RESET_INTERVAL = 1`, `EASE_FLOOR = 1.3`. Plain wrong (`reviewCardBinary` correct=false) already lowers ease (`× 0.85`, floored). Guessed preserves ease.

This change (Fable-review verdict: build A, defer B) gives 觀念洞 its own schedule.

## Goals / Non-Goals

**Goals:**
- 觀念洞 re-graduates a concept gap *slower* than a plain wrong and a lucky guess (distinct, harsher ease).
- Keep `interval = 1` (come back tomorrow) — that part was already correct.
- Preserve the three-state toggle: toggle-OFF still restores the default post-answer snapshot.
- Zero schema / sync change; keep the core addition additive (non-breaking for the standalone 二階 consumer).

**Non-Goals:**
- Concept-tag sibling expansion (deferred — premature, front-of-pool noise risk, needs real tag-cooccurrence telemetry first).
- Changing 看錯 (it stays ordering-only, no schedule change).
- Changing `everWrong` semantics (monotonic-OR invariant preserved).
- Auto-suggesting 觀念洞 vs 看錯 from answer latency (out of scope).

## Decisions

### Decision 1 — Ease multiplier `0.8×` (one notch harsher than plain-wrong `0.85×`)

A self-declared 觀念洞 is a stronger "I don't get this" signal than an unflagged wrong (which folds in careless slips already covered by 看錯). So it decays ease slightly faster than a plain wrong — but stays *near* the wrong path so tuning stays legible and one flag can't nuke a card to `EASE_FLOOR` in a single hit.

*Alternative considered — `0.7×` (much harsher):* rejected. Too aggressive for a **manually-set, sometimes-stale** flag (a concept since fixed but never un-flagged would keep punishing). `0.8×` is safe; it can be lowered later if dogfood telemetry shows concept gaps aren't recurring enough. Constant `INSIGHT_EASE_MULTIPLIER` is exported so it's dogfood-tunable in one place.

*Alternative — reuse `WRONG_EASE_MULTIPLIER` (0.85, parity with plain wrong):* rejected — then 觀念洞's only edge over an unflagged wrong is the interval-1 reset, which for many cards a plain wrong already approximates; the flag would carry little scheduling weight.

### Decision 2 — New core function `reviewCardBinaryInsight`, not an app-layer computation

Ease/interval math lives in `packages/core/src/lib/srs.ts` alongside the other three `reviewCardBinary*` modifiers, for parity + a single tested home. It is a pure additive export → non-breaking → a PATCH publish for the standalone 二階 consumer (which consumes `@study-rpg/core` from npm). It reuses the file-local `EASE_FLOOR` and `GUESSED_RESET_INTERVAL`.

```ts
export const INSIGHT_EASE_MULTIPLIER = 0.8
export function reviewCardBinaryInsight(input: { prev: BinaryReviewPrev; now?: number }): BinaryReviewResult {
  const { prev } = input
  const now = input.now ?? Date.now()
  return {
    interval: GUESSED_RESET_INTERVAL,
    easeFactor: Math.max(EASE_FLOOR, prev.easeFactor * INSIGHT_EASE_MULTIPLIER),
    nextDueAt: now + GUESSED_RESET_INTERVAL * DAY,
  }
}
```

### Decision 3 — Toggle-OFF restore is unchanged (the flagged bug's mitigation)

`runWrongCauseToggle('insight')` OFF path already calls `restoreDefaultSrs(defaultPostSrsRef.current)`. Only the ON path swaps `applyGuessedModifier` → `applyInsightModifier`. This preserves three-state behavior — un-flagging a 觀念洞 restores the plain post-answer schedule, so a decremented-ease card is never left stuck. (Fable gotcha explicitly verified.)

## Risks / Trade-offs

- **Manual flag is noisy / can go stale** → Mitigation: the penalty applies only at the toggle event (never as a standing modifier); toggle-OFF restores default; `0.8×` is deliberately mild (a single flag can't floor a card). A stale flag on a since-fixed concept only costs one extra ease notch, self-corrected on the next correct answer's normal SM-2 climb.
- **Ease could hit the floor faster on repeatedly-flagged cards** → Mitigation: `EASE_FLOOR = 1.3` is shared with the plain-wrong path; behavior at the floor is identical to an already-struggling card. No new failure mode.
- **Core PATCH publish must reach the 二階 standalone repo** → additive-only export keeps it a clean PATCH; no consumer break. (二階 doesn't call the new fn, so it's inert there.)

## Migration Plan

Pure client-side behavior change, no data migration. Old `questionHistory` rows are untouched; the new schedule only applies to future 觀念洞 taps. Deploy = merge `track-neurons` → main → push (CF Pages) after owner authorization. Rollback = revert (the field values it writes are ordinary SRS fields the engine already understands).

## Open Questions

- Final `INSIGHT_EASE_MULTIPLIER` value (`0.8` initial; dogfood-tunable). Not blocking.
