# neurons-explanation-pdf-provenance (delta)

## MODIFIED Requirements

### Requirement: The PDF view SHALL support in-app button zoom that keeps the player's place, and SHALL leave pinch to the browser's native viewport zoom

The rendered PDF SHALL support **in-app zoom** as application state (re-rasterizing the page at the new width for crisp text — not a persistent CSS scale), clamped to a usable range whose floor is below fit-to-width (so an over-wide page can always be shrunk back) with a fit-to-width reset control, driven by on-screen － / ＋ buttons and a ％ reset available on all devices. On both the full-screen (narrow) and docked (desktop) panel, the default zoom on every open — and the ％ reset — SHALL be the panel's **layout fit-width** (zoom = 1 = the page fills the panel's width), applied predictably on every open with no manual adjustment. The app SHALL NOT read the visual viewport to compute the fit or to compensate for a residual native browser zoom: at the normal native 1× state (how a PDF is opened unless the player has deliberately pinched) the layout fit-width already fills the screen, and — because iOS Safari's native pinch scales the `position: fixed` panel (and its page) too — a render-width tweak cannot achieve a true visible-fit, it only lands the default on an unpredictable fractional zoom.

The viewer SHALL NOT implement its own two-finger pinch gesture and SHALL NOT suppress the browser's native pinch behaviors over the panel (no pinch-blocking `touch-action` on the PDF scroll surface, no `gesturestart`/`gesturechange` interception): a two-finger pinch over the PDF — as anywhere else in the app — performs the **browser's native viewport zoom**. The app SHALL NOT declare a viewport meta that disables user scaling. One-finger scrolling of the PDF stays native and unaffected. A residual native browser pinch-zoom is the player's own zoom (pinch out / double-tap to reset, as on any website); the app does not fight it. (Native viewport zoom scales the already-rasterized pixels; the ± buttons remain the crisp re-raster path.)

The render width SHALL be measured from the panel's **layout width** (the docked panel width on desktop; the full-screen overlay width on narrow), **re-measured whenever the panel opens** — not only when the breakpoint changes — so a fresh mobile open never falls back to a stale docked default width, and **clamped to the physical screen width** (`screen.width`, orientation-aware) so the rendered page can never exceed the visible screen even if the layout viewport is inflated. It SHALL NOT read the visual viewport at all — neither via listeners (`visualViewport.resize` / any continuous signal) nor as a one-shot fit input (the `screen.width` clamp is a physical-screen bound, stable under native pinch, and is NOT the visual viewport): a native pinch, which by definition shrinks the visual viewport, SHALL NOT re-rasterize, reflow, or re-anchor the document during or after the gesture (the zoom is purely the browser compositor scaling the existing raster). Panel open, rotation, split-view, and the panel drag-resize are the render-width-change triggers, all layout-derived and screen-clamped.

After the initial open has landed, ANY page-width change — the ± buttons or a panel drag-resize — SHALL re-anchor the view to the page the player is **currently looking at** (the top-visible page, tracked while scroll position and page offsets are in a consistent coordinate space), NOT back to the originally-opened question's page. A fresh open or a jump to another question SHALL still land on that question's mapped page.

#### Scenario: Pinch performs the browser's native zoom

- **WHEN** the player pinches with two fingers over the open PDF panel on a touch device
- **THEN** the browser's native viewport zoom occurs (the viewer does not intercept or suppress the gesture)

#### Scenario: Pinch does not re-rasterize the document

- **WHEN** the player pinch-zooms over the open PDF panel on a phone
- **THEN** the rendered page width and the mounted page window stay unchanged — no re-rasterization, reflow, or scroll re-anchor occurs during or after the gesture
- **AND** only the browser's compositor scales the already-rendered raster

#### Scenario: Default and reset are a predictable layout fit-width

- **WHEN** a player opens a PDF (or taps the ％ reset) at the normal native 1× zoom
- **THEN** the page renders at the panel's layout fit-width (100% = the page fills the panel width) with no manual adjustment, on every open
- **AND** the app performs no visual-viewport read to alter that fit

#### Scenario: Fresh mobile open fits the screen width

- **GIVEN** a fresh mobile session (no persisted panel width) opening the full-screen PDF panel
- **WHEN** the panel opens
- **THEN** the render width is measured from the opened panel body and clamped to the physical screen width, so the page fits within the visible screen (no right-edge clipping)
- **AND** it SHALL NOT render at the docked default width

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
