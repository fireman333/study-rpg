# neurons-character-card Specification

## Purpose
TBD - created by archiving change add-neurons-og-share. Update Purpose after archive.
## Requirements
### Requirement: The share entry SHALL render a selectable card-type hub to a shareable PNG, entirely client-side

The neurons mode SHALL provide one share entry that opens a modal hub offering three card types via a switcher — **變體** (a collected variant), **連結** (an unlocked connector), and **戰績** (the stats character card) — defaulting to 變體. Whichever card type is selected SHALL be composed in-browser via the Canvas 2D API and exported as a PNG by `canvas.toBlob` → file download, with an optional `navigator.share({ files })` path on devices that support it. No server SHALL be contacted to build, render, or host any card.

#### Scenario: Player opens the share entry and sees the card-type hub
- **WHEN** the player activates the share entry
- **THEN** a modal SHALL open with a 變體 / 連結 / 戰績 switcher, defaulting to 變體
- **AND** the selected card SHALL render onto a preview canvas with a download action available

#### Scenario: Switching card type re-renders the preview
- **GIVEN** the share modal is open on one card type
- **WHEN** the player selects a different card type
- **THEN** the preview canvas SHALL re-render that card type, with no network request

#### Scenario: Download produces a PNG locally
- **GIVEN** any card type has rendered to the preview
- **WHEN** the player taps 下載
- **THEN** a PNG SHALL be produced from the canvas and delivered via download (or the Web Share sheet where supported)
- **AND** no network request SHALL be required to produce it

### Requirement: The 變體 tab SHALL render a shareable card for any collected variant

The 變體 tab SHALL let the player feature any one of their collected neuron variants, regardless of rarity, via an in-modal picker. The initially-featured variant SHALL be the rarest collected (tiebreak most-recent roll). The rendered card SHALL show the variant's sprite, displayName, rarity badge, family, and birth-context caption, derived entirely from local state. When the player has no collected variants, the tab SHALL render an empty/CTA state, never a thrown error or blank canvas.

#### Scenario: Featured variant defaults to the rarest collected
- **GIVEN** the player has collected variants of mixed rarity
- **WHEN** the 變體 tab opens
- **THEN** the card SHALL feature the rarest collected variant (tiebreak most-recent roll)

#### Scenario: Player features a different collected variant
- **GIVEN** the 變體 tab is showing one variant
- **WHEN** the player picks another collected variant from the picker
- **THEN** the card SHALL re-render featuring that variant, at any rarity

#### Scenario: No collected variants shows an empty state
- **GIVEN** the player has collected zero variants
- **WHEN** the 變體 tab opens
- **THEN** an empty/CTA state SHALL render and the modal SHALL NOT throw or show a blank canvas

### Requirement: The 連結 tab SHALL render a shareable card for any unlocked connector

The 連結 tab SHALL let the player feature any one of their unlocked connectors via an in-modal picker, defaulting to the most-recently unlocked. The rendered card SHALL show the connector sprite (or the procedural split-color fallback when no sprite is registered), the two bridged subject families, and the split-color frame derived from both families' colors, all from local state. When the player has no unlocked connectors, the tab SHALL render an empty/CTA state, never a thrown error or blank canvas.

#### Scenario: Featured connector defaults to the most-recently unlocked
- **GIVEN** the player has unlocked multiple connectors
- **WHEN** the 連結 tab opens
- **THEN** the card SHALL feature the most-recently unlocked connector

#### Scenario: Connector card renders the sprite and split-color frame
- **GIVEN** an unlocked connector with a registered sprite
- **WHEN** its card renders
- **THEN** the card SHALL show the connector sprite, the two bridged family names, and the split-color frame of the two families' colors

#### Scenario: No unlocked connectors shows an empty state
- **GIVEN** the player has unlocked zero connectors
- **WHEN** the 連結 tab opens
- **THEN** an empty/CTA state SHALL render and the modal SHALL NOT throw or show a blank canvas

### Requirement: The card SHALL display the player's stats and per-branch representative variants derived from local state only

