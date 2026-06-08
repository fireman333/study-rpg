## MODIFIED Requirements

### Requirement: Collection milestone achievements SHALL count distinct variants, not family completion

The achievement catalog SHALL express collection progress as **「收集 N 隻」 distinct-variant milestones**, evaluated against the canonical `ownedSlotCount` projection defined by `neuron-variant-fusion` (counting slots with at least one held individual, NOT raw `db.neuronVariants` row count). The catalog SHALL NOT contain any 「科別全收集 / family-complete」 predicate, and the achievement stat SHALL NOT expose a `familyCompleteCount` field — it SHALL expose a total distinct-owned count `variantCount = ownedSlotCount(db)` instead. Lower-tier (P4–P2) milestones SHALL be an ascending single-dimension distinct-count ladder; the P1 鑽石 collection capstone SHALL remain a **genuine multi-dimension composite** (breadth × quality, e.g. a high distinct count AND natural-P1 apexes across multiple families) so it satisfies the existing P1 `composite` rule WITHOUT a validator change and WITHOUT a degenerate single-condition predicate. Counting SHALL be by distinct *owned* slot (not by `copies`, and not by any path that would include ghost slots). The reframe SHALL NOT change the `AchievementReward` channels (still exactly `leaderboard` + `title`).

#### Scenario: Catalog has no family-complete predicate

- **WHEN** the `NEURONS_ACHIEVEMENTS` catalog is inspected
- **THEN** no entry SHALL reference family completion or a `familyCompleteCount` stat
- **AND** collection-progress entries SHALL reference the total distinct-owned count

#### Scenario: Distinct-variant milestone unlocks at its threshold

- **GIVEN** a P2 milestone defined at 50 distinct variants
- **WHEN** the achievement check runs after a pull that crosses 50 distinct owned variants
- **THEN** that milestone SHALL unlock

#### Scenario: Milestone counts distinct variants, not copies

- **GIVEN** the player has 10 distinct owned variants, one of which has `copies = 5`
- **WHEN** the milestone stat is computed
- **THEN** the distinct-variant count SHALL be `10` (duplicates do NOT inflate the milestone count)

#### Scenario: Ghost slot does NOT count toward a milestone

- **GIVEN** the player has 10 distinct owned variants AND one ghost slot (a `neuronVariants` row whose every `neuronInstances` row has `consumedAt` set after a cross-device fusion race per `neuron-variant-fusion`)
- **WHEN** the milestone stat is computed
- **THEN** `variantCount` SHALL be `10`, NOT `11`
- **AND** any milestone whose threshold is exactly 11 SHALL NOT unlock from this state

#### Scenario: P1 collection capstone is a genuine composite

- **WHEN** the P1 collection-capstone entry is inspected
- **THEN** its predicate SHALL combine ≥ 2 dimensions (e.g. distinct count AND natural-P1 family breadth) and SHALL declare `composite: true`
- **AND** the build-time validator SHALL pass without a collection-cap whitelist exception
