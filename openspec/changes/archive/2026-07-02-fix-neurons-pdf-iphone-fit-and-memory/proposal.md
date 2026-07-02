## Why

After `fix-neurons-pdf-pinch-width-churn`, the owner's iPhone re-test confirmed the pinch flicker is gone but reported two remaining problems:

1. **The tab still crash-reloads after some use.** With the churn eliminated, this is steady-state memory pressure, not a feedback loop: an iPhone (DPR 3) fit-width page canvas is ~6.5 MB; up to 16 simultaneously-mounted pages ≈ 105 MB, stacked on top of the homepage maze bake (~tens of MB, still mounted under the portal panel) and the pdf.js worker heap — enough to cross iOS Safari's canvas/tab memory limits over repeated open+read cycles. Button-zoom multiplies it (a 2.5× page at DPR 3 is ~41 MB per canvas).
2. **「100% 太大超出頁面」.** Native pinch leaves a *residual* browser zoom: after pinching in, `visualViewport.scale > 1` and the visible width is narrower than the layout width — so a page fit to the layout width (= 100%) overflows what the player can actually see, and getting back requires pinching out to exactly 1×.

## What Changes

Both in `PdfDocumentView.tsx`:

- **Fit-to-VISIBLE zoom**: on the full-screen (narrow) panel, the initial zoom at open and the ％ reset now fit the width the player can actually see — a **one-shot** `visualViewport` read (`width`/`scale`), applied only when a residual zoom exists (`scale > 1.01`) and the panel is viewport-wide. Never a `visualViewport` listener — that feedback loop was the previous crash (`fix-neurons-pdf-pinch-width-churn`); one-shot reads at discrete user actions cannot loop. Desktop docked and the at-rest case keep plain `1` (behavior unchanged).
- **Touch-device memory bounds** (`pointer: coarse` only; desktop unchanged):
  - Mounted-page window tightened: `WINDOW_BELOW` 6 → 4, `MAX_WINDOW` 16 → 8 (halves worst-case canvas RAM; unmounted pages keep sized placeholders, so re-mounting on reverse scroll stays seamless per the existing design).
  - Per-page canvas bitmap width capped at 2048 device px via react-pdf's `devicePixelRatio` prop (floor 1). Fit-width is untouched (358 CSS × DPR 3 ≈ 1074 ≪ cap) — the cap only engages at roughly ≥ 1.9× button zoom, trading a little high-zoom sharpness for not crashing.

**Contingency**: if the crash-reload still reproduces after this, the next evidenced steps are pausing/unmounting the maze canvas while the panel is open, dropping the mobile window further, or disabling the text layer on phones — each gets its own change.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: MODIFIED the button-zoom/native-pinch requirement — the fit control fits the *visible* width under residual browser zoom via one-shot reads (the render-width clause is restated to forbid visual-viewport *listeners* rather than every read); ADDED a touch-device canvas-memory-bounds requirement.

## Impact

- `apps/neurons-tw/src/components/PdfDocumentView.tsx` only. No schema / sync / content change; `PdfPanelHost` untouched.
- Typecheck clean; 778/778 vitest green; localhost /bank boot smoke zero console errors (pinch/memory behavior itself needs the owner's real device).
