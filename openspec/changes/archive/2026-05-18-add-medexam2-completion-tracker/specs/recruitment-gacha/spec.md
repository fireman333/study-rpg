## MODIFIED Requirements

### Requirement: Banner UI SHALL display per-subject state and progress

The `apps/medexam2-hospital-tw` HomePage SHALL render a grid of 14 banners, one per subject. Each banner SHALL visually convey:

- Subject `displayName`
- Current `affinity[subjectId]` and `threshold[subjectId]` (e.g., `5 / 11`)
- Locked state visual treatment when `affinity < threshold` (e.g., greyed out + lock icon)
- Unlocked state with active roll button when `affinity >= threshold`
- **A completion chip displaying `✅ X / Y` where `X` = the count of distinct `questionId` answered for that subject (via `questionHistory`) and `Y` = the playable pool size for that subject (excluding `hasOptionImages` questions). When `X === Y` the chip SHALL render in a celebratory variant (gold accent + 🏆 icon) without emitting any reward.**

The HomePage SHALL also display the current `tickets.available` value prominently.

**The completion chip and the existing `🔴 N due` chip SHALL coexist as siblings within the banner header region. The completion chip SHALL update live as `questionHistory` rows are written (via `useLiveQuery`). The completion chip SHALL be rendered for both locked and unlocked banners.**

#### Scenario: Locked banner renders progress

- **GIVEN** `affinity[眼科] = 4` and `threshold[眼科] = 10`
- **WHEN** the HomePage renders
- **THEN** the 眼科 banner SHALL show `4 / 10`
- **AND** the banner SHALL have visual locked treatment
- **AND** the roll button SHALL be disabled or replaced with `「再答對 6 題眼科可解鎖」`

#### Scenario: Unlocked banner shows active roll

- **GIVEN** `affinity[外科] >= threshold[外科]` and `tickets.available >= 1`
- **WHEN** the HomePage renders
- **THEN** the 外科 banner SHALL have visual unlocked treatment
- **AND** the roll button SHALL be enabled and clickable

#### Scenario: Completion chip renders distinct-question count

- **GIVEN** the playable pool size of `內科` is 612 (after excluding `hasOptionImages` questions)
- **AND** `questionHistory` contains 23 distinct `questionId` rows whose `subjectId = 內科` (across any number of attempts each)
- **WHEN** the HomePage renders
- **THEN** the 內科 banner SHALL render a chip displaying `✅ 23 / 612`
- **AND** the chip SHALL be visually distinct from (but rendered as a sibling of) the `🔴 N due` chip

#### Scenario: Completion chip updates live after answering

- **GIVEN** the 內科 banner shows `✅ 23 / 612`
- **WHEN** the player opens the QuizModal for 內科 and answers a question whose id is not currently in `questionHistory`
- **THEN** within one render cycle the 內科 banner chip SHALL update to `✅ 24 / 612`
- **AND** answering a repeat question (id already in `questionHistory`) SHALL NOT change the displayed numerator

#### Scenario: 100% completion renders celebratory chip

- **GIVEN** the playable pool size of `麻醉科` is 187
- **AND** `questionHistory` contains 187 distinct `questionId` rows for `麻醉科`
- **WHEN** the HomePage renders
- **THEN** the 麻醉科 banner chip SHALL render in a gold-accent variant with `🏆 187 / 187`
- **AND** no toast, modal, or reward side-effect SHALL fire from reaching 100%

#### Scenario: Completion chip renders on locked banners

- **GIVEN** the 眼科 banner is in locked state (`affinity < threshold`)
- **WHEN** the HomePage renders
- **THEN** the 眼科 banner SHALL still render its `✅ X / Y` chip with the correct distinct-question count
