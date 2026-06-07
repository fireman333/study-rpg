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

The active squad SHALL be presented to the player under the display name **「神經元遠征隊」** and SHALL render as a party row on the homepage using `VariantSprite`. The party row SHALL NOT crowd or overlap the homepage graph, SHALL be responsive (mobile single-column reflow), and SHALL respect `prefers-reduced-motion`. When the squad is empty, the row SHALL show an assemble-your-squad placeholder rather than a broken/empty element. The active squad SHALL be the **single source of truth** for every surface that depicts the squad — the homepage party row, the correct-answer celebration, AND the maze expedition animation band (`neurons-maze-expedition`) — so the player's chosen party appears consistently across all of them. The rename is presentational only: the persisted `activeSquad` meta key, its `VariantKey` shape, and all selection/sync mechanics are unchanged (no migration).

#### Scenario: Squad members render on the homepage
- **WHEN** the homepage loads with a non-empty active squad
- **THEN** each member renders via `VariantSprite` in the「神經元遠征隊」party row, beside (not over) the homepage graph

#### Scenario: Empty squad placeholder
- **WHEN** the homepage loads with an empty active squad
- **THEN** the party row shows an assemble-squad placeholder/CTA, no broken element

#### Scenario: Narrow viewport does not overlap the graph
- **WHEN** the homepage renders at a mobile-width viewport
- **THEN** the party row reflows without overlapping the homepage graph

#### Scenario: One squad drives every surface
- **WHEN** the player edits the active squad
- **THEN** the homepage party row, the correct-answer celebration, and the maze expedition animation band all reflect the same updated members (the band no longer derives an independent auto-rarest set)

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

The connectome homepage SHALL surface a 出征 action that opens a **遠征選單** offering two co-equal expeditions: **錯題遠征** (defined by this requirement) and **年份回數遠征** (defined by `neurons-exam-set-expedition`). The menu itself SHALL be reachable regardless of either pool's state, so the player can always pick the other expedition.

**錯題遠征** opens the existing `QuizModal` on the cross-subject pool of questions whose `questionHistory.lastResult === 'wrong'` (the "currently unmastered" set), spanning all subjects — NOT a single family. When that pool is empty, the 錯題遠征 option SHALL surface an empty-state (disabled control or message) instead of opening a broken modal; the 遠征選單 SHALL still allow selecting 年份回數遠征.

#### Scenario: 出征 opens a 遠征選單 with two expeditions
- **WHEN** the player triggers 出征
- **THEN** a 遠征選單 SHALL present 錯題遠征 and 年份回數遠征 as co-equal options

#### Scenario: 錯題遠征 with wrong questions opens the drill
- **WHEN** the player picks 錯題遠征 and the cross-subject `lastResult === 'wrong'` pool is non-empty
- **THEN** `QuizModal` opens on exactly that pool, drawing from multiple subjects

#### Scenario: 錯題遠征 with an empty pool
- **WHEN** the player picks 錯題遠征 and there are no `lastResult === 'wrong'` questions
- **THEN** an empty-state message is shown and no `QuizModal` opens
- **AND** 年份回數遠征 SHALL remain selectable from the 遠征選單

#### Scenario: Pool is all-subject, not per-family
- **WHEN** the wrong-question pool spans multiple subjects
- **THEN** the 錯題遠征 drill includes questions from all of them (no family restriction)

### Requirement: Expedition completion grants DMN draw entitlement

When an expedition session completes, the `onExpeditionComplete` path SHALL invoke the DMN expedition-axis credit (`creditExpeditionDraws(pool, cleared)` in `neurons-dmn-fate-cards`) with `pool` = the question count the session was launched against (for 錯題遠征, the wrong-question count; for 年份回數遠征, the unanswered-set count it opened on) and `cleared` = the session's correct-answer count. Draws are granted per the percentage-with-clamp milestones (`DMN_EXPEDITION_MILESTONES`, default 25% / 50% clamped to 3–15 / 6–30), capped per day. Both expeditions share the single expedition-axis daily cap (one axis). The grant SHALL be best-effort: any failure in the reward path SHALL be caught and logged (channel `[expedition-reward]`) and SHALL NOT throw out of the expedition close flow. This metric is inherently anti-farm — each expedition pool depletes as questions are cleared/answered, and the per-day cap bounds total draws regardless of how the pool is re-formed.

#### Scenario: Completing an expedition credits the DMN expedition axis
- **WHEN** the player completes an expedition session (錯題 or 年份回數) having answered one or more correctly
- **THEN** `onExpeditionComplete` SHALL invoke `creditExpeditionDraws(pool, cleared)` with the session's pool size and cleared count
- **AND** a DMN draw SHALL be granted for each milestone threshold met (subject to the shared per-day cap)

#### Scenario: Zero clears is a no-op
- **WHEN** the player completes an expedition session having cleared no questions (zero correct)
- **THEN** no milestone is met, no draw is granted, and no error is thrown

#### Scenario: Reward failure does not break the expedition close
- **WHEN** `creditExpeditionDraws` throws (e.g., a transient Dexie error) during `onExpeditionComplete`
- **THEN** the error is caught and logged on the `[expedition-reward]` channel
- **AND** the expedition modal close flow completes normally without propagating the error

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

