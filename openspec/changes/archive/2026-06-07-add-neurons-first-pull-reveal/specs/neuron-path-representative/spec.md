## MODIFIED Requirements

### Requirement: Per-family first-pull grant on a family's first answer

The system SHALL grant each subject family exactly one free **first-pull** variant the first time the player completes an answer for that family. The trigger SHALL fire on the first answer whether the answer is correct or incorrect. The granted variant SHALL be a guaranteed common-tier (P5) variant for that family, minted **without an inline reveal during the answer** through the existing variant-gacha path (not a parallel mint) and stamped with a first-pull provenance. The grant SHALL be idempotent — recorded once per family and never re-granted, including after a cross-device sync that brings in a fresh device. The grant SHALL run after the answer is committed and SHALL NOT break or block the answer flow if it fails (best-effort; errors surfaced to a dedicated log channel, not to the player).

Minting "without an inline reveal during the answer" means: no reveal modal pops while the player is in the quiz, and no inline achievement-toast flood; achievement unlocks still persist. Instead, the system SHALL show **one deferred reveal per first-pull** — reusing the standard variant-unlock reveal — when the player next returns to the maze/home (e.g. on closing the quiz). When several first-pulls accrue in a single quiz session, each SHALL be revealed (sequentially) on return. The deferred reveal is presentational and best-effort: if it is not shown (e.g. the player reloads before returning), the variant remains collected and set as the family representative. The P0 pity counter and dupe handling SHALL follow the gacha's normal behavior.

#### Scenario: First answer grants one P5 and sets the representative

- **WHEN** the player completes their first answer (correct or incorrect) for a family that has no recorded first-pull
- **THEN** one guaranteed-P5 variant for that family is minted silently (no mid-quiz reveal) via the gacha and recorded as that family's first-pull
- **AND** the family's representative is set to that variant

#### Scenario: The first-pull reveal is deferred to the player's return to the maze

- **WHEN** a first-pull P5 was minted during a quiz and the player then closes the quiz (returns to the maze/home)
- **THEN** the standard variant-unlock reveal plays once for that first-pull P5
- **AND** no reveal was shown while the player was still answering in the quiz

#### Scenario: Multiple first-pulls in one session each reveal on return

- **WHEN** the player triggers first-pulls for more than one family within a single quiz session and then closes the quiz
- **THEN** each first-pull P5 is revealed in turn on return

#### Scenario: Subsequent answers do not re-grant

- **WHEN** the player answers more questions for a family that already has a recorded first-pull
- **THEN** no additional free pull is granted

#### Scenario: Fresh device does not re-trigger the grant

- **WHEN** a second device with no local first-pull record pulls the family's synced state showing a first-pull was already recorded
- **THEN** the device adopts the existing first-pull record and does NOT mint another variant
