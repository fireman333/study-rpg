## Why

The homepage connectome hero shipped by `revamp-neurons-homepage-experience` is an abstract, unlabeled mini-tree (colored dots + edges, zero text labels). For a new player — especially at "0 連線" — it reads as a decorative skeleton that conveys nothing and can mislead (which dot is what? what am I looking at?). The actual product visual on `/connectome` (`ConnectomeTreeSvg`) labels everything — family sprites + names + AP chips + firedToday halos — and is instantly recognizable as "my collection map." The hero should BE that real visual, not an abstract proxy.

## What Changes

- **Replace the abstract `ConnectomeHero` mini-tree with the real `ConnectomeTreeSvg`** rendered in a **non-interactive embed mode** on the homepage: family sprites + names + AP chips, but with pan / zoom / wheel-capture / drag / the zoom toolbar all disabled so it never fights page-scroll on the landing page. Clicking (or Enter/Space) still routes to the full interactive `/connectome`.
- **Add an `interactive?: boolean` prop (default `true`) to `ConnectomeTreeSvg`**: when `false`, skip the wheel/touch `addEventListener` bindings, omit the pointer drag handlers, hide the zoom toolbar, and set `touchAction: auto` + a non-grab cursor. `/connectome` continues to pass the default (`true`) — its behavior is unchanged.
- **The dense family-detail grid + synapse table STAY on `/connectome`** (not moved to homepage — that would reintroduce the "機制要先看懂" friction the prior change removed). This is the targeted fix for "too abstract," not a full-page merge.
- The homepage embed is height-constrained and the force-sim (which already self-settles and stops its rAF loop) runs only a brief layout pass on load.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-homepage`: The hero requirement changes from "a lightweight presentational mini-tree that does not mount `ConnectomeTreeSvg` and runs no rAF loop" to "the real labeled `ConnectomeTreeSvg` embedded in non-interactive mode (no pan/zoom/drag/toolbar, page-scroll preserved), routing to `/connectome` on activation." The "no rAF physics loop on the homepage" constraint is replaced by "a self-settling layout pass that stops when stable."

## Impact

- **App code**: `apps/neurons-tw/src/components/connectome/ConnectomeTreeSvg.tsx` (add `interactive` prop, gate interaction binding + toolbar); `apps/neurons-tw/src/components/ConnectomeHero.tsx` (rewrite to wrap the real tree in non-interactive mode + click-to-`/connectome` + height constraint); `OverviewPage.tsx` import unchanged (`ConnectomeHero` keeps its name).
- The abstract-hero internals (fixed-layout SVG, ambient `.neuron-firing-node` usage) are removed from the hero; the `AmbientFiring` motion-library primitive remains exported + self-verifiable on `/motion-demo` (not deleted).
- **Specs**: delta to `neurons-homepage`. `connectome-collection` unchanged (the `interactive` prop is additive; `/connectome` behavior identical). `neurons-motion-library` unchanged.
- **Data / deploy**: no data change; no Dexie/R2/Worker change. Same CF Pages deploy path. SPA routing unchanged (no new routes).
