## Why

`add-connectome-collection` shipped the Hebbian state machine + per-family AP counter but intentionally deferred the polished SVG / Canvas Linnean phylogenetic tree (spec line 222: "SHALL NOT render any polished SVG / Canvas Linnean phylogenetic tree"). The current `/connectome` view is a 4-column grid of text cards plus a tabular synapse list — functional but not the headline visual that `neurons-mode` Req "Connectome visual SHALL use Linnean taxonomy" promises. Player feedback from M_3rd live smoke also indicates the static text grid does not communicate the wiring-together-of-co-firing-families story well enough — synapse formation events fire toasts but the tree itself never animates, so the connection between "answering more cross-family questions" → "richer connectome" is muted.

This change lands the deferred visualization as an SVG tree (no Canvas — see design.md) sitting above the existing column-card detail view, with animations driven by Framer Motion for synapse formation / strengthening / decay and AP slot unlock.

## What Changes

- **Add** a new `<ConnectomeTreeSvg>` component (responsive SVG, no Canvas) rendered at the top of `/connectome` route, above the existing branch-column grid and synapse table
- **Add** SVG layout: 4 NT-branch root nodes (`DA` / `5-HT` / `GABA` / `Glu`) laid out as Linnean phylogenetic clades; 11 neuron family leaves under their respective branch; synapse edges drawn as SVG `<path>` connectors across clades (cross-NT-branch only — same-branch sister families don't form synapses per current rules)
- **Add** state-driven edge styling: dormant edges hidden; weak edges thin amber; strong edges thicker blue with subtle glow
- **Add** animation contract using neurons-motion-library `useRespectsReducedMotion`:
  - Synapse formation: `pathLength` draw-in (~600ms)
  - Synapse strengthening: stroke width + glow opacity morph (~400ms)
  - Synapse decay (weak→dormant or strong→weak): stroke opacity fade (~600ms)
  - AP slot unlock: per-node pulse + brief halo glow (~500ms)
  - Daily reset: no animation needed (purely state-driven)
- **Add** new motion-library token constant `SYNAPSE_TIMINGS` (formation / strengthen / decay / slot-unlock ms breakdown) — small new export, no breaking change
- **Keep** the existing column-card grid + synapse table — relocated below the tree as a "detail" view (still clickable / accessible / focusable); not removed (helpful for AT users and small-screen fallback)
- **Reduced motion**: when `useRespectsReducedMotion()` returns true, all animations degrade to instant state transitions (no draw-in / no pulse), but state colors / stroke widths still reflect dormant / weak / strong
- **Modify** the `connectome-collection` capability: relax the spec line that bans polished SVG; add new requirements describing tree layout, state-to-style mapping, and animation contract

## Capabilities

### New Capabilities

(none — this is a follow-up that fulfills a deferred requirement in an existing capability)

### Modified Capabilities

- `connectome-collection`: MODIFY the "Stub Connectome view" requirement to allow (no longer forbid) polished SVG tree; ADD new requirement specifying SVG tree layout (4 branches × 11 leaves), state→style mapping, and animation contract bound to `useRespectsReducedMotion`
- `neurons-motion-library`: MODIFY the Purpose / Exports requirement to add `SYNAPSE_TIMINGS` constant alongside `RARITY_TIMINGS` / `SKIP_THRESHOLD_MS` / `TOAST_AUTO_DISMISS_MS`

## Impact

- **Code**:
  - `apps/neurons-tw/src/components/connectome/` (new dir): `ConnectomeTreeSvg.tsx`, `SynapseEdge.tsx`, `FamilyNode.tsx`, `BranchRoot.tsx`, `layout.ts` (pure layout calculator)
  - `apps/neurons-tw/src/routes/ConnectomePage.tsx` — wrap existing grid + table in a `<details>` or collapsible section below the new tree
  - `apps/neurons-tw/src/lib/motion/timings.ts` (or inline in motion library index) — add `SYNAPSE_TIMINGS` export
- **Spec**: 2 modified capabilities (`connectome-collection`, `neurons-motion-library`); 1 new requirement for tree layout
- **No new deps**: reuses Framer Motion already vendored for motion library; no D3, no react-flow, no Canvas runtime
- **Deploy**: client-only React component change, no Worker / D1 / Supabase / R2 changes; CF Pages + GH Pages workflows do NOT need updates (the CLAUDE.md sharp edge applies only when adding a new app; this is a same-app polish change)
- **No data migration**: read-only consumer of existing Dexie `familyAccrual` + `synapses` tables; no schema bump
- **No leaderboard / D1**: zero touch
- **Performance**: 11 family nodes + ≤ C(11, 2) = 55 possible edges = trivial DOM count; SVG path animations are GPU-accelerated by browsers; no perf concern even on mid-range mobile
