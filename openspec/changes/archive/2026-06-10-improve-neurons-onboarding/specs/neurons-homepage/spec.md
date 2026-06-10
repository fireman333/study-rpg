## MODIFIED Requirements

### Requirement: Homepage SHALL compose as a CTA toolbar over the interactive tree panel over the family-detail grid

The homepage SHALL present, top to bottom: (1) a **CTA toolbar** containing the 🎲 cross-family random-quiz entry (persistent) AND the **⚔️ 錯題出征 entry as the prominent primary connectome-building CTA** (cross-subject wrong-question expedition — repairing wrong questions wires the connectome). The 🎲 random-quiz entry SHALL be persistent. The **⚔️ 錯題出征 entry SHALL be hidden for a new player who has never answered any question incorrectly, and SHALL be revealed (one-way) the first time the player answers incorrectly, persistent thereafter** (per `neurons-onboarding`) — this REPLACES the prior always-visible-but-disabled「無錯題」dead-button behavior for never-wrong new players; once revealed it MAY still render its existing disabled「無錯題」state when the player currently has zero wrong questions. (The global reading-timer toggle is **no longer** in the toolbar — reading is now per-subject, surfaced in the family grid; the **📋 模考 entry is no longer** in the toolbar — it now lives in the **題庫 tab** (`/bank`, `QuestionBankPage`) per `neurons-exam-set-expedition`.) When present, the ⚔️ 錯題出征 CTA SHALL be the toolbar's prominent primary entry, opened directly (NOT via a co-equal chooser); (2) the **fixed-height interactive maze panel** (the brain-map centerpiece); (3) a **single family grid grouped by exam paper (醫學一 / 醫學二)** — the `FamilyPicker` enriched to carry the per-family quiz-mode entries (**🆕 新題 / 🔄 錯題 chips**, per `neurons-quiz-modes`), a **per-subject 📖 閱讀 entry** that starts that subject's reading session, AND the family detail (AP + mastery + variant-collection chips + `firedToday` badge). Tapping a family card SHALL focus the maze camera to that family's cluster (sticky, per `neurons-brain-maze`). There SHALL be exactly one family-card grid (its cards split across the two exam-paper sections, not an NT-branch grouping). The `DmnDrawProgressRing`, the progress status chips, and the first-visit guided onboarding (per `neurons-onboarding`) SHALL remain present. Progress chips SHALL use the semantics 🧠 = reached maze nodes (= accumulated pull opportunities) and 🧬 = collected individual count. The dense synapse list table SHALL NOT be present anywhere in the app; synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast).

#### Scenario: Single enriched family grid renders on the homepage
- **WHEN** the homepage renders
- **THEN** exactly one family grid is present on `/`, with its cards grouped into the two exam-paper sections (醫學一 / 醫學二) — NOT grouped into NT branches (DA / 5-HT / GABA / Glu) — each card showing AP + mastery chip + variant-collection chip + the two per-family quiz-mode chips (🆕 新題 / 🔄 錯題) + a per-subject 📖 閱讀 entry
- **AND** each of the 11 cards SHALL render its own distinct per-subject accent color
- **AND** there SHALL NOT be a second, separate read-only family-detail grid

#### Scenario: CTA toolbar contains the random and (revealed) expedition entries, not 模考
- **WHEN** the homepage renders for a player who has answered at least one question incorrectly (or has prior wrong history)
- **THEN** the CTA toolbar contains the 🎲 random-quiz entry AND the ⚔️ 錯題出征 primary CTA (and NOT a global reading-timer toggle)
- **AND** triggering ⚔️ 錯題出征 opens the cross-subject wrong-question expedition flow directly (no co-equal chooser)
- **AND** the 📋 模考 entry SHALL NOT be present on the homepage (it lives in the 題庫 tab `/bank` per `neurons-exam-set-expedition`)

#### Scenario: Expedition CTA is hidden for a never-wrong new player
- **WHEN** the homepage renders for a new player who has never answered any question incorrectly
- **THEN** the ⚔️ 錯題出征 entry is NOT present in the CTA toolbar (no disabled「無錯題」dead button)
- **AND** the 🎲 random-quiz entry is still present

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

### Requirement: Homepage SHALL surface a skippable, replayable first-visit guided onboarding that never auto-reappears once completed or skipped

The homepage SHALL host the interactive guided onboarding overlay (per `neurons-onboarding`) for first-time players, gated on the persisted device-local `meta['neurons:onboarding:guidedComplete']` flag. Completing or skipping the overlay SHALL set the flag so it never auto-renders again, including after F5 reload. The account-reset path SHALL clear the onboarding flags (`neurons:onboarding:guidedComplete` / `expeditionSpotlightSeen`, plus the legacy `homepageOnboardingDismissed` for backward compatibility) so a reset user sees the onboarding again. The prior static four-step `HomepageOnboarding` card is RETIRED and replaced by the guided overlay; the existing `/connectome` first-visit callout SHALL be left in place (it serves users who land directly on `/connectome`). The onboarding SHALL NOT host any 首抽 (first-pull) CTA — the explicit first-pull ritual is retired; first-pull is now granted automatically on each family's first answer (per `neuron-path-representative`), so no onboarding CTA or compact 首抽 entry is shown anywhere.

#### Scenario: First-time user sees the guided onboarding
- **WHEN** the homepage loads and `meta['neurons:onboarding:guidedComplete']` is absent or false
- **THEN** the guided onboarding overlay renders with a one-tap skip control

#### Scenario: Completed or skipped onboarding does not auto-reappear
- **WHEN** the user completes or skips the guided onboarding and later reloads the homepage (including F5)
- **THEN** the overlay does not auto-render and `meta['neurons:onboarding:guidedComplete']` is true

#### Scenario: Onboarding is replayable from HelpMenu
- **WHEN** the user opens HelpMenu and selects "重看新手引導"
- **THEN** the guided onboarding overlay re-runs

#### Scenario: Account reset re-surfaces onboarding
- **WHEN** the user resets account data
- **THEN** the `neurons:onboarding:*` flags are cleared and the guided onboarding renders again on next homepage load

#### Scenario: Connectome callout is unchanged
- **WHEN** a first-time user navigates directly to `/connectome` with no synapses
- **THEN** the existing `/connectome` empty-state callout still renders (it is not removed by this change)

#### Scenario: No first-pull CTA in onboarding
- **WHEN** the onboarding renders for a new player
- **THEN** no 首抽 / first-pull CTA is present in the onboarding overlay or the CTA toolbar
