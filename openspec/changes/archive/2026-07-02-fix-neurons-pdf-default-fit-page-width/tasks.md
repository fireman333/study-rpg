# Tasks — PDF default = plain layout fit-page-width on every open (drop visualViewport compensation)

## 1. Implementation (`PdfDocumentView.tsx` only)

- [x] 1.1 Remove `visualFitZoom`; default `useState(1)` and `zoomFit` → `setZoom(1)`. Comment records the iOS mechanic (native zoom scales the fixed panel too, so render-width compensation can't fit the visible width — it only makes the default unpredictable) so it is not reintroduced.
- [x] 1.2 Leave the touch-device memory bounds (`IS_COARSE` window + `devicePixelRatio` canvas cap) and the layout-width render measure intact.

## 2. Verification

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; vitest 778/778 green; no `visualFitZoom` / `visualViewport` refs remain in `PdfDocumentView.tsx`.
- [x] 2.2 Prod bundle marker after deploy: the PDF chunk `visualViewport` count SHALL be 0 (was 1).
- [ ] 2.3 Owner real-device re-test (iPhone, prod): open a 詳解 PDF at the normal (un-pinched) state → the page fills the screen width immediately, no manual adjustment; ± buttons still zoom crisply; if the browser is residually pinch-zoomed, pinch/double-tap out resets it (native).
