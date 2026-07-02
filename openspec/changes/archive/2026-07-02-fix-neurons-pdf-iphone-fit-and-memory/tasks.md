# Tasks — iPhone PDF: fit-to-visible 100% + touch-device canvas memory bounds

## 1. Implementation (`PdfDocumentView.tsx` only)

- [x] 1.1 `visualFitZoom()`: one-shot `visualViewport.width`/`.scale` read, gated on full-screen panel (`width ≈ documentElement.clientWidth`) AND residual zoom (`scale > 1.01`); clamps to `[MIN_ZOOM, 1]`, rounds to 0.05. Wired as the `useState` lazy initializer (panel open) and the ％ reset handler. NO visualViewport listener (comment records why).
- [x] 1.2 `IS_COARSE` (`pointer: coarse`, matchMedia-guarded for jsdom): `WINDOW_BELOW` 6 → 4 and `MAX_WINDOW` 16 → 8 on touch devices; desktop unchanged.
- [x] 1.3 `<Page devicePixelRatio>` capped on touch devices at `min(DPR, 2048 / pageWidth)` (floor 1) — bounds per-page canvas bitmaps at high button-zoom; fit-width renders at full native DPR.

## 2. Verification

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; vitest 778/778 green.
- [x] 2.2 Localhost /bank boot smoke: renders, PDF buttons present, zero console errors.
- [ ] 2.3 Owner real-device re-test (iPhone, prod): (a) pinch in → tap ％ → page fits the zoomed viewport (no more「100% 太大超出頁面」); (b) reopen the panel while still pinch-zoomed → opens fitting the visible width; (c) extended reading + several open/close cycles → no crash-reload; (d) desktop docked ％ still means plain fit-width.
