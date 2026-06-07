## MODIFIED Requirements

### Requirement: Maze crossing-synapses SHALL carry a real neuroanatomical location name

Each committed crossing-synapse in `grid-graph.json` SHALL be assigned a `location` from a curated pool of **learning / LTP / memory-circuit** neuroanatomical structures (e.g. hippocampal CA3 / CA1, Schaffer collaterals, perforant path, dentate gyrus, mossy fibers, the CA1 LTP synapse, engram ensembles, place cells, sharp-wave ripples, and related memory-system tracts/nuclei). This learning-circuit pool **REPLACES** the prior broad-neuroanatomy pool (U1 decision) — it applies to ALL crossing-synapses, including first-route synapses, so the whole maze reads as a learning/memory circuit consistent with the LTP/Hebbian product theme. The pool SHALL be OpenEvidence / PubMed-grounded with a PMID anchor per name (peer-defensible for a medical audience). Assignment SHALL be deterministic (seed-stable) and SHALL be a build-time step that adds `location` to each synapse entry without altering the maze routes, nodes, or weave. Because locations are pure-derived (no stored field), existing collected variants' captions SHALL recompute to the new learning-circuit names on update — an accepted consequence of the replace.

#### Scenario: Every crossing-synapse is named from the learning-circuit pool

- **WHEN** the build-time location assigner runs over the committed grid graph
- **THEN** every entry in `synapses[]` gains a `location` string drawn from the learning / LTP / memory-circuit pool
- **AND** the families' routes, node cells, and weave bridges in the graph are unchanged

#### Scenario: Learning-circuit names are real and OE-grounded

- **WHEN** a location name is added to the pool
- **THEN** it is a real learning / LTP / memory-circuit neuroanatomical structure with an OpenEvidence / PubMed PMID anchor

#### Scenario: Existing variant captions recompute to the new pool

- **WHEN** a player who already collected variants opens the app after this change
- **THEN** their variants' 「在XX尋獲」 captions recompute (pure-derived) to the new learning-circuit location names with no stored-field migration

## ADDED Requirements

### Requirement: Second-route node positions SHALL be named from the same learning-circuit pool and surface an unlock caption

Each committed second-route node position (per `neurons-maze-second-lap`) SHALL be assigned a `location` from the same learning-circuit pool, deterministically at build time. A second-lap location variant SHALL surface its provenance as 「在 <location> 解鎖」 (distinct from the first-route 「在 <location> 尋獲」 caption), derived purely from its `(familyId, slotIndex)` and the committed grid graph — no new stored field. A second device SHALL compute the identical location.

#### Scenario: Second-route position is named and shows an unlock caption

- **WHEN** a second-lap location variant is displayed (reveal or collection detail)
- **THEN** its caption surfaces 「在 <location> 解鎖」 with the second-route position's learning-circuit name

#### Scenario: Location is pure-derived (no new variant field)

- **WHEN** this change ships
- **THEN** no new variant row field stores the location — it is computed from `(familyId, slotIndex)` + the committed `grid-graph.json`
