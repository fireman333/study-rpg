> Incremental — owner verifies EACH increment on a real iPhone (+ Mac Safari). Chrome
> non-regression is automatable; the perf signal is owner-only (no Safari device in dev,
> canvas rAF is background-throttled in automation). Build small, ship/verify, repeat.

## 1. Core spike — static base + CSS pan/zoom (the premise validator)

- [ ] 1.1 Render the maze base (reuse `bakeTileArt` + the Layer ② route / landmark / node-pin draw, including change B's `coreW 0.6`) ONCE into a high-res offscreen canvas on mount + on coarse change; display it in a CSS-transformable stage container. Keep `imageSmoothingEnabled = false`; reuse `MAZE_DPR_CAP` for base resolution.
- [ ] 1.2 Implement pan/zoom as a CSS transform on the stage: native pinch-zoom (touch), wheel-zoom (toward cursor) + drag-pan (desktop). Preserve page-scroll containment (reuse the panel's `overscroll-behavior` / modifier rules). NO steady-state rAF.
- [ ] 1.3 **Owner verifies on iPhone Safari**: pan/zoom is smooth, load is fast, tiles crisp. This validates the whole approach before building dynamic layers. If not smooth → diagnose before proceeding.

## 2. Walker overlay (D2)

- [ ] 2.1 Position the existing walker DOM overlays in maze-space inside the transform; CSS-transition the glide when a settle advances the target cell (no per-frame easing). Reduced-motion → snap.

## 3. Fog / node reveal

- [ ] 3.1 On exploration, reveal the newly-lit node via overlay-reveal (preferred) or a cheap base re-render. No per-frame fog pass.

## 4. Synapse overlay (D4)

- [ ] 4.1 Draw the synapse/connectome layer (inside the transform) from synapse state; re-draw on synapse change; one-shot pulse on wiring. Re-wire hit-testing (tap a wire → tooltip) against static layout + current transform.

## 5. Focus-on-family + per-subject view (D3/D5)

- [ ] 5.1 Tapping a family card animates the stage transform to that family's cluster via a one-shot CSS transition (this IS the per-subject focused view — a zoom level, not a route).

## 6. Ambient (D7)

- [ ] 6.1 Reimplement the ambient firing as lightweight CSS `@keyframes` (opacity/transform only), gated by `useRespectsReducedMotion`. Remove the canvas/rAF ambient.

## 7. Tear down the rAF loop + finalize

- [ ] 7.1 Remove the steady-state `requestAnimationFrame` draw loop and the per-frame camera easing once all overlays are event-driven. Keep only transient one-shot rAFs (if any) that self-stop.
- [ ] 7.2 Re-wire celebrations/ritual overlays + the camera recenter button + `onMazeFocus`/`onMazeRecenter` bus to the transform model.
- [ ] 7.3 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` green; `/simplify`; Chrome non-regression (maze mounts, interactions work, no error, page scrolls). **Owner final iPhone/Mac-Safari sign-off** (load + pan/zoom + walker glide + focus fly + ambient all smooth).
- [ ] 7.4 Confirm zero schema/sync/economy/routes change; `lint:dexie-fixtures` no-op. Batched merge → main → CF Pages; prod-verify bundle + owner prod iPhone check.

## 8. Route colour model — per-cell progress-ranked bands (D8)

> Realized inside the static base bake (the route draw in §1), built AFTER the perf spike (1.3) validates the static approach. **Zero new state** — ranks by the already-synced `maze:<fam>:settles`.

- [ ] 8.1 Precompute once at module load a `cell → familyId[]` map from each family's `path` / `path2` cells in `grid-graph.json`.
- [ ] 8.2 In the static base bake, for each **walked** corridor cell (a family's explored frontier has reached it — reuse `exploredOnRoute` / `litNodes`), render a neutral base myelin sheath + concentric thin bands of the **up-to-3 most-progressed families** through that cell (rank key = `maze:<fam>:settles`; cap 3; 1–2 walkers → 1–2 bands; ties → deterministic `FAMILY_IDS` order). Unexplored cells stay the existing faint fog baseline. Gold demoted to base/frame.
- [ ] 8.3 Re-bake the route/colour layer on settle (the explored frontier or a family's progress changed) — a discrete event, not per-frame.
- [ ] 8.4 Confirm zero new state: no new `meta` key, no `SYNCED_META_KEYS` change, no R2 `SCHEMA_VERSION` / Dexie bump; `lint:dexie-fixtures` no-op.
- [ ] 8.5 Owner visual check: family-exclusive segments read their colour; shared trunk shows its top-3 progressed; the lattice is five-coloured; grayscale still distinguishable via carved route + node-shape; reduced-motion fine.
