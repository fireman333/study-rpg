## MODIFIED Requirements

### Requirement: Collected-variant to lit-node migration

Lit-node state SHALL be derived solely from the per-FAMILY frontier progress (cumulative settle count), NOT from collected variants in general and NOT from any first-pull starter overlay. A family's frontier-lit nodes SHALL be the first `min(settles, nodeCount)` nodes in **route order (along the winding corridor, entry-first)** along that family's corridor (nearest the border first, advancing inward). The lit set SHALL be exactly that frontier — the legacy first-pull starter-lit overlay is retired together with the 4-branch first-pull (the family's representative neuron is shown at the tract walker head per the walker-sprite requirement, not as a lit starter node). The system SHALL NOT run a backfill, duplicate-store frontier lit state, or show a migration banner.

#### Scenario: Lit nodes derive from the per-family border frontier

- **WHEN** a family has `settles = K`
- **THEN** the lit set is the first `min(K, nodeCount)` corridor nodes in route order (along the winding corridor, entry-first)
- **AND** the lit set does NOT depend on which specific variants were collected

#### Scenario: A fresh family has no lit nodes until its first settle

- **WHEN** a family has `settles = 0`
- **THEN** that family has zero lit nodes
- **AND** the family's representative (if first-pulled) shows at the tract walker head, not as a lit node

### Requirement: Exploration walker sprite

Per family, the leading exploration sprite (the family's path representative) that walks that family's corridor SHALL be rendered as the family's **representative** collected variant when the player owns it; otherwise it SHALL fall back to the family's **rarest** collected variant (tie-broken by most-recently collected). When the player has zero collected variants in a family (no first-pull yet), the system SHALL render a **grayscale silhouette** placeholder rather than a collected neuron. Each family's walker selection SHALL be recomputed when the collection or the family's representative changes.

#### Scenario: Walker is the family's representative when set

- **WHEN** family F has a representative variant the player owns
- **THEN** F's walking sprite renders as that representative variant's 立繪

#### Scenario: Walker falls back to the rarest collected variant

- **WHEN** family F has collected variants but no representative set
- **THEN** F's walking sprite renders as F's rarest collected variant's 立繪 (tie-broken by most-recent)

#### Scenario: Empty family shows a grayscale silhouette

- **WHEN** the player has zero collected variants in family F
- **THEN** F's tract head renders a grayscale silhouette placeholder
- **AND** exploration in F still advances at the fixed base speed

### Requirement: Maze progress persistence

The system SHALL persist per-FAMILY earned-energy accrual and settle progress in the existing `meta` key-value store using per-family keys (`maze:<familyId>:earned` monotonic synced accrual, `maze:<familyId>:settles` settle/pull count). Both per-family key families SHALL be in `SYNCED_META_KEYS` and resolve via the MAX-merge counter post-pass. The legacy per-branch first-pull keys `maze:<branch>:starterFamily` and the `firstPullDone` flag are **retired**: they SHALL NOT be in `SYNCED_META_KEYS` and SHALL NOT be read by the maze; any physically-present legacy key in an existing save is ignored (leave-and-ignore). The maze Dexie schema is `.version(17)` (established by the rotjs-grid redesign); the representative change SHALL NOT bump the Dexie version. The R2 bundle `SCHEMA_VERSION` SHALL be bumped additively (17 → 18, reader-tolerant) to carry the new `firstPullFamilies` synced meta key.

#### Scenario: Per-family progress survives reload

- **WHEN** the player advances exploration in any family and reloads the app
- **THEN** each family's earned-energy accrual and settle count are restored independently

#### Scenario: Retired first-pull keys are ignored

- **WHEN** an existing save physically contains legacy `maze:<branch>:starterFamily` or `firstPullDone` keys
- **THEN** the maze ignores them and does not sync them (they are not in `SYNCED_META_KEYS`)
