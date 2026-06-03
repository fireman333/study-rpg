# neurons-dmn-fate-cards (delta)

## MODIFIED Requirements

### Requirement: Five DMN event types SHALL be defined with bounded magnitudes

The `DmnEventKind` enum SHALL include exactly these five values, each with a defined runtime effect:

| `eventKind` | Effect | Magnitude bound |
|---|---|---|
| `family-buff` | Randomly select 1 of the 11 neuron families; for the next 1 hour wall-clock, correct answers attributed to that family SHALL have their post-commit maze-energy faucet multiplied by `FAMILY_BUFF_ENERGY_MULT` (default 2). The buff has NO AP effect (AP no longer gates progression post-`promote-maze-to-home`). | × `FAMILY_BUFF_ENERGY_MULT` maze energy for the buffed family, capped at 1-hour duration |
| `variant-rate-up` | When active, the **next** `pullVariant` (the maze-settle pull) SHALL roll the rarity twice and keep the rarer outcome (single-consume), then revert. | One pull, then revert to a single roll |
| `quick-review-batch` | Arm an actionable 5-question 出征 mini-batch: surface a clickable CTA that opens the expedition `QuizModal` on ≤5 currently-wrong questions (`questionHistory.lastResult === 'wrong'`). Clears flow through `onExpeditionComplete` and credit the expedition DMN draw axis like any 出征. Non-intrusive (the CTA arms; the player chooses to start). | ≤5 questions; clears feed the per-day-capped expedition axis |
| `streak-shield` | Grant a single-use streak immunity token; the next time the player would break their correct-answer streak (a wrong answer), the token SHALL be consumed instead and the current streak preserved. | 1 single-use token, never expires |
| `hidden-reveal` | Reveal the `cardId` of the next undrawn P1 DMN card in the catalog as a "spoiler hint" — the card's silhouette in `DmnCollectionPage` SHALL render with reduced opacity instead of a solid silhouette | UI-only effect; zero gameplay impact |

Each `eventKind` SHALL have **at least 3 cards** in the catalog carrying it (5 × 3 = 15 minimum allocation; remaining 5 catalog slots distribute by rarity preference).

#### Scenario: family-buff multiplies the buffed family's maze energy

- **WHEN** a card with `eventKind === 'family-buff'` is drawn and dispatched
- **THEN** a new row SHALL be added to `dmnActiveBuffs` with `buffKind: 'family-buff'`, `familyId: <randomly selected>`, and `expiresAt: <now + 1 hour>`
- **AND** while active, a correct answer in that `familyId` SHALL accrue `FAMILY_BUFF_ENERGY_MULT`× the maze energy it otherwise would (composed with the existing streak + mastery multipliers) to that family's branch
- **AND** the buff SHALL NOT alter AP for that family (AP gain stays +1 per correct answer)
- **AND** at `expiresAt` the row SHALL be removed (or treated as expired) and the energy multiplier SHALL revert to 1.0

#### Scenario: family-buff does not affect other families

- **GIVEN** an active `family-buff` for family A
- **WHEN** the player answers a question correctly in family B (B ≠ A)
- **THEN** family B's maze energy SHALL accrue with multiplier 1.0 (no buff)

#### Scenario: variant-rate-up consumed by the next settle pull

- **GIVEN** the player has an active `variant-rate-up` buff
- **WHEN** the next `pullVariant` (maze settle) runs
- **THEN** the rarity SHALL be rolled twice and the rarer outcome kept
- **AND** after the pull completes, the buff SHALL be consumed and removed from `dmnActiveBuffs`
- **AND** subsequent pulls SHALL revert to a single rarity roll

#### Scenario: quick-review-batch arms a capped expedition mini-batch

- **WHEN** a card with `eventKind === 'quick-review-batch'` is drawn and dispatched
- **THEN** `dmn.quickReviewBatchRequested` SHALL be emitted and the toast SHALL surface a clickable "5 題快速複習" CTA
- **AND** activating the CTA SHALL open the expedition `QuizModal` on at most 5 currently-wrong questions (fewer if fewer are wrong; if none, the CTA SHALL be absent and the toast SHALL state there is nothing to review)
- **AND** clears in the mini-batch SHALL be credited to the expedition DMN draw axis via `onExpeditionComplete` (subject to the per-day cap)
