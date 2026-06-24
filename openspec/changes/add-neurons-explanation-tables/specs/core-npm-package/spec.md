## ADDED Requirements

### Requirement: Explanation block type export

The published `@study-rpg/core` package SHALL export a content-agnostic `ExplanationBlock`
type — a discriminated union of `{ type: 'prose'; text: string }` and
`{ type: 'table'; columns: string[]; rows: string[][]; caption?: string }` — and the
`Question` interface SHALL carry an optional `explanationBlocks?: ExplanationBlock[]` field.
The type SHALL contain no domain-specific (medical / neuron) vocabulary. Adding it is an
additive, optional change governed by the pre-1.0 semver policy (PATCH bump) and SHALL be
accompanied by a CHANGELOG entry.

#### Scenario: A fork consumes the explanation-block type

- **WHEN** a downstream app imports `ExplanationBlock` from `@study-rpg/core` and reads a question's optional `explanationBlocks`
- **THEN** the type SHALL be available from the package root entry
- **AND** a question without `explanationBlocks` SHALL remain valid (the field is optional; the flat `explanation` string stays the fallback)
