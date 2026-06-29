## ADDED Requirements

### Requirement: Family cards SHALL render the family's representative variant as the header sprite

Each homepage family card's header sprite SHALL render that family's **representative variant** — the collected variant the player has chosen as the family's representative on `/collection` (the `representativeVariants` meta selection, per `neurons-variant-collection-view`) — using `VariantSprite`, so the homepage card and the dex show the same chosen variant. When the family has no representative set (or its stored representative points at a variant that is no longer collected), the card SHALL fall back to the generic per-subject sprite (`subject:<familyId>`). This is a derived, read-only presentation: it reuses the existing synced `representativeVariants` meta key and introduces no new persistence or schema change. The selection SHALL stay in sync reactively (changing the representative on `/collection` updates the homepage card without a reload).

#### Scenario: Card shows the chosen representative variant
- **GIVEN** the player has set a collected variant as a family's representative on `/collection`
- **WHEN** that family's homepage card renders
- **THEN** the card header sprite SHALL be that representative variant's sprite (via `VariantSprite`), not the generic subject sprite

#### Scenario: No representative falls back to the subject sprite
- **WHEN** a family has no representative set
- **THEN** the card header SHALL render the generic `subject:<familyId>` sprite

#### Scenario: Stale representative falls back to the subject sprite
- **GIVEN** a family's stored representative points at a variant that is no longer collected
- **WHEN** the card renders
- **THEN** the representative SHALL be treated as absent and the generic subject sprite SHALL render (no broken image)

#### Scenario: Representative change reflects without reload
- **WHEN** the player changes a family's representative on `/collection` and returns to the homepage
- **THEN** that family's card sprite SHALL reflect the new representative (the binding is reactive via the shared meta key)
