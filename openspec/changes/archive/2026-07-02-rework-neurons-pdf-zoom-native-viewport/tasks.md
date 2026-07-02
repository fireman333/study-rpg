# Tasks — PDF zoom: drop the custom pinch, defer to native viewport zoom

## 1. Implementation (`PdfDocumentView.tsx` only)

- [x] 1.1 Delete the pinch gesture effect (touch listeners, live transform preview, `gesturestart`/`gesturechange` suppression) and its now-dead helpers/refs (`pinchingRef`, `zoomRef`, `clampNum`); restore the plain `openingRef`-only gates in `onScroll` + the ResizeObserver compensation.
- [x] 1.2 Remove `touchAction: 'pan-x pan-y'` from the scroller so native viewport pinch works over the PDF; comment records the reverted same-day experiment (blocked page zoom + real-device feel was off) so it is not retried blindly.
- [x] 1.3 Keep the ± / ％ button zoom and the keep-your-place re-pin (`topPageRef` / `landedRef` / `topVisiblePage`) intact; update the zoom-state comment to the new policy (buttons = crisp re-raster; pinch = browser native).

## 2. Verification

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; full vitest suite 770/770 green; zero references to the removed pinch code remain (grep).
- [x] 2.2 Localhost boot smoke via dev server: HMR applied, zero console errors.
- [ ] 2.3 Owner real-device smoke (iPhone/iPad, prod after deploy): two-finger pinch over the open PDF panel performs the browser's native page zoom (and works on regular app pages too); one-finger scroll unaffected; ± buttons still re-raster crisply and stay on the current page.
