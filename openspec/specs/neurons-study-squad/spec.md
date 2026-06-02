# neurons-study-squad Specification

## Purpose
TBD - created by archiving change add-neurons-study-squad. Update Purpose after archive.
## Requirements
### Requirement: Active squad selection and persistence

The system SHALL let the player designate a bounded subset of their collected neuron variants as the
"active squad". The selection SHALL be persisted as a single synced `meta` envelope under the key
`activeSquad` (shape `{ members: VariantKey[], updatedAt: number }`, where `VariantKey` is
`"<familyId>:<slotIndex>"`), mirroring the `representativeVariants` precedent — NO new Dexie table and
NO Dexie `.version()` bump. The squad size SHALL be capped at `MAX_SQUAD_SIZE`. Only currently-collected
variants MAY be added; adding an uncollected variant SHALL be rejected as a no-op.

#### Scenario: Add a collected variant to the squad
- **WHEN** the player adds a variant they have collected and the squad is below `MAX_SQUAD_SIZE`
- **THEN** the variant's key is appended to `activeSquad.members` and `updatedAt` is stamped

#### Scenario: Reject an uncollected variant
- **WHEN** the player attempts to add a variant key with no matching `neuronVariants` row
- **THEN** the selection is rejected (no-op) and the squad is left unchanged

#### Scenario: Enforce the size cap
- **WHEN** the squad already holds `MAX_SQUAD_SIZE` members and the player adds another
- **THEN** the add is rejected (or replaces per UI affordance) and the squad never exceeds the cap

#### Scenario: Remove a member
- **WHEN** the player removes a member from the squad
- **THEN** that key is dropped from `activeSquad.members` and `updatedAt` is stamped

#### Scenario: Stale member pruning
- **WHEN** the squad envelope references a variant key that is no longer in the collected set
- **THEN** the stale key is filtered out of the rendered squad (mirrors `filterStaleRepresentatives`)

### Requirement: Squad renders as a party on the connectome homepage

The active squad SHALL render as a party row on the connectome homepage using `VariantSprite`. The party
row SHALL NOT crowd or overlap the connectome SVG graph, SHALL be responsive (mobile single-column
reflow), and SHALL respect `prefers-reduced-motion`. When the squad is empty, the row SHALL show an
assemble-your-squad placeholder rather than a broken/empty element.

#### Scenario: Squad members render on the homepage
- **WHEN** the homepage loads with a non-empty active squad
- **THEN** each member renders via `VariantSprite` in the party row, beside (not over) the connectome graph

#### Scenario: Empty squad placeholder
- **WHEN** the homepage loads with an empty active squad
- **THEN** the party row shows an assemble-squad placeholder/CTA, no broken element

#### Scenario: Narrow viewport does not overlap the graph
- **WHEN** the homepage renders at a mobile-width viewport
- **THEN** the party row reflows without overlapping the connectome SVG graph

### Requirement: Correct-answer squad celebration

When the player answers a question correctly in `QuizModal`, the active squad SHALL play a synchronized
celebration animation at the correct-answer moment, alongside the existing hero-variant flourish. The
celebration SHALL respect `prefers-reduced-motion` (no bounce / static under reduced motion, mirroring
`.neuron-sprite--alive`). An empty squad SHALL produce no celebration and no error.

#### Scenario: Correct answer triggers celebration
- **WHEN** the player selects a correct answer in `QuizModal` with a non-empty active squad
- **THEN** the squad plays a synchronized celebration animation at the correct-answer reveal

#### Scenario: Incorrect answer does not celebrate
- **WHEN** the player selects an incorrect answer
- **THEN** no squad celebration plays

#### Scenario: Reduced motion is respected
- **WHEN** `prefers-reduced-motion: reduce` is set and a correct answer is given
- **THEN** the squad shows a static/no-bounce acknowledgement, no looping animation

#### Scenario: Empty squad is a no-op
- **WHEN** a correct answer is given with an empty active squad
- **THEN** no celebration renders and no error is thrown

### Requirement: All-subject wrong-question expedition

The connectome homepage SHALL surface a 出征 action that opens the existing `QuizModal` on the
cross-subject pool of questions whose `questionHistory.lastResult === 'wrong'` (the "currently
unmastered" set), spanning all subjects — NOT a single family. When the pool is empty, the action SHALL
surface an empty-state message instead of opening a broken modal.

#### Scenario: 出征 with wrong questions opens the drill
- **WHEN** the player triggers 出征 and the cross-subject `lastResult === 'wrong'` pool is non-empty
- **THEN** `QuizModal` opens on exactly that pool, drawing from multiple subjects

#### Scenario: 出征 with an empty pool
- **WHEN** the player triggers 出征 and there are no `lastResult === 'wrong'` questions
- **THEN** an empty-state message is shown and no `QuizModal` opens

#### Scenario: Pool is all-subject, not per-family
- **WHEN** the wrong-question pool spans multiple subjects
- **THEN** the 出征 drill includes questions from all of them (no family restriction)

### Requirement: Reward seam left as a no-op extension point

The expedition completion path SHALL invoke a single extension point (`onExpeditionComplete`) that is a
no-op in this phase. This change SHALL NOT implement any reward, probabilistic, gacha, currency, or
pull-rate logic. The seam exists so a later phase can attach reward dispatch without reworking the
squad/expedition surface.

#### Scenario: Completing an expedition is a no-op reward-wise
- **WHEN** the player completes an expedition session
- **THEN** the `onExpeditionComplete` seam is invoked, grants nothing, and produces no error

### Requirement: Cross-device sync of the active squad

The `activeSquad` selection SHALL participate in cross-device sync via the `SYNCED_META_KEYS` allowlist
with last-write-wins reconciliation (a `backfillActiveSquadLWW` post-pass mirroring
`backfillRepresentativesLWW`, since the bare meta adapter is first-write-wins). The R2 bundle
`SCHEMA_VERSION` SHALL bump from 7 to 8 (additive). Clients SHALL tolerate cross-version bundles per the
existing forward-compat rule.

#### Scenario: Later write wins across devices
- **WHEN** two devices each hold an `activeSquad` envelope and sync
- **THEN** the envelope with the greater `updatedAt` is the converged value on both

#### Scenario: Older client tolerates the new key
- **WHEN** a v7 client pulls a v8 bundle containing `activeSquad`
- **THEN** the unknown key is silently dropped and no error is thrown

#### Scenario: Newer client tolerates an older bundle
- **WHEN** a v8 client pulls a v7 bundle with no `activeSquad`
- **THEN** the local `activeSquad` is preserved (not overwritten with empty)

