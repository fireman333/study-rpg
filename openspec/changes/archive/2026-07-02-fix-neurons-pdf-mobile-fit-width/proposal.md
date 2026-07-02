## Why

The owner's iPhone screenshot: the PDF opens at "100%" but renders **wider than the screen** — the page is centered with a small left margin and its right edge is clipped off. Not residual pinch (status bar is native scale); a genuinely over-wide render at fit-width.

Root cause (confirmed by reading the code + a Codex consult + a localhost 375px measurement): `PdfPanelHost` is mounted once at app root and returns `null` while closed, so `bodyRef` is `null` at that first mount. The width-measure `useLayoutEffect` was gated on `[narrow]` only, so it ran once at the closed mount (measuring nothing, `w>0` guard skips, no `ResizeObserver` attached) and **never re-ran when the panel actually opened**. `renderWidth` therefore stayed at its `useState` seed = the docked default `DEFAULT_W = 520`. On a fresh mobile session (no persisted panel width) the page rendered at `520 − 32 = 488` px on a ~390 px screen → ~20% clipped.

This was introduced earlier today by `fix-neurons-pdf-pinch-width-churn`, which switched the narrow width source from `visualViewport.width` (a DOM-*independent* read that worked even at the closed mount) to `bodyRef.getBoundingClientRect()` (DOM-*dependent*) — correct for stopping the pinch/crash loop, but it exposed the never-re-measured latency. Codex's alternative hypothesis (100vw / layout-viewport inflation from app horizontal overflow) was ruled out on device: `documentElement.scrollWidth === clientWidth === 375`, no overflow.

## What Changes

`PdfPanelHost.tsx` only:

- **Measure when the panel OPENS**: add `open` to the width-effect deps so it re-runs once the body is in the DOM — measuring the real panel body and attaching the `ResizeObserver` then (the effect early-returns while closed).
- **Clamp to the physical screen**: `renderWidth = min(bodyRect, orientation-aware screen.width)`. `screen.width` is stable under native pinch and not inflated by any layout-viewport expansion — pure belt-and-braces for the (ruled-out-here but cheap to defend) 100vw-inflation case. Still NO `visualViewport` / `innerWidth` read (the banned pinch-tracking sources).
- **Seed the narrow `useState`** from the same `min(width, screen.width)` clamp so even the first pre-measure paint is never the 520 default.

Verified at a 375px viewport with a served test PDF: rendered page canvas = 342 CSS px, sits inside the 375 viewport (−17px, no clip); pre-fix it was the 488px overflow.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: MODIFIED the button-zoom/native-pinch requirement's render-width clause — the fit width is measured from the panel's layout width **when the panel opens** and **clamped to the physical screen width**, so the page never exceeds the visible screen on a fresh mobile open; still no visual-viewport read.

## Impact

- `apps/neurons-tw/src/components/PdfPanelHost.tsx` only (new `screenCssWidth()` helper; effect deps `[narrow]` → `[narrow, open]` + open-guard + screen clamp; seeded `useState`). No schema / sync / content change; `PdfDocumentView` untouched.
- Typecheck clean; 778/778 vitest green; localhost 375px measurement confirms no overflow + no app horizontal overflow.
