## REMOVED Requirements

### Requirement: The first due review that reaches a 21-day interval SHALL latch maturity once

**Reason**: Its third paragraph ("This change SHALL NOT read it, write it, or grant anything for maturity") and its scenario "Maturity grants nothing yet" stated the scope boundary of `add-neurons-handout-cloze-collection-and-review`. The maturity reward now reads and writes `clozeMaturityDrawsCredited` and credits a DMN draw, so both would be false. A MODIFIED delta cannot drop a scenario, so the requirement is replaced whole.

**Migration**: Replaced by `Maturity SHALL be latched once, by the first due review that reaches a 21-day interval` below. Its first two paragraphs and the scenario "Maturity is latched once" are carried over word for word. What maturity grants is now stated by `Every Nth matured card credits one DMN draw`.

## ADDED Requirements

### Requirement: Maturity SHALL be latched once, by the first due review that reaches a 21-day interval

A card **matures** when a due-review rating produces an interval of at least 21 days while its row has no `maturedAt`. A 提前複習 rating SHALL NOT mature a card. The review SHALL then set `maturedAt` to the time of that rating.

`maturedAt` SHALL NOT be cleared or moved later by a later rating (including 答錯), by uncollecting, or by a sync merge.

The synced meta key `clozeMaturityDrawsCredited` SHALL exist in `SYNCED_META_KEYS` and SHALL merge across devices by numeric MAX through the post-pull counter backfill, in both directions. It SHALL be written only by the maturity reward defined in this capability.

#### Scenario: Maturity is latched once
- **GIVEN** a card at interval 18 with no `maturedAt`
- **WHEN** the learner chooses 有把握 in a due review and the new interval is 45
- **THEN** `maturedAt` SHALL be set
- **AND** a later 答錯 on the same card SHALL leave `maturedAt` unchanged

#### Scenario: Practice cannot mature a card
- **GIVEN** a collected card at interval 18, due in three days, with no `maturedAt`
- **WHEN** the learner rates it 有把握 four times through 提前複習
- **THEN** `maturedAt` SHALL still be empty AND `clozeMaturityDrawsCredited` SHALL be unchanged

### Requirement: Every Nth matured card credits one DMN draw

The account's **matured count** SHALL be the number of rows in `handoutClozeState` whose `maturedAt` is a finite number. A row whose `maturedAt` is absent, `null`, or any non-numeric or non-finite value SHALL NOT be counted. The count SHALL include rows that are uncollected and rows whose card is retired from the corpus, because maturity is a permanent latch, and it SHALL NOT depend on the corpus loading.

The draws **owed** SHALL be `floor(matured count / N) − clozeMaturityDrawsCredited`, where `N` is a single content constant `DMN_CLOZE_MATURED_PER_DRAW` with starting value 10; a negative value SHALL be treated as 0. A missing or malformed `clozeMaturityDrawsCredited` SHALL be read as 0.

When the owed draws are positive, the reward SHALL, in one transaction that also reads the matured count and the ledger:
- raise `dmnGrantsTotal` by that number (seeding it as `neurons-dmn-fate-cards` requires when absent) and re-derive `dmnDrawsAvailable`;
- raise `clozeMaturityDrawsCredited` by the same number.

`clozeMaturityDrawsCredited` SHALL never be lowered, including when it exceeds `floor(matured count / N)`. These draws SHALL NOT count toward, or be limited by, the expedition-axis or behavior-axis daily caps.

The reward SHALL run after a due-review rating that set `maturedAt`, once that rating has been stored; after every sync pull cycle completes, once the counter and DMN merges of that cycle have run; and once per app load, after the DMN grants-total migration. Cards that matured before this reward shipped SHALL be credited by the first run.

The reward SHALL NOT directly grant AP, maze energy, equipment or consumables; a DMN draw it credits yields whatever a draw yields under `neurons-dmn-fate-cards`. It SHALL NOT write `questionHistory`, `handoutClozeState` or any DMN per-day counter. Over an account's lifetime it SHALL credit at most `floor(C / N)` draws, where `C` is the number of distinct card ids that have ever shipped.

When two devices credit before either has synced, the merged state SHALL hold no more maturity draws than `floor(union matured count / N)`. A maturity credit absorbed by the MAX merge of `dmnGrantsTotal` — because another device raised it concurrently from another source — SHALL be accepted as permanently lost, since `clozeMaturityDrawsCredited` keeps the credit.

When draws were credited by ratings in a review session, that session's end-of-session summary SHALL state how many DMN draws were credited. Credits made after a pull or at app load SHALL be silent.

#### Scenario: The tenth matured card credits a draw
- **GIVEN** 9 matured rows and `clozeMaturityDrawsCredited = 0`
- **WHEN** a due review matures a tenth card
- **THEN** `dmnGrantsTotal` and `dmnDrawsAvailable` SHALL each rise by 1 AND `clozeMaturityDrawsCredited` SHALL be 1
- **AND** the review session's summary SHALL state one DMN draw

#### Scenario: Cards matured before the reward shipped are credited at load
- **GIVEN** 23 matured rows and `clozeMaturityDrawsCredited` absent
- **WHEN** the app loads
- **THEN** 2 DMN draws SHALL be credited AND `clozeMaturityDrawsCredited` SHALL be 2, AND no message SHALL be shown

#### Scenario: Uncollected and retired cards still count
- **GIVEN** 10 matured rows, one of them uncollected and one whose card is no longer in the corpus, and `clozeMaturityDrawsCredited = 0`
- **WHEN** the reward runs
- **THEN** 1 draw SHALL be credited

