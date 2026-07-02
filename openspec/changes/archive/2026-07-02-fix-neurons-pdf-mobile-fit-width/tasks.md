# Tasks — Fix mobile PDF fit-width (measure on open + clamp to physical screen)

## 1. Implementation (`PdfPanelHost.tsx` only)

- [x] 1.1 Add `screenCssWidth()` helper: orientation-aware `screen.width` in CSS px (Infinity when unavailable → clamp no-op). Not a `visualViewport`/`innerWidth` substitute — used ONLY as an upper clamp.
- [x] 1.2 Width-measure effect: add `open` to deps + early-return while closed, so it re-runs and measures the real `bodyRef` (and attaches the ResizeObserver) when the panel opens; set `renderWidth = min(bodyRect, screenCssWidth())`.
- [x] 1.3 Seed the narrow `useState` from `min(width, screenCssWidth())` so the first pre-measure paint isn't the docked 520 default.

## 2. Verification

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; vitest 778/778 green.
- [x] 2.2 Localhost 375px measurement (served test PDF via the DEV `__pdfPanel` handle): rendered canvas = 342 CSS px inside the 375 viewport (overflowRightPx −17, no clip); `documentElement.scrollWidth === clientWidth === 375` (no app horizontal overflow); zero console errors.
- [ ] 2.3 Owner real-device confirm (iPhone, prod): open a 詳解 PDF on a fresh session → the page fits the screen width at 100% with no right-edge clipping and no manual adjustment.
