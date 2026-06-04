## MODIFIED Requirements

### Requirement: Collected-variant to lit-node migration

Lit-node state SHALL be derived from the per-branch frontier progress (cumulative settle count) UNIONed with the first-pull starter-lit node(s), NOT from collected variants in general — because under random settle pulls the variant collected at a settle is not necessarily the lit node's own slot. The frontier-lit nodes of a branch SHALL be the first `min(settles, nodeCount)` nodes in hub-distance (`pathLen`) order. The starter-lit node of a branch SHALL be the representative node (hub-nearest, deterministic tie-break) of the family chosen by the one-time first-pull for that branch, persisted in `meta['maze:<branch>:starterFamily']`; it lights even when `settles = 0`. The branch's lit set SHALL be the set union of its frontier-lit nodes and its starter-lit node, deduplicated by node identity (a node reached by both first-pull and the frontier is lit exactly once). Collection progress is tracked separately (the 🧬 count + the collection dex). The system SHALL NOT run a backfill, duplicate-store frontier lit state, or show a migration banner. Existing players' per-branch `settles` (preserved from the pre-change maze) keep their frontier; their existing collected variants remain in the collection unchanged. A player who collected variants via the (removed) manual pull but never explored the maze simply starts the frontier at their stored `settles` (no regression — exploring yields additional random pulls).

#### Scenario: Lit nodes derive from frontier unioned with starter-lit, not general collection

- **WHEN** a branch has `settles = K` and a first-pull starter family is recorded
- **THEN** the lit set is the union of the first `min(K, nodeCount)` nodes in `pathLen` order and the starter family's representative node
- **AND** the lit set does NOT otherwise depend on which specific variants were collected

#### Scenario: Starter node lit at zero settles

- **WHEN** a branch has `settles = 0` and `meta['maze:<branch>:starterFamily']` is set to family F
- **THEN** F's representative node is lit
- **AND** no frontier nodes are lit (since `settles = 0`)

#### Scenario: Frontier reaching the starter node does not double-light

- **WHEN** the frontier later advances to include the node already lit by first-pull
- **THEN** that node is lit exactly once (set union dedup), with no visual conflict

#### Scenario: No backfill or migration banner

- **WHEN** an existing player first opens the maze homepage
- **THEN** their stored per-branch `settles` and their collected variants are both preserved
- **AND** no backfill write or migration banner occurs
