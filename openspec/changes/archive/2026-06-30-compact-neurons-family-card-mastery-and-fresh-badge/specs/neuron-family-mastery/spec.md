## MODIFIED Requirements

### Requirement: Mastery chip UI SHALL render per family using motion library NumberTickUp for animated count

For every neuron family rendered on the overview page (`/`) and the connectome page (`/connectome`), the UI SHALL display a **compact** mastery chip containing:

1. **Tier code** badge (color-coded — the bare tier code `P1`/`P2`/`P3`/`P4`/`P5`, or "—" for tier `'none'`). The full tier label word (e.g. 新手 / 入門) SHALL NOT be shown in the visible chip.
2. `<NumberTickUp>` (imported from `'../lib/motion'`) animating the displayed correct count when it changes, rendered as `correct/total`.
3. The **mastery-energy boost** indicator (⚡ + percentage) when the family's tier multiplies energy acquisition (boost > 0); absent otherwise.

The **accuracy percentage** SHALL NOT be a visible chip element; together with the full tier label it SHALL be available in the chip's `title` tooltip (e.g. "解剖學 熟練度 · P5 新手 · 正確率 83%"). The chip SHALL be sized (compact gap/padding, non-wrapping) so that it plus the adjacent variant-collection「X 隻」pill fit on one row at the family-card width, including on a tier with the ⚡ boost. The chip SHALL re-render when its underlying `familyMastery` row updates (subscribe via Dexie live query, useEffect polling, or explicit reactive trigger).

#### Scenario: Mastery chip displays tier code and animated count

- **GIVEN** a family with `correct: 15, total: 18` (tier P4, accuracy 83%)
- **WHEN** the overview page renders the mastery chip for this family
- **THEN** the chip SHALL display the tier code "P4" (NOT "P4 入門"/"P4 Familiar")
- **AND** the chip SHALL contain a `<NumberTickUp>` showing the correct count over the total ("15/18")
- **AND** the accuracy "83%" SHALL NOT appear in the visible chip (it SHALL be present in the chip's `title` tooltip)

#### Scenario: Boosted tier shows the ⚡ indicator and still fits one row

- **GIVEN** a family whose tier grants a mastery-energy boost (e.g. P4 → +5%)
- **WHEN** its card renders
- **THEN** the chip SHALL show a ⚡ boost indicator (e.g. "⚡5%")
- **AND** the chip plus the family's「X 隻」variant-collection pill SHALL render on a single row (no wrap)

#### Scenario: Mastery chip displays no-tier state for fresh family

- **GIVEN** a family with `correct: 1, total: 3` (tier 'none' — below the 5-attempt threshold)
- **WHEN** the overview page renders the mastery chip for this family
- **THEN** the chip SHALL display "—" (not a P-tier code)
- **AND** the chip SHALL still show the count "1/3"
- **AND** the accuracy SHALL NOT be a visible element (available in the tooltip)

#### Scenario: Correct answer triggers animated count update

- **GIVEN** a family chip currently shows correct count "5"
- **WHEN** the player triggers a correct answer
- **AND** the mastery row updates to `correct: 6`
- **THEN** the `<NumberTickUp>` SHALL animate from 5 to 6 over ~600ms (or snap instantly if `prefers-reduced-motion`)
