## MODIFIED Requirements

### Requirement: Structured avatar payload validation

The backend SHALL accept the avatar only as a structured payload `{ avatarType, assetId, cosmeticId? }`, validate `avatarType` against a fixed enum and the id fields against a bounded charset/length, and reject anything else. The id charset SHALL permit Unicode letters and numbers (e.g. CJK) in addition to ASCII, so apps whose canonical sprite ids are non-ASCII — such as the neurons content pack's Chinese family ids (`寄生蟲學`, `藥理學`, …) — pass validation; it SHALL continue to exclude whitespace, quotes, slashes, angle brackets, and control characters, bounded to 1–64 code points. The same charset rule SHALL be mirrored in the `@study-rpg/core` client contract. Strict ownership verification of the referenced sprite is OPTIONAL and MAY be deferred.

#### Scenario: Malformed payload rejected

- **WHEN** an avatar payload contains a field outside the allowed shape/charset (e.g. a URL, markup, whitespace, or oversized string)
- **THEN** the Worker rejects the write and persists nothing

#### Scenario: Well-formed payload accepted

- **WHEN** an avatar payload matches the structured shape and charset bounds
- **THEN** it is stored and later returned for the client to resolve to a sprite by lookup

#### Scenario: Non-ASCII (CJK) sprite id accepted

- **WHEN** a write supplies an `assetId` composed of Unicode letters such as a neurons Chinese family id (e.g. `寄生蟲學`)
- **THEN** the avatar passes charset validation and the write succeeds (rather than being rejected as `invalid_avatar`)
