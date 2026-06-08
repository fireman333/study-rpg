## MODIFIED Requirements

### Requirement: Homepage SHALL compose as a CTA toolbar over the interactive tree panel over the family-detail grid

The homepage SHALL present, top to bottom: (1) a **CTA toolbar** containing the 🎲 cross-family random-quiz entry, the **⚔️ 錯題出征 entry as the prominent primary connectome-building CTA** (cross-subject wrong-question expedition — repairing wrong questions wires the connectome), AND a **secondary 📋 模考 entry** (a pure exam drill that does NOT build the connectome), as persistent CTAs (the global reading-timer toggle is **no longer** in the toolbar — reading is now per-subject, surfaced in the family grid). The ⚔️ 錯題出征 CTA SHALL be visually dominant over the 📋 模考 entry (size / accent / connectome visual language), and the two SHALL be **distinct entries** — NOT a single 出征 button opening a co-equal chooser; (2) the **fixed-height interactive maze panel** (the brain-map centerpiece); (3) a **single family grid grouped by exam paper (醫學一 / 醫學二)** — the `FamilyPicker` enriched to carry the per-family quiz-mode entries (**🆕 新題 / 🔄 錯題 chips**, per `neurons-quiz-modes`), a **per-subject 📖 閱讀 entry** that starts that subject's reading session, AND the family detail (AP + mastery + variant-collection chips + `firedToday` badge). Tapping a family card SHALL focus the maze camera to that family's cluster (sticky, per `neurons-brain-maze`). There SHALL be exactly one family-card grid (its cards split across the two exam-paper sections, not an NT-branch grouping). The `DmnDrawProgressRing`, the progress status chips, and the first-visit onboarding SHALL remain present. Progress chips SHALL use the semantics 🧠 = reached maze nodes (= accumulated pull opportunities) and 🧬 = collected individual count. The dense synapse list table SHALL NOT be present anywhere in the app; synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast).

#### Scenario: Single enriched family grid renders on the homepage
- **WHEN** the homepage renders
- **THEN** exactly one family grid is present on `/`, with its cards grouped into the two exam-paper sections (醫學一 / 醫學二) — NOT grouped into NT branches (DA / 5-HT / GABA / Glu) — each card showing AP + mastery chip + variant-collection chip + the two per-family quiz-mode chips (🆕 新題 / 🔄 錯題) + a per-subject 📖 閱讀 entry
- **AND** each of the 11 cards SHALL render its own distinct per-subject accent color
- **AND** there SHALL NOT be a second, separate read-only family-detail grid

#### Scenario: Two differentiated expedition entries are present in the toolbar
- **WHEN** the homepage renders
- **THEN** the CTA toolbar contains the 🎲 random-quiz entry, the ⚔️ 錯題出征 primary CTA, AND the 📋 模考 secondary entry (and NOT a global reading-timer toggle)
- **AND** the ⚔️ 錯題出征 CTA SHALL be visually dominant over the 📋 模考 entry
- **AND** triggering ⚔️ 錯題出征 opens the cross-subject wrong-question expedition flow directly (no co-equal chooser)
- **AND** triggering 📋 模考 opens the per-book exam-paper picker directly

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
