## MODIFIED Requirements

### Requirement: DMN UI SHALL exist in independent modal + collection page without modifying connectome SVG

The DMN UI surface SHALL be implemented as:
- `DmnDrawModal` — full-screen modal for triggering the draw animation
- `DmnCardReveal` — sub-component for showing the rolled card (modal-form for P1/P2, toast-form for P3/P4)
- `DmnCollectionPage` — new route at `/dmn`, displays all 20 cards with silhouettes for undrawn slots
- **DMN draw action** — hosted in the homepage daily-loop stat card's DMN stage (the `DmnDrawProgressRing` stage inside `ConnectomeStatCard`, per `neurons-homepage`), co-located with the DMN-draw earn-progress bar so earning and spending are one surface; it SHALL NOT be a standalone top-nav or floating button, and SHALL NOT appear on non-homepage routes. The action SHALL render three states from the `dmnDrawsAvailable` entitlement: when `dmnDrawsAvailable >= 1` and not both-pools-exhausted, a prominent action control「▶ 抽 N 張 DMN」(N = `dmnDrawsAvailable`) that opens `DmnDrawModal`; when `dmnDrawsAvailable === 0`, no action control (the earn bar + caption convey how to earn draws); when both pools are exhausted, an in-place「DMN 圖鑑完整」terminal indication (per the both-pools-exhausted disabled-state rule of the draw-flow requirement).

These components SHALL NOT modify, render into, or otherwise touch:
- `connectome-collection`'s SVG / force-simulation / SYNAPSE_TIMINGS token
- `neuron-variant-gacha`'s `VariantUnlockModal` / `VariantUnlockToast`
- Connectome page layout or family card structure

DMN UI SHALL use motion primitives from `neurons-motion-library` (mirroring existing reveal patterns) but render in its own React tree branch.

#### Scenario: DMN modal opens from the homepage card DMN draw action without affecting connectome page

- **GIVEN** the player is on the homepage `/` and `dmnDrawsAvailable >= 1` (and not both-pools-exhausted)
- **WHEN** the player triggers the daily-loop stat card's DMN draw action (「▶ 抽 N 張 DMN」)
- **THEN** `DmnDrawModal` SHALL open as a top-layer overlay
- **AND** the connectome SVG SHALL continue to render unchanged behind the modal
- **AND** no force-simulation tick SHALL be paused or modified

#### Scenario: DMN draw action is the homepage card surface, not a standalone top-nav button

- **WHEN** the homepage top nav renders
- **THEN** no standalone DMN draw button SHALL be present in the top nav (the top nav holds the route links + `AuthGate` only)
- **AND** the DMN draw action SHALL be reachable from the homepage daily-loop stat card's DMN stage

#### Scenario: DMN collection page is reachable via /dmn route

- **GIVEN** the player navigates to `https://med-study-rpg.com/neurons/dmn`
- **WHEN** the page mounts
- **THEN** `DmnCollectionPage` SHALL render a 4×5 grid showing all 20 catalog cards
- **AND** drawn cards SHALL render with full artwork (placeholder this change)
- **AND** undrawn cards SHALL render as silhouettes (or reduced-opacity silhouettes if `hidden-reveal` event has been triggered)
