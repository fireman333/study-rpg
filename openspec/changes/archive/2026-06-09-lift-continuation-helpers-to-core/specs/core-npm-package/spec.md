## ADDED Requirements

### Requirement: Continuation-question helper exports

The published `@study-rpg/core` package SHALL export two content-agnostic pure
helpers for continuation-question ("承上題") handling:

- `isContinuationQuestion(question: Question): boolean`
- `resolvePrecedingChain(question: Question, byId: ReadonlyMap<QuestionId, Question>): Question[]`

These helpers SHALL operate only on `Question` data plus a by-id map — no React,
Dexie, fetch, or domain-specific (medical / neuron) vocabulary. `resolvePrecedingChain`
SHALL resolve the preceding chain by walking back through the SAME full question-id
prefix (`<year>-<sitting>-<book>-<subject>`), MUST NOT cross into a different prefix,
SHALL return the chain ordered root-first … nearest-last excluding the current
question, and SHALL stop best-effort when a predecessor is absent from the map or a
fixed step cap is reached. Introducing these exports SHALL be accompanied by a
CHANGELOG entry and a patch version bump (additive, per the pre-1.0 semver policy).

#### Scenario: Continuation detected by stem prefix

- **WHEN** a `Question` whose `stem` begins with the literal `承上題` is passed to `isContinuationQuestion`
- **THEN** it SHALL return `true`
- **AND** a `Question` with any other (or empty / whitespace-only) stem SHALL return `false`

#### Scenario: Preceding chain resolves root-first within the same paper

- **WHEN** `resolvePrecedingChain` is called on a continuation question with id `<prefix>-Q<n>` and the by-id map contains the consecutive predecessors back to a non-continuation scenario root
- **THEN** it SHALL return those predecessor questions ordered root-first … nearest-last, excluding the current question

#### Scenario: Walk never crosses the question-id prefix

- **WHEN** the by-id map contains a same-numbered question under a DIFFERENT prefix (another paper or subject)
- **THEN** `resolvePrecedingChain` SHALL NOT include it — only `<same-prefix>-Q<n-1>` lookups are performed

#### Scenario: Best-effort stop on missing predecessor

- **WHEN** `resolvePrecedingChain` walks back and the immediate predecessor id is absent from the by-id map
- **THEN** it SHALL stop and return only the predecessors gathered so far (never throw)

#### Scenario: Additive export bumps patch and records CHANGELOG

- **WHEN** these helpers are added to the package exports
- **THEN** `packages/core/package.json` `version` SHALL bump by a patch increment (e.g. `0.6.0` → `0.6.1`)
- **AND** `packages/core/CHANGELOG.md` SHALL gain an entry for that version documenting the new exports

## MODIFIED Requirements

### Requirement: Shoutout message contract export

The published `@study-rpg/core` package SHALL export a content-agnostic shoutout contract consumable by any app/theme: the message type, the structured avatar-payload type, the board client (fetch / upsert / delete / report), and the text normalize/blocklist utilities. The contract SHALL NOT contain domain-specific terms (no medical or neuron vocabulary) — sprites are referenced only by opaque `assetId` strings. Introducing this export SHALL be accompanied by a CHANGELOG entry and a version bump.

#### Scenario: App consumes the contract

- **WHEN** an app imports the shoutout client and types from `@study-rpg/core`
- **THEN** it can post, list, delete, and report messages without reimplementing the schema or transport, against the shared backend

#### Scenario: Core stays content-agnostic

- **WHEN** the shoutout contract is reviewed
- **THEN** it carries only generic fields (e.g. `avatarType`, `assetId`, `message`) and no domain-specific vocabulary

#### Scenario: Versioned release

- **WHEN** the shoutout contract is first published to npm
- **THEN** a CHANGELOG entry is added and the package version is bumped
- **AND** it is released on the `latest` dist-tag — both consumers (二階 + neurons) adopt the contract directly, so no pre-release / parallel dist-tag is required
