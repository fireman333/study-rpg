# neurons-explanation-pdf-provenance (delta)

## MODIFIED Requirements

### Requirement: The PDF view SHALL support in-app button zoom that keeps the player's place, and SHALL leave pinch to the browser's native viewport zoom

The rendered PDF SHALL support **in-app zoom** as application state (re-rasterizing the page at the new width for crisp text — not a persistent CSS scale), clamped to a usable range whose floor is below fit-to-width (so an over-wide page can always be shrunk back) with a fit-to-width reset control, driven by on-screen － / ＋ buttons and a ％ reset available on all devices. On the full-screen (narrow) panel, the fit reset — and the initial zoom when the panel opens — SHALL fit the width the player can actually **see**: when a residual native browser zoom exists (visual-viewport scale > 1), the fit SHALL derive from a **one-shot** visual-viewport read, so the 100% page cannot overflow the visible screen; the docked (desktop) panel fits its layout width.

The viewer SHALL NOT implement its own two-finger pinch gesture and SHALL NOT suppress the browser's native pinch behaviors over the panel (no pinch-blocking `touch-action` on the PDF scroll surface, no `gesturestart`/`gesturechange` interception): a two-finger pinch over the PDF — as anywhere else in the app — performs the **browser's native viewport zoom**. The app SHALL NOT declare a viewport meta that disables user scaling. One-finger scrolling of the PDF stays native and unaffected. (Native viewport zoom scales the already-rasterized pixels; the ± buttons remain the crisp re-raster path.)

The render width SHALL NOT be driven by visual-viewport **listeners** (`visualViewport.resize` or any continuous visual-viewport signal): a native pinch, which by definition shrinks the visual viewport, SHALL NOT re-rasterize, reflow, or re-anchor the document during or after the gesture (the zoom is purely the browser compositor scaling the existing raster). One-shot visual-viewport reads at explicit user actions (panel open, fit-reset press) are permitted for the fit computation. Rotation, split-view, and the panel drag-resize remain the only continuous render-width-change triggers, all layout-viewport-derived.

After the initial open has landed, ANY page-width change — the ± buttons or a panel drag-resize — SHALL re-anchor the view to the page the player is **currently looking at** (the top-visible page, tracked while scroll position and page offsets are in a consistent coordinate space), NOT back to the originally-opened question's page. A fresh open or a jump to another question SHALL still land on that question's mapped page.

#### Scenario: Pinch performs the browser's native zoom

- **WHEN** the player pinches with two fingers over the open PDF panel on a touch device
- **THEN** the browser's native viewport zoom occurs (the viewer does not intercept or suppress the gesture)

#### Scenario: Pinch does not re-rasterize the document

- **WHEN** the player pinch-zooms over the open PDF panel on a phone
- **THEN** the rendered page width and the mounted page window stay unchanged — no re-rasterization, reflow, or scroll re-anchor occurs during or after the gesture
- **AND** only the browser's compositor scales the already-rendered raster

#### Scenario: Reset fits the visible width under residual browser zoom

- **GIVEN** a phone player who pinch-zoomed in over the full-screen panel (visual-viewport scale > 1) and did not return exactly to 1×
- **WHEN** they tap the ％ fit reset, or close and reopen the PDF panel
- **THEN** the page renders fitting the width they can actually see (a one-shot visual-viewport read), instead of a layout-width page overflowing the screen
- **AND** with no residual zoom (scale ≈ 1), the fit is the plain layout fit-width (100%)

#### Scenario: Button zoom re-rasterizes crisply

- **WHEN** the player taps ＋ / － or the ％ reset
- **THEN** the page re-rasterizes at the new width (crisp text, not a scaled bitmap), within the clamped zoom range

#### Scenario: Zoom keeps the player's place

- **GIVEN** the player opened a question's PDF and then scrolled several pages away
- **WHEN** they change the zoom with the ± buttons or drag-resize the docked panel
- **THEN** the view re-anchors to the page currently at the top of the viewport, not back to the question's page

#### Scenario: A fresh open still lands on the question's page

- **WHEN** the player opens the PDF action for a (different) question
- **THEN** the viewer lands on that question's mapped page regardless of any prior zoom or scroll position

## ADDED Requirements

### Requirement: PDF canvas memory SHALL stay bounded on touch devices

On coarse-pointer (touch) devices the viewer SHALL bound its rendering memory so extended reading sessions and repeated open/close cycles do not exhaust the browser tab (iOS Safari's canvas-memory jetsam crash-reloads the page): the simultaneously-mounted page window SHALL be tighter than the desktop window, and each page canvas's bitmap resolution SHALL be capped to a fixed device-pixel width budget so high button-zoom cannot grow per-page canvas memory without bound. Fit-width rendering SHALL keep the device's full native pixel ratio (the resolution cap engages only above it). Unmounted pages SHALL keep their measured sized placeholders so re-mounting on reverse scroll stays seamless (no reflow or scroll compensation), preserving the existing virtualization contract. Desktop bounds are unchanged.

#### Scenario: Long mobile reading session stays within the tightened bounds

- **WHEN** a phone player scrolls through many booklet pages and repeatedly opens and closes the panel
- **THEN** the number of simultaneously-mounted page canvases stays within the tightened touch-device window, and each canvas within the device-pixel width cap
- **AND** the tab survives (no memory crash-reload)

#### Scenario: Fit-width crispness is not reduced by the cap

- **WHEN** a phone player reads at fit-width (100%)
- **THEN** the page canvas renders at the device's full native pixel ratio (the cap only engages at high button-zoom page widths)
