## Why

The in-app PDF viewer already has app-state zoom (－ / ％ / ＋ buttons, re-rasterizing react-pdf at a new width — shipped un-specced as `add-neurons-pdf-mobile-zoom`), because native browser pinch is deliberately suppressed inside the panel (Safari's pinch-out is hijacked by Tab Overview; visual-vs-layout viewport mismatch makes native zoom unusable in the docked panel). But on the phones and iPads where the booklet PDFs are actually read, players instinctively pinch — and today that gesture does nothing. Two-finger pinch should drive the existing app-state zoom.

Design consulted a Fable 5 agent over the viewer's virtualization + WKWebView landing machinery; its v1 recommendation (live transform preview → single commit; freeze the scroll machinery during the gesture; re-pin to the top-visible page) is what this change implements, with one correction: the re-pin anchor page is tracked in `onScroll` (where scrollTop and page offsets are in a consistent space) rather than derived after the width change (which would read the old scrollTop against new page offsets and land on the wrong page).

## What Changes

- **Two-finger pinch on the PDF scroll surface drives zoom** (touch devices). During the gesture a live compositor-only CSS `transform: scale()` preview (origin at the pinch centroid, in content space) tracks the fingers; on release the final zoom **commits exactly once** to app state (continuous, rounded to 0.05, clamped to the existing 0.5–2.5 range), triggering one re-rasterization through the existing width-repin → settle landing path. No per-frame re-raster, no second landing mechanism.
- **The gesture never fights the scroll machinery**: a `pinchingRef` freezes `onScroll` window growth and the ResizeObserver height-compensation for the gesture's duration (sibling of the existing `openingRef` freeze); a pinch cannot start while an open-landing is settling. WebKit's proprietary `gesturestart`/`gesturechange` are suppressed on the container (the part `touch-action` alone doesn't cover), one-finger scrolling stays fully native (`touch-action: pan-x pan-y`).
- **Zoom / drag-resize now keeps the player's place**: after the initial landing, any `pageWidth` change (pinch commit, ± buttons, panel drag-resize) re-pins to the current **top-visible page** — tracked in `onScroll` in consistent coordinate space — instead of snapping back to the question's `initialPage` (the old behavior, a latent bug the ± buttons already had). A fresh open / question jump still lands on the question's page (`landedRef` gates the pre-landing window).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: adds a requirement covering in-app zoom (the previously un-specced button zoom) + touch pinch-to-zoom + the keep-your-place re-pin semantics.

## Impact

- `apps/neurons-tw/src/components/PdfDocumentView.tsx` only: new pinch-gesture effect (raw touch events, no library, mount-stable `[]` deps reading refs), `pinchingRef` / `landedRef` / `topPageRef` refs, `topVisiblePage()` helper, width-repin effect anchors to `topPageRef` post-landing, `touch-action: pan-x pan-y` on the scroller.
- No change to the panel host, provenance map, fetch/cache layers, Dexie / R2 / sync, or the docked/full-screen layout.
- Desktop trackpad pinch (`wheel` + `ctrlKey`) is deferred (v2 candidate per the design consult), as is fractional (sub-page) focal-point preservation on commit.
