## Why

After `rework-neurons-pdf-zoom-native-viewport` made native viewport zoom the official pinch mechanism, the owner's iPhone test found: pinching over the open 詳解 PDF made the page **flicker** ("still felt like the PDF's own zoom was triggering"), and after a few panel opens the **Safari tab crashed and reloaded**.

Root cause is a feedback loop left over from the pre-pinch era: `PdfPanelHost` fed the renderer `visualViewport.width` on narrow viewports and re-measured on every `visualViewport.resize`. The visual viewport is exactly what a native pinch changes (pinch to 2× → visual width halves) — so each pinch drove `renderWidth` changes → `PdfDocumentView` re-rasterized the whole document at the new width and re-ran the landing loop mid-gesture (the flicker, and the page "fighting" the fingers) → repeated churn of DPR-3 page canvases → iOS Safari's canvas-memory limit → jetsam tab kill (the crash-reload). The visual-viewport measure was a reasonable fix when pinch was suppressed inside the panel (visual ≈ layout at rest, per its Codex-reviewed rationale); with pinch now first-class it is precisely the wrong signal.

## What Changes

- `PdfPanelHost` measures the panel **body's layout width in BOTH modes** (docked panel width on desktop; the full-screen overlay = layout viewport on narrow) and drops the `visualViewport.resize` listener entirely. Layout measures are pinch-stable — they change only on rotation / split-view / drag commit, all covered by the existing ResizeObserver (+ `orientationchange` belt-and-braces, same 150ms debounce).
- The old visual-viewport rationale (over-wide page → pinch-out trap at min scale → Tab Overview) is obsolete: pinch-out is now an allowed first-class gesture, so a page fit to the layout viewport is simply zoomable, not a trap.
- **Spec**: the native-viewport-zoom requirement gains the violated contract explicitly — the render width SHALL derive from layout-viewport measures, and a native pinch SHALL NOT re-rasterize / reflow / re-anchor the document (compositor-only scaling).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: MODIFIED "The PDF view SHALL support in-app button zoom that keeps the player's place, and SHALL leave pinch to the browser's native viewport zoom" — adds the layout-viewport render-width + pinch-does-not-re-rasterize clauses and a matching scenario.

## Impact

- `apps/neurons-tw/src/components/PdfPanelHost.tsx` only (the width-measure effect); `PdfDocumentView.tsx` untouched.
- No schema / sync / content change. Deliberately NO speculative memory hardening (window-size or canvas-DPR caps) — the steady-state canvas profile is unchanged from the stable pre-pinch weeks; if a crash still reproduces after this fix, that gets its own evidenced change.
