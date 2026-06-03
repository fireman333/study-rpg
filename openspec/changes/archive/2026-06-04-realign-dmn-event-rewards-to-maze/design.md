## Context

DMN fate cards (`neurons-dmn-fate-cards`) trigger one of 5 `eventKind` payouts on draw. The payouts were designed pre-`promote-maze-to-home`, when AP gated variant-slot unlocks and a manual pull spent a global energy currency. Post-maze, the economy is: per-branch `maze:<branch>:earned` energy (the sole fuel + pull cost) accrued at correct-answer + reading faucets; settle = the only pull path. This change realigns the 2 events whose payouts targeted the retired mechanics. The earning side (how DMN draws accrue) was just rewired to expedition clears by `add-neurons-expedition-rewards` (08d581b) and is NOT touched here.

## Goals / Non-Goals

**Goals:**
- family-buff accelerates the **real** progression fuel (maze energy) for the buffed family, not the vestigial AP score.
- quick-review-batch becomes a working, on-theme reward (a 5-question 出征 mini-batch) instead of a placeholder, closing a DMN-card → mini-expedition → clears → DMN-draws loop.
- Zero schema / sync change.

**Non-Goals:**
- Not touching variant-rate-up / streak-shield / hidden-reveal (already coherent).
- Not changing how DMN draws are earned, the DMN catalog (20 cards), or artwork.
- Not building an SRS scheduler (the old quick-review premise) — superseded by expedition.
- Not removing AP as a concept (it still feeds leaderboard `total_AP` / card / achievements from normal answers); family-buff simply stops *specifically* pumping it.

## Decisions

### D1 — family-buff: AP bonus → maze energy multiplier
`getActiveFamilyBuffBonus(familyId)` changes meaning from an **additive AP bonus** (0 / 1) to an **energy multiplier** (1.0 / `FAMILY_BUFF_ENERGY_MULT`). Applied at the post-commit maze faucet (the SOLE correct-answer energy faucet now): `accrueMazeEnergy(branch, CORRECT_ENERGY × streakMultiplier(current) × masteryMult × familyBuffMult)`. The in-tx `newAp = prevAp + 1 + dmnApBonus` drops the `+ dmnApBonus` term → family-buff no longer touches AP. Buff is keyed to the answered `familyId`; only correct answers in the buffed family are multiplied (energy routes to that family's branch). Rename the helper to `getActiveFamilyBuffMultiplier` for honest semantics (the old name implied an additive bonus).
- **Why a multiplier not additive energy**: mirrors how `masteryMult` already composes at the same faucet — the multipliers stack cleanly (`mastery × familyBuff`), and a multiplier scales correctly regardless of base/streak/mastery.
- **Alternative considered**: keep AP bonus AND add energy — rejected (muddled; AP is vestigial, doubling down on it is the drift we're fixing).

### D2 — `FAMILY_BUFF_ENERGY_MULT = 2` (dogfood-tunable)
Faithful to the old buff's strength: it was `+1` base `+1` buff per correct = **2× the per-answer AP rate**. Translating to "2× the per-answer maze energy for that family, 1hr" preserves the magnitude intent. Temporary (1hr, `DMN_FAMILY_BUFF_DURATION_MS` unchanged) + single random family → bounded, not OP relative to the permanent mastery ladder (×1.05–1.30). Game-loop number per project.md (not OE-anchored); one constant to retune.

### D3 — quick-review-batch: placeholder toast → actionable 5-question 出征 mini-batch
The DMN dispatcher still emits `dmn.quickReviewBatchRequested` (unchanged). `DmnQuickReviewToast` changes from an inert notice to a CTA. Clicking emits a second UI event `dmn.quickReviewStart`; `OverviewPage` listens and opens the existing expedition `QuizModal` on a capped ≤5-question slice of the wrong pool. The mini-batch reuses `onComplete={onExpeditionComplete}` so clears feed the same `creditExpeditionDraws` axis — a deliberate closed loop.
- **Why click-to-start, not auto-open**: non-intrusive; auto-opening a modal mid-session is jarring. The toast ARMs the option; the player chooses when.
- **Pool slice**: `buildWrongQuestionPool(pack.questions, history).slice(0, 5)`. If <5 wrong, take what exists; if 0, the toast shows "目前沒有錯題可複習" and offers no start button.
- **Alternative considered**: drop quick-review-batch entirely and re-assign those catalog cards to other event kinds — rejected (more invasive to the catalog; the expedition mini-batch is a genuinely good, on-theme reward now that expedition exists).

### D4 — zero schema / sync change
family-buff + variant-rate-up already persist in the existing `dmnActiveBuffs` Dexie table (row shape `{ buffKind, familyId, expiresAt, ... }` — unchanged; we only reinterpret the buff's EFFECT, not its storage). Energy faucet is existing per-branch meta. Quick-review reuses existing expedition state + the existing `dmnUiEvents` bus (one new event name, no persistence). No Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no `SYNCED_META_KEYS` change.

## Risks / Trade-offs

- **[family-buff multiplier composes with mastery + streak → could spike energy]** worst case ×2 (buff) × 1.30 (P1 mastery) × streak — but bounded by 1hr + single family + the streak cap; settles still cost front-loaded energy. Acceptable; dogfood-tune `FAMILY_BUFF_ENERGY_MULT` down if telemetry shows runaway. → Mitigation: single tunable constant.
- **[quick-review mini-batch double-counts toward daily DMN cap]** the mini-batch clears credit the expedition axis like any 出征 → fine (the per-day cap of 2 still bounds total expedition draws; a DMN card spawning a mini-expedition that can earn more draws is the intended loop, capped). → No mitigation needed (cap holds).
- **[helper rename churn]** `getActiveFamilyBuffBonus` → `getActiveFamilyBuffMultiplier` touches its one caller (connectome) + tests. → Small, contained.

## Migration Plan

- No schema migration. Existing active `family-buff` rows in `dmnActiveBuffs` (if any) keep working — the row is unchanged; only its interpretation at the faucet changes (an in-flight buff would now multiply energy instead of AP from the moment this ships). Harmless.
- Rollback = revert the change; no data shape change to undo.
- Deploy rides the normal track-neurons-p4 → main merge + CF Pages.

## Open Questions

- None blocking. `FAMILY_BUFF_ENERGY_MULT = 2` + 5-question cap are dogfood-tunable starting values.
