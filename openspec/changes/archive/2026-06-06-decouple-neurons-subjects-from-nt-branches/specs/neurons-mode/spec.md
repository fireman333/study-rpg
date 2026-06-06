## MODIFIED Requirements

### Requirement: Overview SHALL surface a family subject picker that filters the active quiz pool

The neurons-tw Overview page SHALL render a family card grid that lets the player narrow the quiz question pool to a single neuron family (one of the 11 families enumerated by `content-neurons-tw`) without changing any downstream gameplay mechanic (rewards / SRS / DMN trigger / family mastery accrual remain unchanged). Each card SHALL be its own direct-entry surface — the player clicks a per-card「🎯 答題」 button to open the QuizModal scoped to that family's pool in one action. There SHALL NOT be a filter-selection state on the picker; the click IS the action.

The picker SHALL behave as a **direct-entry grid**, not a selection filter:

- No `selectedFamilyId` React state, no Dexie row, no sync table, no localStorage key, no URL search param holding a「currently selected family」.
- When the player clicks a card's「🎯 答題」 button, Overview SHALL call `filterPoolByFamily(pack.questions, familyId)` (or equivalent) and pass the resulting `Question[]` to a freshly mounted `QuizModal` instance.
- The QuizModal close handler SHALL fully unmount the modal; there SHALL NOT be a「last-played family」 indicator preserved on Overview between sessions.
- Cross-family random entry (the prior「全部」 chip semantic) SHALL be hosted by a separate hero-level CTA per the「Overview SHALL surface a hero CTA for cross-family random quiz entry」 requirement; the picker itself contains only per-family direct-entry cards.

Each family card SHALL source identity from the `content-neurons-tw` family roster (canonical `subject.id` = 國考 subject name, `subject.displayName` = family persona, family sprite key from `theme-pixel-neurons`, **per-subject distinct accent color** sourced from `subject.color`). The accent color SHALL be distinct per family — families that happen to share an NT branch SHALL NOT share an accent color, and the accent color SHALL NOT be presented as an NT-branch grouping signal. Cards SHALL NOT hardcode any subject name, family name, or color.

**Card label hierarchy (primary / secondary):**

- The card's **primary** visible label SHALL be the canonical 國考 subject name (`subject.id`, e.g. `藥理學`, `公共衛生學`, `寄生蟲學`).
- The card's **secondary** supporting label SHALL be the family persona name (`subject.displayName`, e.g. `VTA Dopaminergic — Thrill-Seeker`), rendered as a single line in muted typography beside the primary label. Truncation via ellipsis on narrow viewport is allowed.
- The card's action `button`'s **title** attribute (hover tooltip) SHALL include both labels plus question count: `從 {subject.id} 抽題答題` (and `aria-label` on the parent article SHALL be `{subject.id} · {subject.displayName}` so screen readers get both contexts on focus).

**Per-card embedded chips:**

- Each card SHALL render an inline `MasteryChip` for that family (tier badge + correct/total count + accuracy %), so progression is visible alongside the entry point without requiring a separate「家族熟練度」 list section on Overview.
- Each card SHALL render a 題數 chip showing `{subject.totalQuestions} 題`.

**Exam-paper grouping** SHALL be the organizing grouping: cards are visually grouped into the two 國考第一階 papers — 醫學一 and 醫學二 — under a small paper header (label + family-count) per group, with each group's cards in 試題順序 (the canonical within-paper order from `content-neurons-tw`). The picker SHALL NOT group, label, or color-code cards by NT branch. The exam-paper grouping is the teaching/orientation anchor and SHALL persist regardless of viewport.

Each exam-paper group SHALL render its cards in a responsive card grid (`grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))` or equivalent) so cards reflow from multiple columns on wide desktop down to a single column on narrow phone. Exam-paper headers remain visible at all widths.

