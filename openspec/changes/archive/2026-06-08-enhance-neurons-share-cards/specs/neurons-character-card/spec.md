## RENAMED Requirements

- FROM: `### Requirement: A single share entry SHALL render a character card to a shareable PNG, entirely client-side`
- TO: `### Requirement: The share entry SHALL render a selectable card-type hub to a shareable PNG, entirely client-side`

## MODIFIED Requirements

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

## ADDED Requirements

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
