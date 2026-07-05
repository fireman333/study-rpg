## MODIFIED Requirements

### Requirement: System SHALL select one blind-spot family by a coverage-weighted score

The 開發盲區 line SHALL target exactly one "盲區 family" chosen at plan-generation time (surfaced to the player under the calmer label **「開發新連結」**). Only families with at least one unseen (never-answered) question **within the effective year scope, excluding ✨ easyMarked questions,** SHALL be eligible. Among eligible families the system SHALL rank by a coverage-weighted `score = 0.75 · (unseenCount / totalQuestions) + 0.25 · min(1, (outstandingWrongCount / max(uniqueAttempted, 8)) · 3)`, where `unseenCount` and `totalQuestions` are counted **within the effective year scope**.

On top of the score, the system SHALL apply an **invisible NG-0717-imprint coverage bias** that steers the day's pick toward subjects not yet (or least-recently) covered, so dendritic buds spread methodically across all subjects over the sprint rather than clustering on a few high-score families. The bias SHALL be a two-tier preference applied among the eligible families: (1) families with **no lineage imprint yet** (never grown a bud) SHALL be preferred, ranked among themselves by the coverage `score`; (2) only when **every** eligible family already has an imprint SHALL the system fall back to the imprinted families, preferring the **oldest `lastTouchedDate`** (least-recently covered) and then the coverage `score`. This bias SHALL be derived at plan-generation time from the existing local-only `prescription:v1:ng0717:imprint:*` keys and SHALL NOT be surfaced to the player in any form (NO copy such as「輪替／因為你還沒碰 X／覆蓋率／還剩幾科」, NO map, NO denominator). When no imprint data exists (e.g. a brand-new player), the selection SHALL reduce to the pure coverage `score` (backward-compatible).

A family selected on each of the previous 2 consecutive days SHALL be skipped when another eligible family exists (this guard is applied before the imprint bias). Ties SHALL be broken deterministically by a hash of `date + familyId + localUserId`. The 開發盲區 CTA SHALL open that family's existing `fresh` (新題) quiz mode. For MVP, "少寫" SHALL mean unseen (never-answered) questions only.

#### Scenario: Never-imprinted eligible family is preferred over a higher-score imprinted one
- **WHEN** the plan is generated, family A has already grown a bud (imprinted) with a higher coverage score, and family B has no imprint yet with a lower coverage score, both eligible
- **THEN** family B (never-imprinted) SHALL be selected as the day's 開發新連結 family

#### Scenario: Highest-score never-imprinted family wins among never-imprinted families
- **WHEN** multiple eligible families are all never-imprinted
- **THEN** the one with the highest coverage-weighted score SHALL be selected (imprint bias does not reorder within the same tier)

#### Scenario: All eligible families imprinted → least-recently-covered rotates in
- **WHEN** the plan is generated and every eligible family already has an imprint
- **THEN** the family with the oldest `lastTouchedDate` SHALL be preferred (ties broken by score, then the deterministic hash)

#### Scenario: No imprint data falls back to pure coverage score
- **WHEN** the plan is generated and no lineage imprints exist yet
- **THEN** the selection SHALL reduce to the pure coverage-weighted score (unchanged legacy behavior)

#### Scenario: The imprint bias is never surfaced to the player
- **WHEN** the 開發新連結 line renders after an imprint-biased pick
- **THEN** it SHALL show only the selected family + persona, with NO copy attributing the pick to coverage/rotation/「還沒碰」and NO denominator or remaining-subject count

#### Scenario: Highest-score eligible family is chosen within the year scope
- **WHEN** the plan is generated and multiple families have unseen questions within the effective year scope
- **THEN** the family selected SHALL be one computed within that scope (the imprint bias operates only over year-scoped eligible families)

#### Scenario: Too-easy questions are excluded from the unseen pool
- **WHEN** a family's only remaining unseen questions are all flagged ✨ easyMarked
- **THEN** that family SHALL NOT be eligible on the basis of those questions (mastered questions are not re-served)

#### Scenario: Recently-repeated family is skipped
- **WHEN** the top-scoring family was already the 開發新連結 family on both of the previous 2 days and another eligible family exists
- **THEN** that family SHALL be skipped and the next-best eligible family SHALL be selected

#### Scenario: Blind-spot CTA opens the family fresh mode
- **WHEN** the player triggers the 開發新連結 line
- **THEN** the selected family's `fresh` (新題) quiz mode SHALL open (no new quiz mode is introduced)
