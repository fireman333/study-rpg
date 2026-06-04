## MODIFIED Requirements

### Requirement: Connectome visual SHALL use Linnean taxonomy, not brain anatomy

The 4-neurotransmitter-branch organization (DA / 5-HT / GABA / Glu) SHALL be treated as **internal organizational data only** — it MAY drive the maze region assignment, the per-branch economy, and per-branch context-art derivation — and SHALL NOT be surfaced to players as a claim that an exam subject *is* (or belongs to) a particular neurotransmitter. No player-facing surface SHALL group, label, or color-code the 11 families under a 「某科＝某神經傳導物質分支」 taxonomy.

The primary collection visual is the maze (per `promote-maze-to-home`), which already superseded the former Linnean phylogenetic taxonomy tree; the connectome remains a read-only synapse overlay. Any residual player-facing rendering of the four NT branches as an organizing taxonomy (branch labels, a「DA/5-HT/GABA/Glu 分支」grouping section, or accent colors used specifically as a per-family *NT-branch* group tint) SHALL be removed or neutralized. The collection visual SHALL NOT render a brain-anatomy map (no cortex / hippocampus / amygdala anatomy) and SHALL NOT render a literal C. elegans connectome.

`FAMILY_NT_BRANCH` in `content-neurons-tw` is retained as the internal source of branch assignment for maze/economy/decor; only its **player-facing presentation as a neurotransmitter taxonomy** is removed. Individual variant persona flavor text (which may reference specific neuron types) is out of scope for this requirement and is unchanged here.

#### Scenario: No player-facing surface claims an exam subject belongs to a neurotransmitter

- **GIVEN** the player navigates any collection / maze / family-picker / leaderboard surface in neurons-tw
- **WHEN** the surface renders
- **THEN** it SHALL NOT present the 11 families bucketed under DA / 5-HT / GABA / Glu branch headings
- **AND** it SHALL NOT label a family or subject as belonging to a neurotransmitter branch
- **AND** any accent color that previously signified a family's NT-branch group SHALL no longer be presented as an NT-branch grouping signal

#### Scenario: NT-branch data remains available internally

- **GIVEN** the maze region assignment, the per-branch economy (`maze:<branch>:earned/settles`), and per-branch context-art decor
- **WHEN** they read `FAMILY_NT_BRANCH`
- **THEN** the internal branch assignment SHALL still resolve correctly (this change does not alter maze structure, economy, or decor data)

#### Scenario: Connectome view never renders brain regions

- **GIVEN** the player views the connectome overlay in neurons-tw
- **WHEN** the view renders
- **THEN** the rendered visual SHALL NOT include any brain region sprite (cortex / hippocampus / amygdala / cerebellum / brainstem etc.)
- **AND** the visual SHALL NOT include any anatomical brain outline sprite
