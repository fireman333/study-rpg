# Tasks — PDF viewer pinch-to-zoom (phone / tablet)

## 1. Implementation (`PdfDocumentView.tsx` only)

- [x] 1.1 Pinch gesture effect: two-finger `touchstart/move/end/cancel` on the scroll container (`{passive:false}`, `preventDefault` only at 2 touches) + suppress WebKit `gesturestart`/`gesturechange` (the actual Safari Tab-Overview blocker); handlers read refs only → mount-stable `[]` deps. `touchAction: 'pan-x pan-y'` on the scroller keeps one-finger scroll native.
- [x] 1.2 Live preview: imperative `transform: scale()` on the `<Document>` wrapper (compositor-only, zero React state), `transform-origin` at the pinch centroid in content space (`scrollTop + centroidY`), `willChange` hinted for the gesture's duration.
- [x] 1.3 Single commit on release: final zoom = continuous, rounded to 0.05, clamped to MIN_ZOOM 0.5 / MAX_ZOOM 2.5; transform cleared, then ONE `setZoom` → the existing width-repin → settle landing runs exactly once. No per-frame re-raster, no snapping to the 0.25 button ladder (would jump away from the fingers).
- [x] 1.4 Freeze the scroll machinery during the gesture: `pinchingRef` early-returns `onScroll` window growth and gates the ResizeObserver overflow-anchor compensation (sibling of `openingRef`); pinch start is ignored while an open-landing is settling.
- [x] 1.5 Keep-your-place re-pin: `topPageRef` tracks the top-visible page in `onScroll` (consistent scrollTop/page-offset space — NOT derived after the width change, which would mix old scrollTop with new offsets); the settle loop seeds it on landing; the width-repin effect anchors post-landing zoom/resize to it, while `landedRef` keeps a fresh open / question jump landing on `initialPage`.

## 2. Verification

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; full vitest suite 770/770 green.
- [x] 2.2 Localhost boot smoke: /bank renders, PDF entry points intact, zero console errors. (Pinch itself is not reproducible on desktop localhost — no touch input, and the PDF source needs prod Drive referrer / an FSA folder pick.)
- [ ] 2.3 Owner real-device smoke (iPhone/iPad Safari, prod after deploy): open 看原始詳解 PDF → two-finger pinch zooms with live preview and lands crisply on release at the same page; one-finger scroll unaffected; ± buttons no longer snap back to the question's page after scrolling away; Safari Tab Overview does not trigger on pinch-out inside the panel.
