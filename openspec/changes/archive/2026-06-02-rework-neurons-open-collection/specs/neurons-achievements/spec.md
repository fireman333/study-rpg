## ADDED Requirements

### Requirement: Collection milestone achievements SHALL count distinct variants, not family completion

The achievement catalog SHALL express collection progress as **「收集 N 隻」 distinct-variant milestones**, evaluated against the total count of distinct collected variants (`db.neuronVariants` row count). The catalog SHALL NOT contain any 「科別全收集 / family-complete」 predicate, and the achievement stat SHALL NOT expose a `familyCompleteCount` field — it SHALL expose a total distinct-variant count (`variantCount`) instead. Lower-tier (P4–P2) milestones SHALL be an ascending single-dimension distinct-count ladder; the P1 鑽石 collection capstone SHALL remain a **genuine multi-dimension composite** (breadth × quality, e.g. a high distinct count AND natural-P1 apexes across multiple families) so it satisfies the existing P1 `composite` rule WITHOUT a validator change and WITHOUT a degenerate single-condition predicate. Counting SHALL be by distinct variant (not by `copies`). The reframe SHALL NOT change the `AchievementReward` channels (still exactly `leaderboard` + `title`).

#### Scenario: Catalog has no family-complete predicate

- **WHEN** the `NEURONS_ACHIEVEMENTS` catalog is inspected
- **THEN** no entry SHALL reference family completion or a `familyCompleteCount` stat
- **AND** collection-progress entries SHALL reference the total distinct-variant count

#### Scenario: Distinct-variant milestone unlocks at its threshold

- **GIVEN** a P2 milestone defined at 50 distinct variants
- **WHEN** the achievement check runs after a pull that crosses 50 distinct variants
- **THEN** that milestone SHALL unlock

#### Scenario: Milestone counts distinct variants, not copies

- **GIVEN** the player has 10 distinct variants, one of which has `copies = 5`
- **WHEN** the milestone stat is computed
- **THEN** the distinct-variant count SHALL be `10` (duplicates do NOT inflate the milestone count)

#### Scenario: P1 collection capstone is a genuine composite

- **WHEN** the P1 collection-capstone entry is inspected
- **THEN** its predicate SHALL combine ≥ 2 dimensions (e.g. distinct count AND natural-P1 family breadth) and SHALL declare `composite: true`
- **AND** the build-time validator SHALL pass without a collection-cap whitelist exception

## MODIFIED Requirements

### Requirement: Capability SHALL borrow design pattern from 二階 achievement-system per neurons-mode Req 5

The `neurons-achievements` capability spec SHALL explicitly cite 二階 `achievement-system` as the borrowed source pattern. Semantic mappings SHALL be documented:

- doctor recruit → variant gacha (slot unlock)
- hospital tier upgrade → synapse state machine
- subject_mastery_count → distinct-variant collection count (`db.neuronVariants` row count); the retired `neurons-leaderboard.family_complete` signal is no longer used
- 14 科 → 11 family
- 7 category × 4 tier structure ✓ (re-used)
- Build-time composite validator ✓ (re-used, adapted to metadata flag)
- Diff-based unlock detection ✓ (re-used the published `@study-rpg/core` function)
- Silent backfill on pull complete ✓ (adapted: app boot pass instead of pull complete; same function shape for future sync hook)
- P1 modal + P2-P4 toast ✓ (re-used)
- Strict hidden filtering ✓ (re-used)

This capability SHALL NOT modify `openspec/specs/achievement-system/spec.md` or `openspec/specs/hospital-leaderboard/spec.md`.

This capability SHALL NOT introduce equipment, ticket, or new currency as reward channels.

#### Scenario: Source spec is not modified

- **WHEN** this change archives
- **THEN** `openspec/specs/achievement-system/spec.md` SHALL be byte-identical to its pre-change state
- **AND** `openspec/specs/hospital-leaderboard/spec.md` SHALL be byte-identical

#### Scenario: No equipment reward channel added

- **WHEN** a developer reads the `AchievementReward` type
- **THEN** the type union SHALL contain exactly 2 kinds: `'leaderboard'` and `'title'`
- **AND** `'equipment'`, `'ticket'`, `'cosmetic'`, `'currency'` SHALL NOT be valid kinds
