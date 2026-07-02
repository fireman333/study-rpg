## Why

`fix-neurons-pdf-iphone-fit-and-memory` made the phone fit control read the visual viewport (one-shot at open + ％) to fit the "visible" width when a residual native browser zoom exists. The owner's iPhone re-test: the PDF still doesn't open at a clean page-width — "PDF 寬度可以預設 100% 就是頁面寬度嗎？不要點進去還需要調整".

Root cause is an iOS Safari mechanic the visualViewport approach can't beat: **native pinch zoom scales `position: fixed` elements too** — the whole full-screen PDF panel (and its page) is re-scaled by the browser's residual zoom. So whatever layout-px width the app renders, the browser scales it again; a render-width tweak can never achieve a true "fit the visible width", it only lands the *initial zoom* on an unpredictable fractional value (read at the mount instant, when `visualViewport.scale` may still be mid-gesture) — which is exactly the "opens at the wrong size, I have to adjust" complaint. And at the normal native-1× state (how a PDF is opened unless the player deliberately pinched), the layout fit-width already fills the screen perfectly — the compensation only *hurt*.

## What Changes

- **Phone + desktop: the default zoom and the ％ reset are always the panel's layout fit-width (zoom = 1 = the page fills the panel width), on every open, no visual-viewport read.** Remove `visualFitZoom` entirely. At native 1× (the normal state) this is exactly "100% = page width" with zero manual adjustment.
- A residual native browser pinch-zoom is treated as the player's **own** zoom (pinch out / double-tap to reset — same as every website); the app no longer tries to compensate for it (compensation was both ineffective under iOS fixed-element scaling and the source of the unpredictable default).
- Unchanged: native pinch stays the zoom gesture, the ± buttons stay the crisp re-raster path, keep-your-place re-pin, and the touch-device canvas-memory bounds (`fix-neurons-pdf-iphone-fit-and-memory` §memory) all stay.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: MODIFIED the button-zoom/native-pinch requirement — the fit reset + initial zoom are the layout fit-width on every open (drop the visible-width / one-shot-visualViewport-read clause and its scenario); the render width and fit are purely layout-derived (no visual-viewport read at all).

## Impact

- `apps/neurons-tw/src/components/PdfDocumentView.tsx` only (zoom init + ％ handler; `visualFitZoom` removed). Net deletion. Memory-bounds code untouched.
- No schema / sync / content change; `PdfPanelHost` untouched (it already measures layout width, no visualViewport).
- Trade-off (accepted, and standard web behavior): if the player has residually pinch-zoomed the browser, opening a PDF shows it at that zoom (may overflow) until they pinch/double-tap back to 1×; the app does not fight the browser's zoom.
