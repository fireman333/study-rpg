## Why

The maze (`MazeGrid.tsx`) is janky on Safari (macOS + iPhone) but smooth on Chrome. A codex root-cause pass confirmed the cause: the canvas renderer repaints the entire DPR-2 (~1520×1520) backing store at 60fps, with multiple per-frame allocations (four edge-feather `createLinearGradient` calls, route path rebuilds, radial gradients, heavy `globalAlpha` / `setLineDash` churn). Safari is far worse than Chrome at sustained full-canvas repaint and per-frame fill cost, so the same loop that Chrome absorbs makes Safari/iOS stutter.

## What Changes

This change ships the **low-risk subset** of the perf fix (the biggest win — an idle-stop rAF scheduler — is deferred to a separate profiling session because it needs ~16 wake-trigger sites wired correctly and real-Safari verification that this environment cannot provide):

- **Platform-adaptive DPR cap**: lower the device-pixel-ratio cap from `2` to `1.5` on Safari / iOS only (Chrome and other engines keep `2`). On the maze's pixel-art (imageSmoothing off), 1.5× is visually near-identical but cuts the per-frame fill area ~44%, directly targeting the Safari-only symptom without touching Chrome.
- **Memoize the edge-feather gradients**: the four `createLinearGradient` edge fades (Layer ⑦) are rebuilt every frame; cache them and rebuild only when the canvas size changes. Pure allocation reduction, identical output.

No change to maze topology, routes, economy, fog-of-war, node/shape encoding, schema, or sync.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-brain-maze`: the "Maze SHALL render from a committed pixel-art tile atlas with graceful fallback" requirement gains a **MAY** clause that the renderer MAY cap the device-pixel-ratio backing store lower on high-cost canvas platforms (Safari / iOS) to bound per-frame fill cost — keeping `imageSmoothingEnabled = false` so pixels stay crisp. This documents the cross-platform rendering policy so a future "crispness" tweak doesn't re-raise the cap and re-break Safari.

## Impact

- **Code (presentation/perf only)**: `apps/neurons-tw/src/components/maze/MazeGrid.tsx` — the DPR computation in `resize()` (~line 383) and the Layer ⑦ edge-feather gradient block (~lines 648–659). No other file.
- **No schema / sync / economy / routes change**: zero Dexie / R2 / Worker edit; `lint:dexie-fixtures` no-op.
- **Verification gap (explicit)**: the maze canvas is `requestAnimationFrame`-driven and does not paint in the background-throttled automation tab, and there is no Safari device in this environment — so the Safari perf improvement is **owner-verified on real Safari (Mac + iPhone)** post-deploy. The change is deterministic and only lowers cost on Safari/iOS + removes per-frame allocations, so there is no logic-regression risk on Chrome (verified there).

## Deferred (separate change)

- **Idle-stop rAF scheduler** (`fix-neurons-maze-raf-idle-stop`, future): stop repainting when the camera is settled and no walker/pulse/celebration is active, waking on the full set of interaction + state-change triggers codex enumerated (view / synapse / pulse / focus / wheel / pan / pinch / resize / image-onload / expiry timers). Highest perf win but high regression risk (a missed trigger wrong-freezes the maze) and unverifiable without a real Safari device — handle in a dedicated profiling session.
