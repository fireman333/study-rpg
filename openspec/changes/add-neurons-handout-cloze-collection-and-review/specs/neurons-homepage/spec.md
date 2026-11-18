## ADDED Requirements

### Requirement: Homepage SHALL surface a reward-free handout cloze due-card reminder

The homepage SHALL render a compact 「📇 今日字卡 N 張」 reminder in the FamilyPicker header area, beside the existing 考前救急 entry, WHEN today's pushed-card count defined by `neurons-handout-cloze-review` is at least 1. Activating it SHALL navigate to `/cram/cards`. The reminder SHALL NOT render while the card corpus or the card table is loading, when the corpus fails to load, or when the pushed-card count is 0.

The reminder SHALL be navigation only. It SHALL NOT:
- start a review by itself, or consume any card from the daily push journal;
- add to, or read from, the 🔄 錯題 chip counts, the 錯題出征 pool, the daily prescription, or the rescue state;
- grant AP, maze energy, DMN draw entitlement or any other reward;
- write any Dexie row, `meta` key, or device-local storage key.

Its icon SHALL be a pixel sprite. The pushed-card count SHALL be computed from data loaded outside the reactive query that reads the card table, so that the count updates after a review without a reload.

#### Scenario: Cards are pushed today
- **GIVEN** 12 cards in today's pushed set
- **WHEN** the learner opens the homepage
- **THEN** the reminder SHALL read 12 cards AND activating it SHALL open `/cram/cards`

#### Scenario: Nothing pushed today
- **GIVEN** cards are collected but today's pushed set is empty
- **WHEN** the homepage renders
- **THEN** the reminder SHALL NOT render

#### Scenario: The reminder is inert
- **GIVEN** a snapshot of every Dexie store and of the push journal
- **WHEN** the learner opens the homepage, sees the reminder and activates it
- **THEN** every store and the push journal SHALL be unchanged, AND the 🔄 錯題 chip counts of every family SHALL be unchanged

#### Scenario: Count follows a review
- **GIVEN** the reminder reads 12 cards
- **WHEN** the learner reviews 5 of the pushed cards and returns to the homepage without reloading
- **THEN** the reminder SHALL read 7 cards
