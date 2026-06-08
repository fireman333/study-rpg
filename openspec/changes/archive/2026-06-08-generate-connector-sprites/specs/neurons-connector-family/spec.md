## MODIFIED Requirements

### Requirement: Procedural placeholder visual

Each connector SHALL render its registered sprite when one is present, and fall back to a procedural visual when none is present. Connector sprite art ships as a shared set of generic "bridge hub neuron" variety sprites distributed across the closed set (keyed `connector:<pairKey>`) — NOT per-pair-themed: subject identity is carried by the split-color frame, and the sprite provides only visual charm. The procedural fallback derives from the two families' colors: a split-color frame using both families' `FAMILY_COLOR`, plus a shared bridge/axon silhouette and a synaptic glow, requiring no image asset. When a connector sprite is present it SHALL be used; when absent, the procedural placeholder SHALL be shown; a missing sprite SHALL never produce a broken image.

#### Scenario: Procedural placeholder when no sprite present

- **WHEN** a connector has no registered sprite asset
- **THEN** it renders as a split-color frame of its two family colors with a bridge silhouette and glow, with no broken image

#### Scenario: Sprite override when present

- **WHEN** a connector's sprite asset (`connector:<pairKey>`) is registered
- **THEN** that sprite is used in place of the procedural placeholder

#### Scenario: Generic sprite set distributed across the closed set

- **WHEN** the connector sprite set is shipped
- **THEN** a shared set of generic bridge-neuron variants covers all 55 pairkeys (one registered sprite per pairkey), with the split-color frame distinguishing each pair
