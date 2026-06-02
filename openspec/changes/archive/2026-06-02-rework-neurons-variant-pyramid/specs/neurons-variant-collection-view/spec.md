## REMOVED Requirements

### Requirement: The dex SHALL show all 6 slots per family with uncollected slots as rarity-labeled silhouettes

**Reason**: The fixed six-slot dex is replaced by a variable per-family pyramid render
(see the ADDED requirement below). The slot count per family is no longer 6, so this
is a REMOVE + ADD rather than a reworded MODIFIED.

## ADDED Requirements

### Requirement: The dex SHALL show all pyramid slots per family with uncollected slots as rarity-labeled silhouettes

The page SHALL render **every slot the catalog declares for a family** (`slotIndex
0..N-1`, the family's pyramid total) derived from the variant catalog. A collected
`(familyId, slotIndex)` SHALL render as a collected card; an uncollected slot SHALL
render as a dimmed silhouette displaying the slot's **rarity** (e.g. `P0` / `P5`) —
NOT an AP unlock threshold (AP no longer gates collection). The slot count per family
SHALL be derived from the catalog, never hardcoded. The dex SHALL render the complete
slot set even when nothing is collected.

#### Scenario: Uncollected slot renders a silhouette with its rarity

- **GIVEN** the player has not collected `(familyId='藥理學', slotIndex=0)` (P0)
- **WHEN** the collection page renders
- **THEN** that slot SHALL render as a dimmed silhouette displaying `P0` (not an AP threshold)

#### Scenario: Empty collection renders an all-silhouette dex sized to the catalog

- **GIVEN** the player has collected zero variants
- **WHEN** the page renders
- **THEN** every catalog slot SHALL render as a rarity-labeled silhouette and the page
  SHALL NOT be blank

#### Scenario: Collected slot renders a full card

- **GIVEN** the player has collected `(familyId='藥理學', slotIndex=1)`
- **WHEN** the page renders
- **THEN** that slot SHALL render as a collected variant card (not a silhouette)

#### Scenario: A family with multiple variants in a tier renders each as its own slot

- **GIVEN** family `藥理學` declares two `P5` variants (`slotIndex` 1 and 2)
- **WHEN** the dex renders the 藥理學 section
- **THEN** both `P5` slots SHALL render as separate cards/silhouettes labeled `P5`
