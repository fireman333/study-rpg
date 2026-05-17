## MODIFIED Requirements

### Requirement: Scene asset SHALL switch by hospital tier

The system SHALL render one of **four** tier-specific scene PNG assets based on the current `hospital.tier` state. The four assets SHALL be:

| Tier | Asset path (in theme pack) |
|---|---|
| `'診所'` | `scenes.tier1` |
| `'區域醫院'` | `scenes.tier2` |
| `'醫學中心'` | `scenes.tier3` |
| `'國家級教學醫院'` | `scenes.tier4` |

When `hospital.tier` changes (e.g. via clinic-level-up), the rendered scene asset SHALL change accordingly without page reload. Theme packs that do not ship a tier4 asset SHALL leave `HOSPITAL_SCENES` undefined and trigger the `?scene=off` graceful-degradation path (status text and stats SHALL remain visible).

#### Scenario: Tier 4 scene renders for 國家級教學醫院

- **GIVEN** the player has reached `hospital.tier = '國家級教學醫院'`
- **AND** the active theme pack provides `scenes.tier4` (i.e., `hospital-tier4-national.png` exists in the sprite registry)
- **WHEN** the home page renders
- **THEN** `<HospitalScene>` SHALL display the asset at `theme.scenes.tier4`
- **AND** the rendered `<img>` SHALL have `alt="Hospital scene: 國家級教學醫院"` or equivalent localized alt text

#### Scenario: Tier 3 → tier 4 upgrade swaps scene asset

- **GIVEN** `hospital.tier = '醫學中心'` and scene asset shows tier3
- **WHEN** reputation reaches 2,000,000 and tier upgrades to `'國家級教學醫院'` via the dual-gate (assuming diversification requirements met)
- **THEN** `<HospitalScene>` SHALL re-render with the asset at `theme.scenes.tier4`

#### Scenario: Tier 4 unavailable in theme pack falls back gracefully

- **GIVEN** a fork uses a theme pack that ships only tier1/tier2/tier3 assets (no tier4 file)
- **AND** the player reaches `hospital.tier = '國家級教學醫院'`
- **WHEN** the home page renders
- **THEN** `HOSPITAL_SCENES` SHALL be `undefined` (guard requires all 4 keys)
- **AND** `<HospitalScene>` SHALL display the same "no scene" fallback used by the `?scene=off` query path
- **AND** the status text "醫院：國家級教學醫院" SHALL remain visible
