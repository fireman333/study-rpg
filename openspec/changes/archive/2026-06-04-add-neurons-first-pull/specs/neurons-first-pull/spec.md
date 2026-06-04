## ADDED Requirements

### Requirement: One-time explicit first-pull ritual

The app SHALL offer a one-time "首抽" (first-pull) ritual triggered by an explicit player action (a CTA), NOT automatically and NOT gated on completing any gameplay action. The ritual SHALL be gated solely on a persisted `meta['firstPullDone']` flag: it is offered while the flag is absent/false and SHALL NOT be offered once the flag is true. A single invocation SHALL perform exactly four pulls — one per NT branch (DA / 5HT / GABA / Glu).

#### Scenario: First-pull offered to a player who has not done it
- **WHEN** the homepage loads and `meta['firstPullDone']` is absent or false
- **THEN** an explicit 首抽 CTA is available to the player
- **AND** the CTA is not auto-triggered

#### Scenario: First-pull not offered after completion
- **WHEN** `meta['firstPullDone']` is true
- **THEN** no 首抽 CTA is shown and the ritual cannot be re-invoked

#### Scenario: One invocation yields exactly four pulls
- **WHEN** the player invokes the 首抽 ritual
- **THEN** exactly four pulls resolve, one targeting each of DA / 5HT / GABA / Glu

### Requirement: Per-branch random-family real-rarity roll via the existing pull path

For each of the four NT branches, the ritual SHALL select one family uniformly at random from that branch's families (DA 1-of-2, 5HT 1-of-2, GABA 1-of-3, Glu 1-of-4) and SHALL mint a real variant for it through the existing `pullVariant` path, using the existing P0–P5 rarity pyramid and stamping provenance. The ritual SHALL NOT use a fixed-rarity or curated-family shortcut.

#### Scenario: Each branch rolls a uniformly-random family
- **WHEN** the ritual resolves branch B with families F = {f1, ..., fn}
- **THEN** the targeted family is drawn uniformly at random from F
- **AND** the rolled rarity follows the standard P0–P5 pyramid (not forced)

#### Scenario: Minted variants are real collection entries
- **WHEN** a branch's pull resolves to family F at rarity R
- **THEN** a real variant is persisted via the existing collection path (`neuronVariants` + `neuronInstances`) with provenance stamped
- **AND** the variant is visible in the collection dex like any other pulled variant

#### Scenario: Dupe handling is unchanged
- **WHEN** a first-pull roll lands on a slot already owned
- **THEN** the existing dupe handling applies (copies increment + new individual), identical to a normal pull

### Requirement: Gift semantics — first-pull does not touch the settle economy

The first-pull SHALL be a pure gift: it SHALL NOT increment any branch's `maze:<branch>:settles`, SHALL NOT consume any branch's `maze:<branch>:earned` energy, and SHALL NOT advance the settle pacing/cost ramp. The first-pull SHALL NOT route through `reconcileSettles`.

#### Scenario: Settles unchanged by first-pull
- **WHEN** the ritual completes its four pulls
- **THEN** every branch's `maze:<branch>:settles` remains at its prior value (0 for a new player)
- **AND** no `earned` energy is deducted from any branch

#### Scenario: First earned settle remains node 0
- **WHEN** a new player completes first-pull and later accrues energy toward their first self-earned settle in a branch
- **THEN** that settle is still settle index 0 (cheapest cost), unaffected by the gift

### Requirement: First-pull lights the pulled family's representative node

For each branch, the first-pull SHALL light the representative node of the family it rolled, even though `settles = 0`. The chosen family per branch SHALL be persisted so lighting is deterministic and decoupled from later collection growth. The representative node of a family SHALL be that family's hub-nearest node (smallest `pathLen`), with deterministic tie-break.

#### Scenario: Pulled family's node is lit at settles = 0
- **WHEN** the ritual rolls family F for branch B
- **THEN** F's representative node in branch B is lit on the maze
- **AND** the lit state persists across reload even though `maze:B:settles` is 0

#### Scenario: Starter-lit node is idempotent with frontier
- **WHEN** the player later accrues settles and the frontier reaches the same node already lit by first-pull
- **THEN** the node remains lit exactly once (no double-count, no visual conflict)

### Requirement: First-pull is once-only across devices

The first-pull SHALL set `meta['firstPullDone'] = true` on completion, and this flag SHALL be synced with monotonic-OR merge semantics (once true on any device, it converges to true everywhere). The ritual SHALL gate on this flag — not on whether the collection is empty — so clearing the collection does NOT re-enable first-pull.

#### Scenario: Completed first-pull does not re-trigger on a second device
- **WHEN** device A completes first-pull and the flag syncs to device B
- **THEN** device B does not offer the first-pull ritual

#### Scenario: Clearing collection does not re-enable first-pull
- **WHEN** `meta['firstPullDone']` is true and the player's collected variants are later removed
- **THEN** the first-pull ritual is still not offered

### Requirement: First-pull reveal suppresses achievement toast spam

The first-pull SHALL present its result via a reveal sourced from the motion library, showing all four pulled variants. During the ritual, achievement unlocks triggered by the four pulls SHALL still be persisted/unlocked, but their toasts SHALL be suppressed or queued so they do not flood and obscure the reveal.

#### Scenario: Reveal shows the four pulled variants
- **WHEN** the ritual completes
- **THEN** a motion-library reveal presents the four pulled variants

#### Scenario: Achievements unlock without toast flood during reveal
- **WHEN** the four pulls trigger one or more achievement unlocks
- **THEN** those achievements are unlocked and persisted (visible on the achievements page)
- **AND** their toasts are suppressed or queued rather than shown over the reveal

### Requirement: First-pull state syncs without a Dexie schema bump

The first-pull SHALL persist its state in synced `meta` keys (`firstPullDone` plus one starter-family key per branch) added to `SYNCED_META_KEYS`, and SHALL reuse the existing collection tables for minted variants. It SHALL NOT introduce a new Dexie table or a Dexie `.version()` bump. The R2 neurons bundle `SCHEMA_VERSION` SHALL be bumped additively with reader tolerance so older clients drop the unknown keys and newer clients reading older bundles treat first-pull as not-yet-done.

#### Scenario: No Dexie version bump
- **WHEN** the change ships
- **THEN** no new Dexie table is added and no Dexie `.version()` is incremented

#### Scenario: Forward/backward bundle tolerance
- **WHEN** a client on the older bundle schema reads a bundle containing first-pull keys
- **THEN** it ignores the unknown keys without error
- **AND** a new-schema client reading an older bundle treats first-pull as not-yet-done
