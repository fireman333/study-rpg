> Incremental — owner verifies EACH increment on a real iPhone (+ Mac Safari). Chrome
> non-regression is automatable; the perf signal is owner-only (no Safari device in dev,
> canvas rAF is background-throttled in automation). Build small, ship/verify, repeat.

## 1. Core spike — static base + CSS pan/zoom (the premise validator)

- [x] 1.1 Render the maze base ONCE into a high-res canvas + display in a transformable stage. — DONE (architecture revised after the iter-1 iPhone OOM, see 1.3): the scene "ink" (landmarks + routes/`coreW 0.6` + node pins + lit nodes + synapse sparks + core) is baked into a 3072² (`SCENE_SCALE=8` px/cell) **offscreen** transparent canvas via `drawScene()`, re-baked only on a `bakeKey` (explored/lit/synapse/sel/landmark signature) change — never per-frame. The 3-region TILE floor is a separate cached bake (`tileBakeRef`). **⚠️ NOT displayed as a giant CSS-transformed canvas** (that was the crash, see 1.3).
- [x] 1.2 Pan/zoom + NO steady-state rAF. — DONE (revised): **viewport-canvas + event-driven `drawImage` blit** model. The only DOM canvas is viewport-sized (`stage px × VIEW_DPR_CAP`, 1.75 on iOS) → a small composited layer. `drawCamera()` blits the camera's slice of the offscreen layers — `tiles → brain(screen wash) → ink → faint brain contour` (matches the prior per-frame layering, so tracts stay crisp over the brain glow) — on each wheel/drag/pinch event + on settle/focus/resize. Camera = `{cx,cy,z}` (z = on-screen px/cell), cursor-anchored `zoomAround`, drag-pan, double-tap + 🔭 recenter, family-focus framing (instant; fly is §5), auto-focus time-box via `setTimeout`. Walkers = screen-space overlays repositioned from the camera (snap; glide is §2). Edge feather = inset-shadow overlay. Steady-state `requestAnimationFrame` REMOVED. Chrome non-regression GREEN (viewport canvas 1520² on dpr-2, no console errors, wheel-zoom + drag-pan + 🔭 recenter→fit all repaint, page scrolls).
- [ ] 1.3 **Owner verifies on iPhone Safari** — **ITER 1 FAILED (2026-06-11)**: load got faster but scrolling the maze into view crashed Safari ("A problem repeatedly occurred" = WebKit content-process OOM; Vite HMR socket dropped with it). ROOT CAUSE: iter-1 displayed the maze as a **3840² `<canvas>` with `will-change: transform`** → iOS promoted it to ONE composited layer rasterized at devicePixelRatio (~hundreds of MB GPU) → OOM-kill. **FIX (iter 2, above)**: viewport-sized display canvas (small layer) + `drawImage`-blit the offscreen scene per event; `SCENE_SCALE 10→8`; `VIEW_DPR_CAP 1.75` on iOS. No giant composited layer; offscreen bitmaps ≈ tileBake 37MB + ink 37MB + viewport ~7MB. ← **AWAITING OWNER iter-2 re-test** (`pnpm dev --host`, open `http://<mac-LAN-ip>:5175/` on iPhone same WiFi). Verify: no crash on scroll-into-view, pan/zoom smooth, load fast, tracts crisp. Note the dev DB is a *fresh save* (mostly unexplored → more brain haze); the brain wash + deep-zoom sharpness are tunable (brain DEV toggles / zoom-bucket bakes) if needed.

## 1.5 Fable-audit perf hardening — the foundation §2–§8 build on

> Read-only Fable 5 review of the §1 renderer (2026-06-11). Verdict: memory-safe for iOS as-is
> (the ~75 MB of two 3072² offscreen 2D bitmaps is an order of magnitude under the old 3840²
> `will-change` GPU layer; no P1 / no invariant-breakers; src-rect clamp + one-shot timers + leak
> audit all clean). Landed the P2 enablers + cheap wins before stacking animated layers.

- [x] 1.5.1 **rAF coalescer (P2-1, the highest-value change)** — `scheduleDraw()` collapses a burst of pan/wheel/pinch events into AT MOST ONE `drawCamera` per animation frame via a one-shot, self-cancelling `requestAnimationFrame` (`drawRafRef`); cancelled on unmount. Preserves the no-steady-state-rAF invariant (the rAF exists only while a redraw is pending). The flood paths (`onMove` pan, `zoomAround` wheel/pinch) now call `scheduleDraw()`; framing/resize/bake stay direct. **This is also the shared frame scheduler §2 walker-glide / §4 pulse / §5 fly / §6 ambient will reuse.**
- [x] 1.5.2 **`positionWalkers`-only on `view` tick (P2-3)** — the `[view]` effect no longer reblits the whole tiles+brain+scene stack just to move a walker; it calls `positionWalkers` only (scene content changes still go through the `bakeKey` bake effect). Directly load-bearing for §2 (frame-rate walker ticks must not reblit the static stack + re-run the 2× brain `screen` composite).
- [x] 1.5.3 Cheap wins: cache `getContext('2d')` on `viewCtxRef` (P3); fixed the stale `maze-landmarks.ts` "rAF loop calls landmarkImage each frame" comment (P4, no rAF loop exists). **Deferred (optional):** cache `getBoundingClientRect` on desktop hover (P3, desktop-only, needs a scroll listener — low value for the iOS target); `SCENE_SCALE 8→6` memory lever (only if telemetry shows pressure on 2–3 GB devices); `MazeExpedition` `background-position`→`transform` parallax (P3, separate subsystem).
- [x] 1.5.4 Verify: `tsc` clean + 563 vitest green; Chrome — maze renders, **8 synchronous wheel events coalesce to one blit yet the view still updates**, drag-pan + 🔭 recenter work, no console errors. **Owner iPhone perf re-check rides the §1.3 sign-off** (the coalescer should make a fast drag *smoother*, not different). — iPhone confirmed 滑順 (2026-06-11).
- [x] 1.5.5 **Per-layer `imageSmoothing` (sprite-quality fix, owner-reported on desktop Chrome)** — the offscreen blit was `imageSmoothingEnabled=false` for BOTH layers, which is right for the pixel-art tile floor but aliased the smooth neuron-symbol landmark sprites + vector axon tracts badly (at the whole-map default the 8px/cell ink scene downscales ~4.4× → nearest-neighbor mangled them). Fixed in `drawCamera`: **tiles blit smoothing OFF (crisp), ink scene blit smoothing ON (filtered downscale)** — the two are already separate blits. Source sprites are higher-res than the bake, so it's a clean downscale, not a blur. Chrome-verified (zoomed sprite cluster: jagged → smooth; tiles stay crisp). Note: at extreme manual zoom the ink is bake-res-limited (soft) — the SCENE_SCALE / separate-hi-res-overlay lever is a follow-up only if the owner finds deep-zoom landmarks too soft.

