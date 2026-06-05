# neurons-maze-circuit-locations

## Purpose

Give every maze crossing-synapse a real, OE-grounded neuroanatomical name and surface it as Pikmin-Bloom-style provenance — a collected variant reads 「在 <location> 尋獲」 — derived purely from the variant's `(familyId, slotIndex)` and the committed grid graph (no new stored state). Reinforces real neuroscience for the med-student audience and deepens the collection's sense of place.

## Requirements

### Requirement: Maze crossing-synapses SHALL carry a real neuroanatomical location name

Each committed crossing-synapse in `grid-graph.json` SHALL be assigned a `location` from a curated pool of real neuroanatomical structures (white-matter tracts, subcortical nuclei, named circuits/pathways, or named synapses). The pool SHALL be OE/PubMed-grounded (peer-defensible for a medical audience). Assignment SHALL be deterministic (seed-stable) and SHALL be a build-time step that adds `location` to each synapse entry without altering the maze routes, nodes, or weave.

#### Scenario: Every crossing-synapse is named

- **WHEN** the build-time location assigner runs over the committed grid graph
- **THEN** every entry in `synapses[]` gains a `location` string drawn from the curated neuroanatomy pool
- **AND** the families' routes, node cells, and weave bridges in the graph are unchanged

#### Scenario: Names are real and grounded

- **WHEN** a location name is added to the pool
- **THEN** it is a real neuroanatomical structure with an OE/PubMed grounding (or a flagged textbook-standard structure)

### Requirement: A collected variant SHALL surface the location it was found at

A collected variant whose slot node sits at a named crossing-synapse SHALL surface its provenance as 「在 <location> 尋獲」, derived purely from the variant's `(familyId, slotIndex)` and the committed grid graph — with no new stored field on the variant. A variant whose slot node is not at a named crossing (a padded route node) SHALL omit the location clause and fall back to its existing caption.

#### Scenario: Variant at a named crossing shows its location

- **WHEN** a variant whose slot node sits at a named crossing is displayed (mint reveal or collection detail)
- **THEN** its caption includes 「在 <location> 尋獲」 with the crossing's neuroanatomical name

#### Scenario: Variant not at a named crossing omits the location

- **WHEN** a variant whose slot node is a padded (non-synapse) route cell is displayed
- **THEN** its caption omits the location clause and renders the existing birth caption unchanged

#### Scenario: Location is pure-derived (no new state)

- **WHEN** this change ships
- **THEN** no Dexie schema version, R2 bundle `SCHEMA_VERSION`, or variant row field is added — the location is computed from `(familyId, slotIndex)` + the committed `grid-graph.json`
- **AND** a second device computes the identical location for the same variant
