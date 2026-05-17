# Changelog — `@study-rpg/core`

All notable changes to the public API of `@study-rpg/core`. Follows [Semantic
Versioning](https://semver.org/). Breaking changes bump the MAJOR; additive opt-in
changes bump the MINOR; bug fixes bump the PATCH.

## [0.3.0] — 2026-05-17

### Added

- `ThemePack.scenes.tier4?: string` — opt-in 4th hospital tier scene PNG URL
- `ThemePack.doctorSlotPositions.tier4?: SlotPosition[]` — opt-in 4th hospital
  tier doctor slot layout

Both fields are **optional**. Theme packs shipping only 3 tiers continue to
typecheck without modification. Required for theme packs that wish to support
the `國家級教學醫院` tier introduced by the `redesign-hospital-economy` change.

### Why

The `redesign-hospital-economy` change extended `HospitalTier` (in content
packs) to include a 4th tier `國家級教學醫院`. Theme packs that want to ship matching
visuals need a contract surface to expose tier4 scenes + slot positions.

Companion change: `expand-doctor-roster-dei-and-tier4-scene` (2026-05-17).

## [0.2.0] — 2026-05-16

Initial published version. See `migrate-m2nd-to-published-core` archived change.