## 1.6 Owner-requested §1 refinements (2026-06-11 dogfood)

- [x] 1.6.1 **Pan boundary clamp** — `clampPan()` bounds the camera centre to the maze + `MAZE_PAN_MARGIN` (40 cells), applied at all three camera-write sites (drag `onMove` / `zoomAround` / `frameContextual`). Owner wanted「限制 pan 邊界」instead of a hard backdrop crop: you can pan to a brain-fiber ring at the maze edge but never past it to reveal the whole-head silhouette or the OUTSIDE void. `Z_MIN` already keeps content covering the viewport (no void); edge softness stays on the existing `featherOverlay` vignette. (A prior hard rectangular brain clip was tried + reverted per owner preference.) Spec-delta-worthy at §7 finalize: 「camera pan is bounded to maze + margin」.
- [x] 1.6.2 **Collapsible how-to** — the long maze instructions (growth cone / axon tract / zoom-pan prose) + the legend「霧中的節點…🔗 連結…」blurb are now behind a default-collapsed「ⓘ 怎麼玩 ▾」toggle (`helpOpen` state); the colour-swatch legend key stays always-visible. Owner: the prose ate too much vertical space above/below the map. Chrome + iPhone verified.

## 2. Walker overlay (D2)

- [x] 2.1 Walker DOM overlays already positioned in maze-space by `positionWalkers` (screen-space project from the camera). Added the **glide**: a settle that advances `walkerCell` while the camera holds still CSS-transitions the walker (`transform ${WALKER_GLIDE_MS=650}ms ease-in-out`); pan/zoom/camera-fly snap (no lag). Glide is auto-detected from **cell-changed && camera-stable** (via `lastWalkerCellRef` + `lastCamRef`) rather than a caller flag — this survives the bake-effect-runs-before-view-effect order (the first call on a stationary settle glides; the redundant follow-up is a no-op). Reduced-motion (`useRespectsReducedMotion`) → snap. Chrome typecheck clean; **owner iPhone verify pending** (glide shows on a stationary-camera settle, e.g. answering while sticky-focused on that family or on the idle whole-map view; auto-focus answers ride the camera fly = §5).
- [x] 2.2 **Walker sprite size/quality fix** (owner: read too big + blurry when zoomed). The walker was a 26px box CSS-`transform: scale()`-d by `z/fitTile` (≈1.5–2.6×) — a compositor upscale that bilinear-blurs pixel art and grows unbounded with zoom. Now rendered into a fixed `WALKER_RENDER_PX=52` box and displayed via a scale that's **always a downscale** (on-screen px = `clamp(WALKER_DISPLAY_AT_FIT·zoomScale, 15, 44)`, cap 44 < 52) → crisp at every zoom (variant sprites are 384px native) and capped at ~44px (~25px at whole-map fit). Chrome-measured: 44px shown from 384px native = clean downscale, no console errors.

## 3. Fog / node reveal

- [x] 3.1 Overlay-reveal (no per-frame fog pass): a newly-lit node fires a one-shot gold ring (`maze-ping--node`) via the shared ping system — a `[view]` effect diffs lit-node cells against `litCellsRef` (seeded silently on first load so existing progress doesn't burst-ping) and calls `addPing(cell,'node')` for each freshly-lit cell. The static lit node stays baked in the scene; the ring is a GPU-composited DOM overlay. Reduced-motion → no ring (node still appears via the bake). Chrome non-regression green (CSS `maze-ping-expand` loaded, no errors).

## 4. Synapse overlay (D4)

- [x] 4.1 The synapse spark layer + tap-a-wire tooltip hit-testing were already drawn/working in §1 (baked sparks + `findWireAt` screen→cell math against the live transform). Added the **one-shot pulse on wiring**: a `[synapseData]` effect diffs the live synapse rows (seeded on first load) and `addPing(s.cell, …)` fires a cyan ring (`maze-ping--synapse`) on a newly-formed synapse and a violet ring (`maze-ping--strengthen`) on a state upgrade (dormant→weak→strong). Shares the camera-tracked ping overlay + reduced-motion gate. Pings positioned by a dedicated `positionPings` (separate from `positionWalkers` so a co-occurring node-lit ping can't reset an in-progress walker glide).

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
