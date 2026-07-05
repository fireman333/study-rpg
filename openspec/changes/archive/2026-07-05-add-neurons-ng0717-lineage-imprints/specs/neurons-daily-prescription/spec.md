## ADDED Requirements

### Requirement: Completing the daily prescription SHALL grow a per-subject NG-0717 lineage imprint for that day's 開發新連結 family

When both lines of a day's prescription are complete (`dayComplete`), the system SHALL grow (first unlock) or advance (subsequent touch) an **NG-0717 lineage imprint** for **that day's 開發新連結 family** (the frozen plan's `breadthFamilyId`). The imprint is an auxiliary keepsake layer on top of the existing NG-0717 rolling-day maturation (which is unchanged): as the player methodically works subjects across the sprint, NG-0717 grows one subject-specific dendritic bud per covered subject. The imprint SHALL be grown ONLY from the 開發新連結 line's family; the 訂正錯題 (repair) line SHALL NOT grant any subject imprint (it continues to advance only NG-0717's rolling-day maturation, representing weakness convergence). When the day's `breadthFamilyId` is `null` (no eligible 開發新連結 family, e.g. scope exhausted), NO imprint SHALL be grown that day. Imprint growth SHALL be idempotent per (family, day): the same family completing on the same day SHALL NOT record more than one touch for that day. The imprint SHALL grant NO currency, NO gacha draw, NO neuron variant, and NO leaderboard axis — it is a cosmetic keepsake only.

#### Scenario: Day completion grows a sprout imprint for the breadth family
- **WHEN** both prescription lines are complete on a day whose plan `breadthFamilyId` is `藥理學`
- **THEN** an NG-0717 lineage imprint for `藥理學` SHALL be recorded (first unlock → `sprout`)

#### Scenario: Repeating a subject on a later day advances the same imprint, not a second one
- **WHEN** the player completes the prescription on a later day whose `breadthFamilyId` is again `藥理學`
- **THEN** the existing `藥理學` imprint SHALL advance one touch (its stage warming) and NO second `藥理學` imprint SHALL be created

#### Scenario: A completed day with no breadth family grows no imprint
- **WHEN** both lines are complete on a day whose plan `breadthFamilyId` is `null` (scope exhausted / no eligible new-connection family)
- **THEN** NO lineage imprint SHALL be grown that day

#### Scenario: Repair-line progress alone grows no subject imprint
- **WHEN** the player advances only the 訂正錯題 line (or completes it) without the day being fully complete
- **THEN** NO subject imprint SHALL be grown, and only NG-0717's existing rolling-day maturation SHALL be affected on full completion

#### Scenario: Imprints grant no economy or draws
- **WHEN** an imprint is grown or advanced
- **THEN** no currency, no DMN draw, no neuron variant, and no leaderboard axis SHALL be created or incremented

### Requirement: NG-0717 lineage imprint stage SHALL be derived qualitatively and monotonically from the touch count

Each imprint's visual stage SHALL be **derived** (never stored as a mutable stage field) from the number of distinct completion days on which that family was the 開發新連結 subject (`touches`): `absent` (no imprint, not rendered) → `sprout` (touches ≥ 1) → `warm` (touches ≥ 2) → `myelinated` (touches ≥ 3). The thresholds SHALL be dogfood-tunable constants. `myelinated` is a naturally-reached milestone, NOT a required goal. The derived stage SHALL be **monotonic** — it only advances as `touches` grows and SHALL NEVER downgrade.

#### Scenario: Stage is derived from touch count
- **WHEN** a family's imprint has `touches` of 1, then 2, then 3
- **THEN** its derived stage SHALL be `sprout`, then `warm`, then `myelinated` respectively

#### Scenario: Stage never downgrades
- **WHEN** any number of days pass without the family recurring as the 開發新連結 subject
- **THEN** the imprint's `touches` and derived stage SHALL remain at their prior value (monotonic, never decremented)

### Requirement: The lineage imprint UI SHALL render only grown branches and SHALL NEVER expose a denominator or gap

The imprint UI SHALL render **only families that have already grown an imprint**. A subject without an imprint SHALL NOT be rendered at all — no empty slot, no greyed placeholder, no "尚未解鎖" label, and nothing that occupies a position implying a gap. The UI SHALL NEVER display a fixed denominator or remaining-count in any form (no `X/11`, no `已解鎖 3/11`, no「還差 X 科」, no completion percentage, no progress bar toward a total). Grown imprints SHALL render as dendritic buds branching from the existing NG-0717 mascot inside `DailyPrescriptionCard`, with an optional expandable branch detail; NO separate collection page/tab SHALL be introduced. Copy SHALL use accumulate-the-positive vocabulary (「長出」「留下印記」「今天固化」「新生分支」) and SHALL NOT use completion/deficit vocabulary (「收集完成」「解鎖全部」「尚缺」「還差 X 科」). This requirement governs user-facing copy/visuals only; the finite subject count MAY exist in backend state but SHALL NEVER be surfaced as a task or ceiling.

#### Scenario: Only grown branches render; ungrown subjects are absent
- **WHEN** the player has grown imprints for 3 subjects
- **THEN** exactly those 3 buds SHALL render, and the other 8 subjects SHALL NOT be shown in any form (no placeholder, grey slot, or gap)

#### Scenario: No denominator or remaining-count anywhere in the imprint UI
- **WHEN** the imprint UI (in-card buds and any expanded branch detail) renders
- **THEN** no `X/11`, no remaining-subject count, no completion percentage, and no progress-toward-total bar SHALL appear

#### Scenario: Copy stays accumulate-positive
- **WHEN** an imprint is grown or its detail is shown
- **THEN** the copy SHALL read as growth/keepsake (e.g.「新生分支：藥理學」) and SHALL NOT reference collection completion, unlock-all, or any「尚缺／還差」deficit

### Requirement: Lineage imprint state SHALL persist in local-only meta with no schema or sync change

All lineage-imprint state SHALL live in the existing `meta` key-value table under the `prescription:v1:ng0717:` namespace, and SHALL introduce NO Dexie `.version()` bump, NO R2 bundle `SCHEMA_VERSION` change, and NO new entry in `SYNCED_META_KEYS` (mirroring the existing local-only prescription convention). Imprint records SHALL be **write-once** (set to a truthy value, never deleted) so that `touches`, `firstUnlockedDate`, and `lastTouchedDate` are all derivable monotonically and are last-writer-wins safe. No spendable or bidirectional counter SHALL be added. (Cross-device durability is explicitly out of scope for this change; a future migration MAY promote imprints to a synced keepsake.)

#### Scenario: Imprint state is local-only and write-once
- **WHEN** an imprint is grown or advanced
- **THEN** its state SHALL be written under the `prescription:v1:ng0717:` namespace as write-once meta, transitioning only from absent to a truthy value and never being deleted

#### Scenario: No schema or sync surface changes
- **WHEN** the feature is implemented
- **THEN** there SHALL be no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` change, and no new `SYNCED_META_KEYS` entry