**Empty-pool defensive state**: if `family.totalQuestions === 0` (shouldn't happen with shipping content but defensive for fork developers / build issues), the card's 答題 button SHALL render in disabled visual state with `disabled={true}` and a `title` attribute of `本 family 目前無題目`. The card SHALL still render the sprite / labels / mastery chip.

#### Scenario: Card click opens QuizModal restricted to that family

- **GIVEN** the player is on Overview viewing the `藥理學` family card
- **WHEN** the player clicks that card's「🎯 答題」 button
- **THEN** Overview SHALL open `QuizModal` with a candidate pool restricted to questions whose `subjectId` resolves to family `藥理學` (via `filterPoolByFamily(pack.questions, '藥理學')`)
- **AND** no question outside `藥理學` SHALL be served in this session
- **AND** the rewards / SRS / DMN trigger / family-mastery pipelines SHALL operate identically to the unrestricted case

#### Scenario: Picker holds no filter selection state

- **GIVEN** the player clicks `藥理學`'s 答題 button and then closes the QuizModal (Esc / ✕ / backdrop)
- **WHEN** the player returns to Overview
- **THEN** no card SHALL render in any「selected / active / sticky」 visual state
- **AND** no React state, Dexie row, localStorage key, sync table, or URL param SHALL retain `藥理學` as a「last-played」 family
- **AND** the next quiz entry SHALL require a fresh click on any card or the hero random CTA

#### Scenario: Picker card identity sources from content pack

- **GIVEN** a developer changes the `displayName` of family `生理學` in `content-neurons-tw` to `Some New Persona — Tagline`
- **WHEN** the Overview re-renders
- **THEN** the card's primary label SHALL still be `生理學` (since `subject.id` did not change)
- **AND** the card's secondary label SHALL display `Some New Persona — Tagline` without any code change in `apps/neurons-tw/`

#### Scenario: Card primary label is the 國考 subject name

- **GIVEN** the Overview page renders the family card grid for the first time
- **WHEN** the player visually scans the 11 cards
- **THEN** each card's PRIMARY label SHALL display the canonical 國考 subject name (e.g. `藥理學`, `解剖學`, `生物化學`, `組織學`, `生理學`, `病理學`, `微生物學`, `免疫學`, `寄生蟲學`, `公共衛生學`, `胚胎學` — or whichever 11 subjects ship in `content-neurons-tw`)
- **AND** the family persona name (e.g. `VTA Dopaminergic — Thrill-Seeker`) SHALL appear as SECONDARY supporting text beside the primary on the same card
- **AND** hovering the card's 答題 button SHALL surface a tooltip referencing the subject id

#### Scenario: Each family card has a distinct accent color

- **GIVEN** the Overview page renders the 11 family cards
- **WHEN** the player visually scans the card wall
- **THEN** each of the 11 cards SHALL render a distinct accent color sourced from its `subject.color`
- **AND** two families that share an NT branch (e.g. `解剖學` and `生理學`, both Glu) SHALL NOT render the same accent color
- **AND** no card grouping, header, or accent color SHALL present the 11 families under an NT-branch (DA / 5-HT / GABA / Glu) taxonomy

#### Scenario: Cards group by exam paper with paper headers

- **GIVEN** the Overview page renders the family card grid
- **WHEN** the player scrolls through the picker section
- **THEN** the cards SHALL appear in two exam-paper-grouped sections in this order: `醫學一`, then `醫學二`
- **AND** each section header SHALL render with a paper label + family-count text (no NT-branch label, no NT-branch colored dot)
- **AND** within each section the cards SHALL appear in the canonical 試題順序 from `content-neurons-tw`
- **AND** there SHALL NOT be any NT-branch (DA / 5-HT / GABA / Glu) grouping, header, or row

#### Scenario: Mastery chip is inline on each card

- **GIVEN** the player has answered some `藥理學` questions raising mastery to silver tier (`16 / 24`, 67%)
- **WHEN** the Overview re-renders the family cards
- **THEN** the `藥理學` card SHALL render a `MasteryChip` inline next to the 題數 chip showing `銀 16/24 67%` (or equivalent tier label + count + accuracy)
- **AND** there SHALL NOT be a separate「🎓 家族熟練度」chip row elsewhere on Overview (mastery context lives only inside the cards)

#### Scenario: Empty-pool card disables the answer button

- **GIVEN** a family in `content-neurons-tw` has `totalQuestions === 0` (defensive — content edge case)
- **WHEN** the Overview renders that family's card
- **THEN** the card's「🎯 答題」 button SHALL render in disabled visual state (`disabled` attribute set, muted color)
- **AND** the button's `title` attribute SHALL be `本 family 目前無題目`
- **AND** the card SHALL still render the sprite / primary label / persona label / 0 題 chip

#### Scenario: Card grid is responsive across viewport widths

- **GIVEN** the Overview page renders the family card grid
- **WHEN** the viewport is approximately 768px (tablet)
- **THEN** each exam-paper section SHALL render its cards in ~4 columns via `auto-fill, minmax(170px, 1fr)`
- **WHEN** the viewport is approximately 414px (iPhone Plus)
- **THEN** each exam-paper section SHALL render its cards in ~2 columns
- **WHEN** the viewport is approximately 360px (iPhone SE)
- **THEN** each exam-paper section SHALL render its cards in 1 column
- **AND** exam-paper headers SHALL remain visible at every width
