## Why

`add-neurons-pdf-pinch-zoom` (archived earlier today) implemented an in-viewer custom pinch gesture (live transform preview → single re-raster commit). The owner's real-device test the same day found it still unsatisfactory, and the custom interception had a second cost: to run its own gesture it had to suppress the browser's native pinch over the panel (`touch-action: pan-x pan-y` + `gesturestart` preventDefault) — so pinch inside the (on phones, full-screen) PDF panel did nothing useful, and the app read as "un-zoomable".

Investigation showed the app's viewport meta is `width=device-width, initial-scale=1.0` — native user scaling was **never** disabled app-wide; the ONLY things blocking native pinch were our own interceptions (the new pinch code on the PDF scroller; `touch-action: none` elsewhere exists only on the maze canvas, which legitimately owns its camera pinch, and the 8px panel drag-handle). The owner's decision: don't fight the browser — remove the custom gesture and let **native viewport zoom** handle pinch everywhere, PDF included. This also gives the rest of the app (dense question pages) pinch-zoom for free.

## What Changes

- **Remove the in-viewer pinch gesture entirely** (`PdfDocumentView.tsx`): the touch listeners, the live transform preview, the `gesturestart`/`gesturechange` suppression, the `pinchingRef` freezes, and the `touch-action: pan-x pan-y` restriction on the scroller. Two-finger pinch over the PDF is now the browser's native viewport zoom (raster scale — standard web behavior).
- **Keep** the ± / ％ button zoom (app-state, crisp re-raster) and the keep-your-place re-pin shipped with the pinch change (`topPageRef` / `landedRef` / `topVisiblePage` — buttons and drag-resize re-anchor to the current top-visible page; a fresh open still lands on the question's page). That part was a genuine ± button bug fix and is independent of the gesture.
- **Spec**: the pinch requirement added this morning is REPLACED (REMOVED + ADDED) by a native-viewport-zoom contract: the viewer SHALL NOT intercept two-finger pinch or suppress native pinch behaviors; button zoom + keep-your-place semantics carry over unchanged.
- Supersedes the un-completed §2.3 owner device-verify task of `2026-07-02-add-neurons-pdf-pinch-zoom` (that gesture no longer exists to verify).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: the "in-app zoom, driven by buttons and touch pinch" requirement is replaced by "in-app button zoom + native browser pinch" (REMOVED + ADDED).

## Impact

- `apps/neurons-tw/src/components/PdfDocumentView.tsx` only — net deletion (~70 lines of gesture code + 3 now-dead refs/helpers removed); comments updated to record the reverted experiment so it is not retried blindly.
- No change to `index.html` viewport meta (already permissive), the panel host, maze pinch (`touch-action:none` on its canvas stays — it owns its camera), Dexie / R2 / sync.
- Trade-offs accepted by the owner: native pinch zoom scales the raster (slight blur at high zoom — the ± buttons remain the crisp path), and on iPad a pinch-in at 1× still triggers Safari's Tab Overview (OS behavior, standard on every website).
