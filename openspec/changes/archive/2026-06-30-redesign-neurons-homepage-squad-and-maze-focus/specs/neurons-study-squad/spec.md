## MODIFIED Requirements

### Requirement: Squad renders as a party on the connectome homepage

The active squad SHALL be presented on the homepage under the display name **「神經元遠征隊」** as a **read-only preview** (`SquadPreview`): a compact avatar-stack of its ≤ `MAX_SQUAD_SIZE` members rendered with `VariantSprite`, plus a **「到圖鑑編隊 →」** link that navigates to `/collection?squad=1`. The homepage SHALL NOT host any add / remove / edit-team affordance — the editable picker is removed from the homepage, and all squad editing happens on the `/collection` surface (per `neurons-variant-collection-view`). The preview SHALL NOT crowd or overlap the homepage maze, SHALL be responsive (mobile reflow), and SHALL respect `prefers-reduced-motion`. When the squad is empty, the preview SHALL show an assemble-your-squad placeholder plus the link, rather than a broken/empty element. Members whose variant key is no longer collected SHALL be filtered at read time (mirroring `filterStaleRepresentatives`). The active squad SHALL remain the **single source of truth** for every surface that depicts the squad — the homepage preview, the correct-answer celebration, AND the maze expedition animation band (`neurons-maze-expedition`) — so the player's chosen party appears consistently across all of them. This relocation is presentational only: the persisted `activeSquad` meta key, its `VariantKey` shape, and all selection/sync mechanics are unchanged (no migration).

#### Scenario: Homepage shows a read-only squad preview
- **WHEN** the homepage loads with a non-empty active squad
- **THEN** the「神經元遠征隊」preview renders its members as a read-only avatar-stack via `VariantSprite`, beside (not over) the homepage maze
- **AND** no add / remove / 編輯隊伍 control is present anywhere on the homepage

#### Scenario: Empty squad preview links to the editor
- **WHEN** the homepage loads with an empty active squad
- **THEN** the preview shows an assemble-your-squad placeholder plus the「到圖鑑編隊 →」link, with no broken element

#### Scenario: Preview links into the collection squad editor
- **WHEN** the player activates the「到圖鑑編隊 →」link
- **THEN** the app navigates to `/collection?squad=1`
- **AND** the `/collection` squad manager is scrolled into view

#### Scenario: Narrow viewport does not overlap the maze
- **WHEN** the homepage renders at a mobile-width viewport
- **THEN** the squad preview reflows without overlapping the homepage maze

#### Scenario: One squad drives every surface
- **WHEN** the player edits the active squad on `/collection`
- **THEN** the homepage preview, the correct-answer celebration, and the maze expedition animation band all reflect the same updated members (the band still derives from `activeSquad`, not an independent auto-rarest set)
