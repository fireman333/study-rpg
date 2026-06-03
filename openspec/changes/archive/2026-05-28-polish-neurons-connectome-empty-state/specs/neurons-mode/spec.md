## ADDED Requirements

### Requirement: ConnectomePage SHALL surface a first-time empty-state callout pointing users to the interaction surface

The `neurons-mode` umbrella SHALL ensure that when a user opens `/connectome` and their persisted state has zero formed synapses (`snapshot.synapses.length === 0`), the page prominently surfaces a friendly first-time callout that:

1. Welcomes the user and explains the game-loop mechanic in plain Traditional Chinese (1-2 sentences, ≤ 120 chars total)
2. Directs visual attention (via an arrow / pointer / clearly worded "向下" reference) toward the page's primary interaction surface — whichever component below the SVG actually records correct answers (currently `ConnectomeDebugPanel`; future change MAY replace it with a real quiz UI without invalidating this requirement)
3. Auto-disappears the moment `snapshot.synapses.length` becomes ≥ 1 (user's first action removes the callout naturally; no manual close button needed)

The callout SHALL be:
- Visible above the fold on standard desktop viewport (≥ 1024 px width)
- Mobile-friendly (does not break layout at 360-820 px viewport widths)
- Annotated for accessibility (`role="region"` + Chinese `aria-label`)
- Stateless — visibility derived entirely from current `synapses.length`; NO localStorage / Dexie / SYNCED_META_KEYS flag persisted

This requirement supersedes the prior implicit-only empty-state, which relied solely on a buried italic mechanic line under the page header.

#### Scenario: First-time user sees the callout above the fold

- **GIVEN** a user signs in and visits `/connectome` for the first time (no synapses formed yet)
- **WHEN** the page loads and `snapshot.synapses.length === 0`
- **THEN** the callout SHALL render between the page header and the connectome SVG
- **AND** the callout text SHALL include both a welcome opener and a 1-sentence game-loop mechanic explanation
- **AND** the callout SHALL include a visual cue (arrow / Unicode pointer / clear "向下捲動" copy) pointing toward the interaction surface below the SVG

#### Scenario: Callout auto-dismisses on first synapse

- **GIVEN** the callout is currently visible (synapses.length === 0)
- **WHEN** the user records correct answers and the first synapse forms (synapses.length becomes 1)
- **THEN** the next page render SHALL NOT include the callout
- **AND** the page SHALL transition smoothly without layout jank above the SVG
- **AND** no localStorage / Dexie state SHALL be written to track the dismissal (visibility is purely derived)

#### Scenario: Returning user with existing synapses never sees the callout

- **GIVEN** a returning user with `snapshot.synapses.length >= 1`
- **WHEN** the page loads
- **THEN** the callout SHALL NOT render
- **AND** the rest of the page (header, SVG, debug panel) SHALL render as before — no regression

#### Scenario: User who resets state sees the callout again

- **GIVEN** a user who previously had synapses but used `重設存檔（不可復原）` to reset
- **WHEN** the page reloads after reset and `snapshot.synapses.length === 0`
- **THEN** the callout SHALL render again
- **AND** this is acceptable / intentional — after a reset, the user IS effectively in the empty-state again

#### Scenario: Callout is responsive on mobile viewport

- **GIVEN** the callout is visible (synapses.length === 0)
- **WHEN** the viewport width is between 360 px and 820 px (typical phone widths)
- **THEN** the callout SHALL render without horizontal overflow
- **AND** the callout SHALL remain readable (text does not get clipped or truncated)
- **AND** the arrow / pointer cue SHALL remain visible
