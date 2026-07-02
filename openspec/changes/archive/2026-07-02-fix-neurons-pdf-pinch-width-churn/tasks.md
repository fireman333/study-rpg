# Tasks — Fix pinch → visualViewport → re-raster feedback loop (flicker + iOS tab crash)

## 1. Implementation (`PdfPanelHost.tsx` only)

- [x] 1.1 Unify the render-width measure to the panel body's LAYOUT rect in both modes (was: `visualViewport.width ?? innerWidth` on narrow); drop the `visualViewport.resize` listener. Keep the ResizeObserver on the body + `orientationchange` + the 150ms debounce. Comment records the loop (pinch → visual-viewport resize → mid-pinch re-raster → canvas churn → iOS jetsam) so the visual-viewport measure is not reintroduced.

## 2. Verification

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; full vitest suite 770/770 green (no test pinned the visual-viewport behavior — checked).
- [x] 2.2 Localhost boot smoke via dev server: HMR applied, zero console errors.
- [x] 2.3 Prod bundle marker: pre-fix main bundle has 3 `visualViewport` hits (the PdfPanelHost measure + add/removeEventListener); post-deploy bundle SHALL have 0.
- [ ] 2.4 Owner real-device re-test (iPhone, prod): open 詳解 PDF → native pinch zooms smoothly with NO page flicker and NO re-raster "fighting"; repeated open + pinch cycles no longer crash-reload the tab; rotation still re-fits the page width.