#### Scenario: A malformed maturedAt is not counted
- **GIVEN** 9 rows with a numeric `maturedAt`, one row whose `maturedAt` is the string `"x"`, one whose `maturedAt` is absent, and `clozeMaturityDrawsCredited = 0`
- **WHEN** the reward runs
- **THEN** no draw SHALL be credited

#### Scenario: Credited ahead of matured credits nothing and is not lowered
- **GIVEN** 12 matured rows and `clozeMaturityDrawsCredited = 3`
- **WHEN** the reward runs
- **THEN** no draw SHALL be credited AND `clozeMaturityDrawsCredited` SHALL stay 3

#### Scenario: Daily caps neither block nor absorb the maturity draw
- **GIVEN** today's expedition-axis and behavior-axis draws are both at their caps, 10 matured rows and `clozeMaturityDrawsCredited = 0`
- **WHEN** the reward runs
- **THEN** 1 draw SHALL be credited AND both per-day counters SHALL be unchanged

#### Scenario: The same milestone credited on two devices yields one draw
- **GIVEN** devices A and B synced at `clozeMaturityDrawsCredited = 0` and `dmnGrantsTotal = E`, each with the same 9 matured rows
- **WHEN** A matures card x and B matures card y before either syncs, each crediting one draw, and then the two sync both ways
- **THEN** each device SHALL hold `clozeMaturityDrawsCredited = 1` and `dmnGrantsTotal = E + 1`
- **AND** the reward run after the pull SHALL credit nothing, since 11 matured cards owe 1 draw

#### Scenario: Different milestones on two devices are both credited
- **GIVEN** devices A and B synced at `clozeMaturityDrawsCredited = 0` and `dmnGrantsTotal = E`, with no matured rows
- **WHEN** A matures 10 cards and B matures 10 other cards before either syncs, each crediting one draw, and then the two sync both ways
- **THEN** the reward run after the pull SHALL credit one more draw, leaving `clozeMaturityDrawsCredited = 2` and `dmnGrantsTotal = E + 2`

#### Scenario: The lifetime total is bounded by the corpus
- **GIVEN** every card id in the shipped corpus has a matured row
- **WHEN** the reward runs any number of times
- **THEN** `clozeMaturityDrawsCredited` SHALL equal `floor(shipped card count / N)`

## MODIFIED Requirements

### Requirement: Card collection and review SHALL grant nothing and SHALL write nothing outside the card table

Collecting, uncollecting, rating and practising a card, and showing a card in a push-started review, SHALL write only:
- `handoutClozeState` (never by 提前複習);
- the device-local card telemetry log;
- the acting account's daily push journal, and only when a card is consumed.

The telemetry log and the push journal live in device-local browser storage, not in Dexie.

They SHALL NOT:
- grant AP, maze energy, DMN draw entitlement (`dmnGrantsTotal`, `dmnDrawsAvailable` or any DMN axis counter), equipment, consumables or achievements;
- write `questionHistory`, family mastery, study minutes, streaks, expedition progress, the daily prescription families, rescue state or the wrong-answer list.

This follows the rule that study-only practice surfaces do not feed the game economy. The one exception is the maturity reward (`Every Nth matured card credits one DMN draw`): a due-review rating that sets `maturedAt` MAY be followed by that reward, which writes only `dmnGrantsTotal`, `dmnDrawsAvailable` and `clozeMaturityDrawsCredited` in `meta`. No other exception SHALL exist, and 提前複習 SHALL NOT trigger it.

#### Scenario: A review session leaves the economy untouched
- **GIVEN** a snapshot of every Dexie store except `handoutClozeState`
- **AND** no card reviewed in the session reaches maturity
- **WHEN** the learner collects three cards, reviews ten cards with mixed ratings, practises two cards and closes the review
- **THEN** every store in the snapshot SHALL be byte-for-byte unchanged

#### Scenario: Maturity is the only exception, and it moves only its own keys
- **GIVEN** the same snapshot, 9 matured rows and `clozeMaturityDrawsCredited = 0`
- **WHEN** the learner's due review matures a tenth card
- **THEN** in `meta` only `dmnGrantsTotal` (+1), `dmnDrawsAvailable` (+1) and `clozeMaturityDrawsCredited` (+1) SHALL differ
- **AND** every other key and every other store in the snapshot SHALL be byte-for-byte unchanged

### Requirement: The help menu SHALL explain cards, and every card icon SHALL be a pixel sprite

The HelpMenu SHALL contain a 講義字卡 section. Its summary SHALL say where cards are collected and that they are reviewed on 我的字卡. Its details SHALL state what the three ratings do; the daily push quantity, rendered from its constant, and that the learner may keep reviewing past it; that 提前複習 is practice only and does not move a card's schedule or count toward maturity; that a card whose source changed keeps its progress; and what maturity is and what it grants — the maturity interval, the number of matured cards per DMN draw, and that uncollected or retired cards still count — each figure rendered from the constant the reward reads. The HelpMenu DMN 抽卡 section SHALL list card maturity as a draw source, with the number of matured cards per draw rendered from the same constant.

Every icon this feature renders as a UI element SHALL be a pixel sprite rendered through the app's emoji icon component, not a system emoji glyph.

#### Scenario: The push quantity is not a literal
- **WHEN** the daily push quantity constant changes
- **THEN** the help section SHALL show the new value without a copy edit

#### Scenario: The maturity figures are not literals
- **WHEN** the matured-cards-per-draw constant or the maturity interval constant changes
- **THEN** the 講義字卡 section and the DMN 抽卡 section SHALL show the new values without a copy edit
