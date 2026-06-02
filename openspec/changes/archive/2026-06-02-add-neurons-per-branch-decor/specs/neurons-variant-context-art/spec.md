## ADDED Requirements

### Requirement: Decor textures SHALL be flavoured by the variant's NT branch with a universal fallback

The context-art descriptor SHALL carry the variant's NT branch (`'DA' | '5HT' | 'GABA' | 'Glu'` or null), derived purely from `row.familyId`. At render time, each decor type SHALL resolve to a per-branch texture keyed `decor:<type>:<branch-lowercase>` (e.g. `decor:redemption:da`). When the per-branch texture asset is absent, rendering SHALL fall back to the universal `decor:<type>` texture; when the universal asset is also absent, it SHALL show no visible decor field (never a broken image). The provenance→decor-type mapping (救贖 / 里程碑 / 元老), stacking, and exclusivity SHALL be unchanged. The branch SHALL affect only the decor channel — the brain-wave band and rarity channels SHALL be unaffected.

#### Scenario: Decor flavoured by the variant's branch
- **GIVEN** a 救贖 variant of family `藥理學` (NT branch DA)
- **WHEN** it renders and the `decor:redemption:da` asset is present
- **THEN** the firing-field texture shown SHALL be the DA-flavoured `decor:redemption:da` texture

#### Scenario: Per-branch asset absent falls back to the universal texture
- **GIVEN** a 里程碑 variant of family `組織學` (NT branch 5HT)
- **WHEN** it renders and `decor:milestone:5ht` has no asset but `decor:milestone` does
- **THEN** the universal `decor:milestone` texture SHALL render (no broken image)

#### Scenario: Branch does not alter the band or rarity channels
- **GIVEN** any collected variant
- **WHEN** `variantContextArt(row)` runs
- **THEN** the brain-wave band SHALL be derived exactly as before from `rolledAt`
- **AND** the rarity chip / reveal SHALL be unchanged by the branch

### Requirement: The variant→NT-branch mapping SHALL come from a single exported source

The 11-family `familyId → NT-branch` mapping SHALL be defined once as a runtime export of the content pack (`@study-rpg/content-neurons-tw`) and consumed by both the build pipeline (when emitting each subject's branch grouping) and the render-time context-art derivation. There SHALL NOT be a second hard-coded copy of the mapping. A `familyId` not present in the map SHALL resolve to a null branch (which falls back to the universal decor texture). This SHALL introduce no Dexie `.version()` bump, no R2 bundle `SCHEMA_VERSION` bump, and no sync adapter.

#### Scenario: All eleven families resolve to their canonical branch
- **GIVEN** the exported family→branch map
- **WHEN** each of the 11 family ids is looked up
- **THEN** it SHALL resolve to its canonical branch (藥理學/公共衛生學→DA; 寄生蟲學/組織學→5HT; 生物化學/病理學/免疫學→GABA; 解剖學/生理學/胚胎學/微生物學→Glu)

#### Scenario: Build pipeline and render derivation use the same source
- **GIVEN** the build script's subject branch grouping and the render-time branch derivation
- **WHEN** both compute a family's branch
- **THEN** both SHALL read the single exported map and resolve identically

#### Scenario: Unknown family resolves to a null branch
- **GIVEN** a row whose `familyId` is not present in the map
- **WHEN** the branch is derived
- **THEN** the branch SHALL be null and the universal decor texture SHALL be used

## MODIFIED Requirements

### Requirement: A missing decor asset SHALL degrade gracefully

Decor sprite resolution SHALL follow a fallback chain: the per-branch texture (`decor:<type>:<branch>`) is used when its asset is present; otherwise the universal texture (`decor:<type>`) is used when present; otherwise no visible decor field is shown. If a resolved key would be the transparent placeholder (asset not yet present at any level), the render SHALL still show the base sprite with no broken-image icon. Absence of a decor asset SHALL mean "no visible context field", never a render failure.

#### Scenario: Placeholder decor key renders base only
- **GIVEN** neither `decor:redemption:da` nor `decor:redemption` has a real asset
- **WHEN** a 救贖 DA variant renders
- **THEN** the base sprite SHALL display normally with no broken-image icon

#### Scenario: Per-branch missing but universal present
- **GIVEN** `decor:elder:glu` has no asset but `decor:elder` does
- **WHEN** an 元老 variant of a Glu family renders
- **THEN** the universal `decor:elder` Cajal-plate texture SHALL render behind the neuron
