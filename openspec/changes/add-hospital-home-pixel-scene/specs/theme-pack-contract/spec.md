## ADDED Requirements

### Requirement: ThemePack SHALL accept optional hospital-mode scene fields

The `ThemePack` type SHALL accept two optional fields — `scenes` and `doctorSlotPositions` — to support tier-based scene rendering in hospital management mode. Theme packs targeting hospital mode (e.g. `theme-pixel-hospital`) SHALL populate both fields; theme packs not used in hospital mode (e.g. `theme-pixel-medical`) MAY omit them. Adding these fields is non-breaking per the existing rule "Adding new optional fields is non-breaking".

```ts
interface ThemePack {
  // ...existing required fields
  scenes?: {
    tier1: string  // asset path for 診所 scene
    tier2: string  // asset path for 區域醫院 scene
    tier3: string  // asset path for 醫學中心 scene
  }
  doctorSlotPositions?: {
    tier1: SlotPosition[]  // 2 slots for 診所
    tier2: SlotPosition[]  // 5 slots for 區域醫院
    tier3: SlotPosition[]  // 8 slots for 醫學中心
  }
}

interface SlotPosition {
  room: 'ward' | 'outpatient' | 'surgery'
  x: number  // 0–768 (scene PNG width)
  y: number  // 0–384 (scene PNG height)
}
```

#### Scenario: Hospital theme provides scenes and slot positions

- **GIVEN** `@study-rpg/theme-pixel-hospital` exports `THEME_PIXEL_HOSPITAL`
- **WHEN** the exported object is inspected
- **THEN** it SHALL include `scenes` field with `tier1`, `tier2`, `tier3` asset paths
- **AND** it SHALL include `doctorSlotPositions` field with `tier1` (2 slots), `tier2` (5 slots), `tier3` (8 slots)
- **AND** every slot SHALL have `room` ∈ `{'ward', 'outpatient', 'surgery'}`
- **AND** every slot SHALL have integer `x` ∈ [0, 768], `y` ∈ [0, 384]

#### Scenario: Non-hospital theme omits scene fields

- **GIVEN** `@study-rpg/theme-pixel-medical` exports `THEME_PIXEL_MEDICAL` (used by 一階 medexam-tw, not hospital mode)
- **WHEN** the exported object is inspected
- **THEN** the `scenes` and `doctorSlotPositions` fields MAY be absent
- **AND** the absence SHALL NOT cause TypeScript compile errors elsewhere (fields are optional)

#### Scenario: Hospital scene component consumes theme fields

- **GIVEN** `<HospitalScene>` is imported in `apps/medexam2-hospital-tw`
- **WHEN** the component renders
- **THEN** it SHALL read scene asset path from `theme.scenes[currentTier]`
- **AND** it SHALL read slot positions from `theme.doctorSlotPositions[currentTier]`
- **AND** if either field is undefined (theme pack missing them), the component SHALL render nothing without crashing
