## MODIFIED Requirements

### Requirement: Overview SHALL surface a family subject picker that filters the active quiz pool

The neurons-tw Overview page SHALL render a family card grid that lets the player narrow the quiz question pool to a single neuron family (one of the 11 families enumerated by `content-neurons-tw`) without changing any downstream gameplay mechanic (rewards / SRS / DMN trigger / family mastery accrual remain unchanged). Each card SHALL be its own direct-entry surface — the player clicks a per-card「🎯 答題」 button to open the QuizModal scoped to that family's pool in one action. There SHALL NOT be a filter-selection state on the picker; the click IS the action.

The picker SHALL behave as a **direct-entry grid**, not a selection filter:

- No `selectedFamilyId` React state, no Dexie row, no sync table, no localStorage key, no URL search param holding a「currently selected family」.
- When the player clicks a card's「🎯 答題」 button, Overview SHALL call `filterPoolByFamily(pack.questions, familyId)` (or equivalent) and pass the resulting `Question[]` to a freshly mounted `QuizModal` instance.
- The QuizModal close handler SHALL fully unmount the modal; there SHALL NOT be a「last-played family」 indicator preserved on Overview between sessions.
- Cross-family random entry (the prior「全部」 chip semantic) SHALL be hosted by a separate hero-level CTA per the「Overview SHALL surface a hero CTA for cross-family random quiz entry」 requirement; the picker itself contains only per-family direct-entry cards.

Each family card SHALL source identity from the `content-neurons-tw` family roster (canonical `subject.id` = 國考 subject name, `subject.displayName` = family persona, family sprite key from `theme-pixel-neurons`, NT-branch-derived accent color). Cards SHALL NOT hardcode any subject name, family name, or color.

**Card label hierarchy (primary / secondary):**

- The card's **primary** visible label SHALL be the canonical 國考 subject name (`subject.id`, e.g. `藥理學`, `公共衛生學`, `寄生蟲學`).
- The card's **secondary** supporting label SHALL be the family persona name (`subject.displayName`, e.g. `VTA Dopaminergic — Thrill-Seeker`), rendered as a single line in muted typography beside the primary label. Truncation via ellipsis on narrow viewport is allowed.
- The card's action `button`'s **title** attribute (hover tooltip) SHALL include both labels plus question count: `從 {subject.id} 抽題答題` (and `aria-label` on the parent article SHALL be `{subject.id} · {subject.displayName}` so screen readers get both contexts on focus).

**Per-card embedded chips:**

- Each card SHALL render an inline `MasteryChip` for that family (tier badge + correct/total count + accuracy %), so progression is visible alongside the entry point without requiring a separate「家族熟練度」 list section on Overview.
- Each card SHALL render a 題數 chip showing `{subject.totalQuestions} 題`.

**NT-branch grouping** SHALL be preserved: cards are visually grouped by their `subject.group` field (one of `DA` / `5HT` / `GABA` / `Glu`) under a small branch header (dot + label + count) per group. The branch grouping is the neuroanatomy teaching anchor and SHALL persist regardless of viewport.

The card grid SHALL be responsive: per-branch row uses `grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))` so cards reflow to 4 columns on wide desktop, 2 columns on mid-width (≈ 414px viewport), 1 column on narrow phone (≈ 360px viewport). NT-branch headers remain visible at all widths.

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

#### Scenario: Cards group by NT branch with branch headers

- **GIVEN** the Overview page renders the family card grid
- **WHEN** the player scrolls through the picker section
- **THEN** the cards SHALL appear in NT-branch-grouped rows in this order: `DA · 多巴胺`, `5-HT · 血清素`, `GABA · γ-胺基丁酸`, `Glu · 麩胺酸`
- **AND** each branch header SHALL render with a colored dot matching the branch accent + branch label + family-count text
- **AND** branches with zero families in the roster SHALL not render a header (no empty rows)

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
- **THEN** each NT-branch row SHALL render cards in ~4 columns via `auto-fill, minmax(170px, 1fr)`
- **WHEN** the viewport is approximately 414px (iPhone Plus)
- **THEN** each NT-branch row SHALL render cards in ~2 columns
- **WHEN** the viewport is approximately 360px (iPhone SE)
- **THEN** each NT-branch row SHALL render cards in 1 column
- **AND** NT-branch headers SHALL remain visible at every width

#### Scenario: Other neurons-tw surfaces preserve family persona as primary

- **GIVEN** the player navigates to `/connectome` (connectome SVG tree page)
- **WHEN** the connectome tree renders the 11 family nodes
- **THEN** each family node SHALL continue to display the family persona name as primary (no change to connectome rendering)
- **AND** the same persona-primary behavior SHALL apply on `/achievements`, the leaderboard, and family-mastery surfaces
- **AND** the QuizModal interior framing SHALL continue to reference the family flavor as it does today (no change to quiz modal copy)

## ADDED Requirements

### Requirement: Overview SHALL surface a hero CTA for cross-family random quiz entry

Overview SHALL render a「🎲 隨機跨 family 答題」 CTA button in the hero-adjacent CTA section, paired side-by-side with the existing「📖 開始閱讀」 reading-timer CTA. The random CTA SHALL be the canonical entry point for cross-family random quiz sessions (the semantic previously hosted by the「全部」 chip inside the picker).

The random CTA SHALL:

- Open `QuizModal` with the unrestricted pool when clicked (`filterPoolByFamily(pack.questions, null)`, returning all questions).
- Display the total question count inline (e.g.「🎲 隨機跨 family 答題 [3291 題]」) so the player sees pool size before clicking.
- Use the project's warm GBA palette accent (`#d4a04d` background, white text, `#b8893a` border) — visually paired with the existing reading-timer CTA's green accent.
- Use `flex: 1 1 220px` styling so the CTA row renders side-by-side on wide viewports and stacks gracefully on narrow viewports.
- Carry an `aria-label="跨 family 隨機答題"` and a `title` attribute describing the action.

#### Scenario: Random CTA opens QuizModal with unrestricted pool

- **GIVEN** the player is on Overview and the family card grid is rendered
- **WHEN** the player clicks「🎲 隨機跨 family 答題」 in the hero CTA section
- **THEN** Overview SHALL open `QuizModal` with `filterPoolByFamily(pack.questions, null)` — i.e. the full unrestricted pool
- **AND** the served questions SHALL span any family per the QuizModal's random selection logic

#### Scenario: Random CTA visually pairs with reading-timer CTA

- **GIVEN** the Overview page renders the hero CTA section
- **WHEN** the player scans the CTA row
- **THEN** the「📖 開始閱讀」 (green) and「🎲 隨機跨 family 答題」 (gold) buttons SHALL render side-by-side at viewport widths ≥ ~500px
- **AND** at narrower widths the buttons SHALL stack via `flex-wrap` (each retains `flex: 1 1 220px`)
- **AND** the random CTA SHALL display the current `pack.questions.length` count as an inline chip pill

#### Scenario: Random CTA reflects pack reload

- **GIVEN** the content pack reloads with a different total question count (e.g. content bump from 3291 → 3500)
- **WHEN** Overview re-renders
- **THEN** the random CTA's inline count chip SHALL display the new total without code change in `apps/neurons-tw/`
- **AND** the click behavior SHALL still pass `null` to `filterPoolByFamily` (no hardcoded total)
