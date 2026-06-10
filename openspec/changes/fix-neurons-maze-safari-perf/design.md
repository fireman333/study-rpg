## Context

Codex root-cause (validated against the file): `MazeGrid.tsx` runs an unconditional `requestAnimationFrame` loop (`draw` ends with `raf = requestAnimationFrame(draw)`, line 686) that fully repaints a DPR-capped-at-2 (`Math.min(2, devicePixelRatio)`, line 383) ~1520×1520 canvas every frame, with per-frame allocations: four edge-feather `createLinearGradient` (lines 648–659), route path rebuilds + multiple strokes with `setLineDash` churn (lines 524–588), radial gradients for halos / sparks / core, and heavy `globalAlpha` switching. Static tile art is already baked to an offscreen canvas (`tileBake`) and blitted; the dynamic layers are live. Safari/iOS is much worse than Chrome at sustained full-canvas repaint and per-frame fill/allocation.

The owner chose the **low-risk subset** (this change); the highest-win **idle-stop rAF scheduler** is deferred because it requires wiring ~16 wake triggers correctly and real-Safari verification, which this environment cannot provide.

## Goals / Non-Goals

**Goals:**
- Cut Safari/iOS per-frame cost meaningfully with changes that carry near-zero regression risk and don't degrade Chrome.
- Document the DPR adaptation normatively so it isn't accidentally reverted.

**Non-Goals:**
- The idle-stop rAF scheduler (deferred — separate change + profiling session).
- Any change to routes, economy, fog, node/shape encoding, schema, sync, or the maze's visual design.
- Chrome behavior change (Chrome keeps DPR 2).

## Decisions

### D1 — Lower the DPR cap to 1.5 on Safari / iOS only
In `resize()`, branch the DPR cap on a Safari/iOS heuristic: Safari/iOS → `Math.min(1.5, devicePixelRatio)`, everything else → `Math.min(2, devicePixelRatio)` (unchanged). At ~760px CSS the backing store drops from ~1520² to ~1140² on Safari — ~44% less fill per frame — directly attacking the Safari-only symptom. The maze is pixel-art rendered with `imageSmoothingEnabled = false`, so 1.5× device pixels stays crisp (chunky cells, not blurred). Chrome is untouched.
- *Detection*: UA heuristic — Safari = WebKit-but-not-Chrome/Chromium/Android (`/^((?!chrome|crios|android).)*safari/i.test(ua)`) OR iOS (iPad/iPhone/iPod, incl. iPadOS reporting as Mac with touch). UA sniffing is imperfect, but the worst case is a misdetected engine getting a 1.5 cap — imperceptible on pixel-art — so the blast radius of a wrong guess is cosmetic, not functional.
- *Alternative considered*: cap DPR at 1.5 universally — rejected, would slightly soften Chrome (which is "fine") for no reason. Feature-detect instead of UA — rejected, there is no clean feature test for "this engine's canvas fill is slow".

### D2 — Memoize the four edge-feather gradients
The Layer ⑦ edge fades build four `createLinearGradient` objects every frame, but they depend only on the canvas `w`/`h` and the (constant) `OUTSIDE`/`OUTSIDE_T` colours. Cache them in a ref keyed on `w`/`h` (rebuild only when the canvas resizes). Identical visual output; removes four allocations + four gradient compiles per frame.
- *Alternative considered*: bake the feather into the tile bake — rejected, the feather is screen-space (canvas edges), not maze-space, so it can't live in the maze-space bake.

## Risks / Trade-offs

- [UA sniffing misclassifies an engine] → worst case a non-Safari engine renders at DPR 1.5 (imperceptible on pixel-art); no functional effect. Chrome's main path is the explicit non-Safari branch, so the common case is safe.
- [DPR 1.5 looks softer on a Safari retina display] → imageSmoothing is off and cells are large; owner verifies on real Safari and can tune the cap (1.5 ↔ 1.75) if needed — the value is a single constant.
- [Gradient memo returns a stale gradient after resize] → the cache key is `w`/`h`; `resize()` changes those, so the next frame rebuilds. Verified the cache invalidates on the ResizeObserver path.
- [Cannot verify Safari perf here] → accepted and surfaced in the proposal; Chrome functional non-regression IS verified, and the changes only reduce cost / allocations.

## Migration Plan

Presentation/perf only; no data/rollback implications. Verify Chrome functional non-regression (maze renders, no console error) locally; **owner verifies Safari/iOS smoothness post-deploy** on Mac + iPhone. Rolls into the batched `track-neurons → main` merge with Changes A and B. If Safari is still janky, the deferred idle-stop change is the next lever.

## Open Questions

- Exact DPR value for Safari (1.5 vs 1.75) is owner-tunable after real-device eyeballing; the spec locks only that the renderer MAY cap lower on high-cost platforms, not the literal number.
