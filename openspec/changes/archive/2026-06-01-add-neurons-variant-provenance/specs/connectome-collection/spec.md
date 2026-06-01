## MODIFIED Requirements

### Requirement: Variant slot unlock SHALL emit event when family AP crosses one of five threshold values

The neurons mode SHALL declare a fixed AP threshold ladder mapping to 5 variant slot indices (1-5):

| Slot index | AP threshold |
|---|---|
| 1 | 10 |
| 2 | 30 |
| 3 | 80 |
| 4 | 200 |
| 5 | 500 |

When a family's `actionPotential` crosses one of these thresholds upward (i.e., before increment was below threshold, after is at or above), the system SHALL emit a `connectome.variantSlotUnlocked` event with payload `{ familyId, slotIndex, apAtUnlock, wasRedemption }`. The system SHALL persist a per-family `unlockedSlots` set (or equivalent) so each slot fires its event at most once over the save's lifetime.

The `wasRedemption` field carries the mint-time context of the **triggering correct answer**: `true` when that answer's question had `everWrong === true` before the answer, `false` otherwise. It SHALL be supplied to the connectome entry point via an **additive, optional** context argument to `recordCorrectAnswer(familyId, ctx?)`; when the argument is omitted, `wasRedemption` SHALL default to `false` (backward-compatible). This capability SHALL NOT itself query question-history — the caller (the quiz flow) computes `wasRedemption` and passes it in. This capability only forwards the value into the event payload.

This capability SHALL NOT implement the variant gacha logic itself (no roll-and-assign, no rarity selection); the gacha behavior is `wire-neuron-variant-gacha` capability's responsibility. This capability only exposes the unlock signal (now including the redemption context).

#### Scenario: AP crossing 10 emits slot 1 unlock event exactly once

- **GIVEN** a family's current `actionPotential` is 9 and `unlockedSlots` is empty
- **WHEN** the player answers a correct question for that family
- **THEN** the family's `actionPotential` SHALL become 10
- **AND** a `connectome.variantSlotUnlocked` event SHALL have been emitted with payload `{ familyId, slotIndex: 1, apAtUnlock: 10, wasRedemption: <forwarded value> }`
- **AND** the family's `unlockedSlots` SHALL include 1

#### Scenario: Subsequent AP increments past 10 do not re-emit slot 1 event

- **GIVEN** a family's `actionPotential` is 10 and `unlockedSlots = {1}`
- **WHEN** the player answers another correct question for that family (AP → 11)
- **THEN** no `connectome.variantSlotUnlocked` event SHALL be emitted for slot 1
- **AND** the family's `unlockedSlots` SHALL still equal `{1}`

#### Scenario: Crossing multiple thresholds in a single answer (impossible by increment-1 rule) is therefore not a concern

- **GIVEN** AP increments by exactly 1 per correct answer (per the AP requirement)
- **THEN** at most one slot SHALL ever unlock per single correct answer

#### Scenario: Triggering answer's redemption status is forwarded into the payload

- **GIVEN** the player answers a correct question whose `everWrong` was `true` before this answer, and that answer crosses a slot threshold
- **WHEN** the `connectome.variantSlotUnlocked` event is emitted
- **THEN** the payload's `wasRedemption` SHALL be `true`

#### Scenario: Omitted context argument defaults wasRedemption to false

- **GIVEN** a caller invokes `recordCorrectAnswer(familyId)` without the optional context argument, and the answer crosses a slot threshold
- **WHEN** the `connectome.variantSlotUnlocked` event is emitted
- **THEN** the payload's `wasRedemption` SHALL be `false`
