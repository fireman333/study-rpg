## MODIFIED Requirements

### Requirement: Homepage SHALL compose as a CTA toolbar over the interactive tree panel over the family-detail grid

The homepage SHALL present, top to bottom: (1) a **CTA toolbar** containing the 🎲 cross-family random-quiz entry and the **⚔️ 出征 (全科錯題 expedition) entry** as a persistent CTA (the global reading-timer toggle is **no longer** in the toolbar — reading is now per-subject, surfaced in the family grid); (2) the **fixed-height interactive maze panel** (the brain-map centerpiece); (3) a **single family grid grouped by exam paper (醫學一 / 醫學二)** — the `FamilyPicker` enriched to carry the per-family quiz-mode entries (**🆕 新題 / 🔄 錯題 chips**, per `neurons-quiz-modes`), a **per-subject 📖 閱讀 entry** that starts that subject's reading session, AND the family detail (AP + mastery + variant-collection chips + `firedToday` badge). Tapping a family card SHALL focus the maze camera to that family's cluster (sticky, per `neurons-brain-maze`). There SHALL be exactly one family-card grid (its cards split across the two exam-paper sections, not an NT-branch grouping). The `DmnDrawProgressRing`, the progress status chips, and the first-visit onboarding SHALL remain present. Progress chips SHALL use the semantics 🧠 = reached maze nodes (= accumulated pull opportunities) and 🧬 = collected individual count. The dense synapse list table SHALL NOT be present anywhere in the app; synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast).

#### Scenario: Single enriched family grid renders on the homepage
- **WHEN** the homepage renders
- **THEN** exactly one family grid is present on `/`, with its cards grouped into the two exam-paper sections (醫學一 / 醫學二) — NOT grouped into NT branches (DA / 5-HT / GABA / Glu) — each card showing AP + mastery chip + variant-collection chip + the two per-family quiz-mode chips (🆕 新題 / 🔄 錯題) + a per-subject 📖 閱讀 entry
- **AND** each of the 11 cards SHALL render its own distinct per-subject accent color
- **AND** there SHALL NOT be a second, separate read-only family-detail grid

#### Scenario: Expedition CTA is present in the toolbar
- **WHEN** the homepage renders
- **THEN** the CTA toolbar contains the 🎲 random-quiz entry AND the ⚔️ 出征 entry (and NOT a global reading-timer toggle)
- **AND** triggering 出征 opens the cross-subject wrong-question expedition flow

#### Scenario: Tapping a family card focuses the maze camera
- **WHEN** the player taps a family card in the FamilyPicker grid
- **THEN** the maze camera flies to that family's cluster as a sticky focus (per `neurons-brain-maze`)

#### Scenario: Progress chips use node + collection semantics
- **WHEN** the homepage renders the progress chips
- **THEN** the 🧠 chip reads reached-maze-node count (no denominator) and the 🧬 chip reads collected individual count (no denominator)

#### Scenario: Synapse table is absent; synapse conveyed by the maze overlay
- **WHEN** the homepage renders
- **THEN** no synapse list table is present anywhere in the app
- **AND** synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast)

### Requirement: Homepage SHALL preserve manual reading-timer start and the non-collapsed quiz CTA

The homepage SHALL NOT auto-start the reading timer and SHALL NOT collapse the quiz entry into a single button. Reading start SHALL be **manual and per-subject**: each family card in the enriched `FamilyPicker` grid SHALL expose a 📖 閱讀 entry that starts that subject's reading session; only one subject reads at a time (starting a new subject ends the prior session). The global single reading toggle previously in the CTA toolbar is **removed**. The 🎲 cross-family random-quiz entry SHALL remain in the CTA toolbar above the tree; the per-family quiz-mode entry SHALL live in the `FamilyPicker` grid below the tree, surfaced as the two quiz-mode chips (🆕 新題 / 🔄 錯題, per `neurons-quiz-modes`). Both the toolbar (🎲) and per-family quiz entry paths SHALL remain available; only the path into answering and reading is smoothed.

#### Scenario: Timer does not auto-start on load
- **WHEN** the homepage loads
- **THEN** the reading timer remains in `idle` until the user manually starts a per-subject reading session from a family card

#### Scenario: Reading starts per subject from the family grid
- **WHEN** the player activates a family card's 📖 閱讀 entry for subject S
- **THEN** a reading session for subject S begins (the global toolbar reading toggle is absent)
- **AND** starting another subject's reading ends the prior subject's session (one subject at a time)

#### Scenario: Both quiz entry paths remain
- **WHEN** the homepage renders
- **THEN** the 🎲 random-quiz entry (in the toolbar) and the per-family quiz-mode chips (🆕 新題 / 🔄 錯題, in the `FamilyPicker` grid) are both present (the CTA is not reduced to a single mega-button)
