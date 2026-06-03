## MODIFIED Requirements

### Requirement: Overview SHALL surface a family subject picker that filters the active quiz pool

The neurons-tw Overview page SHALL render a family chip grid that lets the player narrow the quiz question pool to a single neuron family (one of the 11 families enumerated by `content-neurons-tw`) without changing any downstream gameplay mechanic (rewards / SRS / DMN trigger / family mastery accrual remain unchanged). The picker SHALL also include an explicit "全部" chip that restores the default behavior of drawing questions from the unrestricted pool.

The picker SHALL behave as a **pure filter**, not as a dedicated mode:

- Selection state is held in transient React state (or URL search param) at the Overview level. **No** Dexie row, **no** sync table, **no** state machine across sessions.
- When the player launches quiz with a family selected, the quiz-pool helper SHALL receive that `familyId` as an optional argument and restrict candidate questions to those whose `subjectId` resolves to that family per the existing subject-resolution invariant.
- When the player launches quiz with no family selected (or "全部" chip active), the helper SHALL fall back to the unrestricted pool (existing behavior).
- After a quiz session ends, the picker selection state is preserved on Overview (so the player can repeat the same family without re-clicking) but is NOT persisted across page reload (transient).

Each family chip SHALL source identity from the `content-neurons-tw` family roster (canonical `subject.id` = 國考 subject name, `subject.displayName` = family persona, family sprite key from `theme-pixel-neurons`, NT-branch-derived accent color). Chips SHALL NOT hardcode any subject name, family name, or color.

**Chip label hierarchy (primary / secondary):**

- The chip's **primary** visible label SHALL be the canonical 國考 subject name (`subject.id`, e.g. `藥理學`, `公共衛生學`, `寄生蟲學`).
- The chip's **secondary** supporting label SHALL be the family persona name (`subject.displayName`, e.g. `VTA Dopaminergic — Thrill-Seeker`), rendered as a single line in muted typography below the primary label. Truncation via ellipsis on narrow viewport is allowed.
- The chip's **title** attribute (hover tooltip) SHALL include both labels plus question count: `{subject.id} · {subject.displayName} · {N} 題`.

The "全部" chip is exempt from this hierarchy — it has no family persona and SHALL render its existing label (`全部` + total question count chip).

When a family chip is selected, the picker SHALL render a confirmation banner below the grid SHALL lead with the subject name and place the family persona name in parentheses, e.g.: `🎯 練習範圍鎖定：藥理學（VTA Dopaminergic — Thrill-Seeker）— 點「全部」恢復跨科隨機`.

The picker SHALL be responsive: desktop renders an 11-chip grid (single row or wrapped); narrow viewport (e.g., mobile < 600px) renders a 2-column scrollable grid. The "全部" chip SHALL be visually distinct (e.g., larger, different accent) so it's discoverable as the reset entry-point.

#### Scenario: Family chip click restricts quiz pool

- **GIVEN** the player is on Overview with the "藥理學" chip selected
- **WHEN** the player clicks 🎯 開始答題
- **THEN** the QuizModal SHALL open with a candidate pool restricted to questions whose `subjectId` resolves to family `藥理學`
- **AND** no question outside `藥理學` SHALL be served in this session
- **AND** the rewards / SRS / DMN trigger pipelines SHALL operate identically to the unrestricted case

#### Scenario: 全部 chip restores random pool

- **GIVEN** the player previously had "藥理學" selected and now clicks "全部"
- **WHEN** the player clicks 🎯 開始答題
- **THEN** the QuizModal SHALL open with the unrestricted question pool
- **AND** the served questions SHALL span any family per random selection

#### Scenario: Picker selection does not persist across reload

- **GIVEN** the player selects "藥理學" chip on Overview
- **WHEN** the player reloads the page (F5)
- **THEN** the picker SHALL reset to "全部" default
- **AND** no Dexie row, no localStorage key, no sync table SHALL retain the selection

#### Scenario: Picker chip identity sources from content pack

- **GIVEN** a developer changes the `displayName` of family `生理學` in `content-neurons-tw` to `Some New Persona — Tagline`
- **WHEN** the Overview re-renders
- **THEN** the chip's primary label SHALL still be `生理學` (since `subject.id` did not change)
- **AND** the chip's secondary label SHALL display `Some New Persona — Tagline` without any code change in `apps/neurons-tw/`

#### Scenario: Chip primary label is the 國考 subject name

- **GIVEN** the Overview page renders the family picker for the first time
- **WHEN** the player visually scans the 11 chips
- **THEN** each chip's PRIMARY label SHALL display the canonical 國考 subject name (e.g. `藥理學`, `解剖學`, `生物化學`, `組織學`, `生理學`, `病理學`, `微生物學`, `免疫學`, `寄生蟲學`, `公共衛生學`, `醫學倫理` — or whichever 11 subjects ship in `content-neurons-tw`)
- **AND** the family persona name (e.g. `VTA Dopaminergic — Thrill-Seeker`) SHALL appear as SECONDARY supporting text below the primary on the same chip
- **AND** hovering the chip SHALL surface a tooltip including both labels and question count

#### Scenario: Selected-family confirmation banner leads with subject name

- **GIVEN** the player clicks the `生物化學` chip
- **WHEN** the picker re-renders with the chip in selected state
- **THEN** the confirmation banner below the grid SHALL display text starting with `生物化學` (the canonical 國考 subject name)
- **AND** the family persona name (e.g. `Cerebellar Purkinje — Mathematician`) SHALL appear in parentheses after the subject name
- **AND** the banner SHALL retain the existing "點「全部」恢復跨科隨機" hint at the end

#### Scenario: Other neurons-tw surfaces preserve family persona as primary

- **GIVEN** the player navigates to `/connectome` (connectome SVG tree page)
- **WHEN** the connectome tree renders the 11 family nodes
- **THEN** each family node SHALL continue to display the family persona name as primary (no change to connectome rendering)
- **AND** the same persona-primary behavior SHALL apply on `/achievements`, the leaderboard, and family-mastery surfaces
- **AND** the QuizModal interior framing SHALL continue to reference the family flavor as it does today (no change to quiz modal copy)
