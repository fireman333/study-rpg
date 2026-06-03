## MODIFIED Requirements

### Requirement: Homepage SHALL render a lightweight presentational connectome-tree hero that routes to the full interactive view

The neurons-tw homepage (`/`) SHALL render the real labeled connectome tree (`ConnectomeTreeSvg`) as its hero, in a **non-interactive (presentational) embed mode**: family sprites + names + AP chips + firedToday halos + state-styled synapse edges, but with pan / zoom / wheel-capture / drag and the zoom toolbar all disabled so the hero never intercepts page-scroll on the landing page. Activating the hero (click or keyboard Enter/Space) SHALL navigate to `/connectome`. The hero SHALL be a non-`<button>` activation wrapper (the tree renders a `<section>`). The force-sim layout pass SHALL be allowed to run only until it self-settles (its rAF loop stops when stable).

#### Scenario: Hero renders the labeled real tree
- **WHEN** the homepage loads with an initialized connectome snapshot
- **THEN** the hero renders the real `ConnectomeTreeSvg` with family sprites + names + AP chips and state-styled (`dormant | weak | strong`) synapse edges — not an abstract unlabeled mini-tree

#### Scenario: Hero is non-interactive and does not capture page-scroll
- **WHEN** the user wheel-scrolls, drags, or pinches over the hero on the homepage
- **THEN** no tree pan / zoom / node-drag occurs, the zoom toolbar is absent, and the page scrolls normally (the homepage embed passes `interactive={false}`)

#### Scenario: Hero routes to the full connectome on activation
- **WHEN** the user clicks the hero or focuses it and presses Enter/Space
- **THEN** the app navigates to `/connectome` where the same tree is interactive and the family-detail grid + synapse table live

#### Scenario: The /connectome tree remains fully interactive
- **WHEN** the user is on `/connectome`
- **THEN** the tree there is still pan/zoom/drag interactive with its zoom toolbar (the `interactive` prop defaults to true; only the homepage embed disables it)

#### Scenario: Hero is responsive on mobile
- **WHEN** the homepage is viewed below 768px width
- **THEN** the hero tree remains legible and within viewport without horizontal overflow