The card SHALL show, from already-stored client state: a header (nickname + selected title), a row of representative neuron variants, and a stats readout covering total action potential, strong-synapse count, collection progress (variants collected out of 55, families complete out of 11), and total study minutes. All values SHALL be read from existing Dexie tables / services; the card SHALL add no new stored or synced state.

#### Scenario: Card reflects collected progress
- **GIVEN** the player has collected 12 variants spanning 4 fully-complete families
- **WHEN** the card renders
- **THEN** the collection stat SHALL read 12/55 variants and 4/11 families complete
- **AND** the total action potential and strong-synapse count SHALL match the player's local state

### Requirement: Representative selection SHALL be one variant per NT branch with a defined preference order

The card's hero row SHALL pick at most one representative neuron per NT branch (DA / 5HT / GABA / Glu), branch membership coming from the single exported `FAMILY_NT_BRANCH` source. Within a branch, selection SHALL prefer the player's explicitly-chosen representative; otherwise the highest-rarity collected variant; ties broken by higher family action potential, then more recent roll time. A branch with no collected variant SHALL render an empty slot, never an error.

#### Scenario: Highest-rarity variant represents a branch with no chosen representative
- **GIVEN** the DA branch has collected variants but no explicitly-chosen representative
- **WHEN** the hero row is computed
- **THEN** the highest-rarity DA variant SHALL represent the DA branch

#### Scenario: Empty branch renders an empty slot
- **GIVEN** the GABA branch has zero collected variants
- **WHEN** the card renders
- **THEN** the GABA slot SHALL render empty (silhouette / placeholder), and the card SHALL still render

### Requirement: The card SHALL carry no account identifier and nickname SHALL be optional

The rendered card SHALL NOT include any account identifier (email, auth user id, or similar). The displayed nickname SHALL come from the leaderboard profile when set; when unset, a neutral default SHALL be shown. Producing or sharing a card SHALL NOT require the player to opt into the leaderboard. The card SHALL leave the device only by the player's explicit download/share action.

#### Scenario: No nickname set falls back to a neutral default
- **GIVEN** the player has not set a leaderboard nickname
- **WHEN** the card renders
- **THEN** a neutral default name SHALL be shown
- **AND** no email or account id SHALL appear anywhere on the card

#### Scenario: Card works without leaderboard opt-in
- **GIVEN** the player has not opted into the leaderboard
- **WHEN** the player opens the share entry
- **THEN** the card SHALL still render and be exportable

### Requirement: Card generation SHALL degrade gracefully and never break

Before drawing, the renderer SHALL preload the representative sprites and the pixel font; a sprite that fails to load SHALL yield an empty slot and a font that fails SHALL fall back to a system CJK font — neither SHALL throw. An empty collection SHALL still produce a complete card (zeroed stats, empty slots), never a blank page or a thrown error. Export failures (canvas blob null or a rejected share) SHALL surface a user-visible message rather than being silently swallowed.

#### Scenario: Missing sprite yields an empty slot, not a broken card
- **GIVEN** a representative's sprite asset fails to load
- **WHEN** the card renders
- **THEN** that slot SHALL render empty and the rest of the card SHALL render normally

#### Scenario: Export failure surfaces an error
- **GIVEN** the canvas fails to produce a blob
- **WHEN** the player taps 下載
- **THEN** a user-visible error SHALL be shown and the failure SHALL NOT be silently ignored

### Requirement: The capability SHALL add no backend, Dexie, or R2 footprint

This capability SHALL introduce no backend service, no Dexie `.version()` bump, no R2 bundle `SCHEMA_VERSION` bump, and no new sync adapter or synced state. The card SHALL be a pure derived view of already-local, already-synced data. Any per-player dynamic `og:image` served to social crawlers (which would require a backend) is explicitly out of this capability's scope; only a static, generic OG meta image MAY be added for the app's link preview.

#### Scenario: No schema or sync change ships with the card
- **WHEN** the change is implemented
- **THEN** there SHALL be no Dexie version bump, no R2 schema-version bump, and no new sync adapter
- **AND** the card SHALL render purely from existing local state

