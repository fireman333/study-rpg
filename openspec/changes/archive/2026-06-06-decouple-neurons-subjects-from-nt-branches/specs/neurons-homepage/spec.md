## MODIFIED Requirements

### Requirement: Homepage SHALL compose as a CTA toolbar over the interactive tree panel over the family-detail grid

The homepage SHALL present, top to bottom: (1) a **CTA toolbar** containing the reading-timer toggle, the 🎲 cross-family random-quiz entry, and the **⚔️ 出征 (全科錯題 expedition) entry** as a persistent CTA; (2) the **fixed-height interactive maze panel** (the brain-map centerpiece); (3) a **single family grid grouped by exam paper (醫學一 / 醫學二)** — the `FamilyPicker` enriched to carry BOTH the per-family quiz-mode entries (**🆕 新題 / 🔄 錯題 chips**, per `neurons-quiz-modes`) AND the family detail (AP + mastery + variant-collection chips + `firedToday` badge). There SHALL be exactly one family-card grid (its cards split across the two exam-paper sections, not an NT-branch grouping). The `DmnDrawProgressRing`, the progress status chips, and the first-visit onboarding SHALL remain present. Progress chips SHALL use the semantics 🧠 = reached maze nodes (= accumulated pull opportunities) and 🧬 = collected individual count. The dense synapse list table SHALL NOT be present anywhere in the app; synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast).

#### Scenario: Single enriched family grid renders on the homepage
- **WHEN** the homepage renders
- **THEN** exactly one family grid is present on `/`, with its cards grouped into the two exam-paper sections (醫學一 / 醫學二) — NOT grouped into NT branches (DA / 5-HT / GABA / Glu) — each card showing AP + mastery chip + variant-collection chip + the two per-family quiz-mode chips (🆕 新題 / 🔄 錯題)
- **AND** each of the 11 cards SHALL render its own distinct per-subject accent color
- **AND** there SHALL NOT be a second, separate read-only family-detail grid

#### Scenario: Expedition CTA is present in the toolbar
- **WHEN** the homepage renders
- **THEN** the CTA toolbar contains the reading-timer toggle, the 🎲 random-quiz entry, AND the ⚔️ 出征 entry
- **AND** triggering 出征 opens the cross-subject wrong-question expedition flow

#### Scenario: Progress chips use node + collection semantics
- **WHEN** the homepage renders the progress chips
- **THEN** the 🧠 chip reads reached-maze-node count (no denominator) and the 🧬 chip reads collected individual count (no denominator)

#### Scenario: Synapse table is absent; synapse conveyed by the maze overlay
- **WHEN** the homepage renders
- **THEN** no synapse list table is present anywhere in the app
- **AND** synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast)
