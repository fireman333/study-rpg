# neurons-explanation-pdf-provenance (delta)

## MODIFIED Requirements

### Requirement: The PDF view SHALL support in-app button zoom that keeps the player's place, and SHALL leave pinch to the browser's native viewport zoom

The rendered PDF SHALL support **in-app zoom** as application state (re-rasterizing the page at the new width for crisp text — not a persistent CSS scale), clamped to a usable range whose floor is below fit-to-width (so an over-wide page can always be shrunk back) with a fit-to-width reset control, driven by on-screen － / ＋ buttons and a ％ reset available on all devices.

The viewer SHALL NOT implement its own two-finger pinch gesture and SHALL NOT suppress the browser's native pinch behaviors over the panel (no pinch-blocking `touch-action` on the PDF scroll surface, no `gesturestart`/`gesturechange` interception): a two-finger pinch over the PDF — as anywhere else in the app — performs the **browser's native viewport zoom**. The app SHALL NOT declare a viewport meta that disables user scaling. One-finger scrolling of the PDF stays native and unaffected. (Native viewport zoom scales the already-rasterized pixels; the ± buttons remain the crisp re-raster path.)

The render width fed to the rasterizer SHALL derive from **layout-viewport measures** (the panel body's layout size) — never from the visual viewport (`visualViewport.width` or iOS's visual-viewport-tracking `innerWidth`) — so that a native pinch, which by definition shrinks the visual viewport, cannot feed back into the document: pinching SHALL NOT re-rasterize, reflow, or re-anchor the document during or after the gesture (the zoom is purely the browser compositor scaling the existing raster). Rotation, split-view, and the panel drag-resize remain the only render-width-change triggers.

After the initial open has landed, ANY page-width change — the ± buttons or a panel drag-resize — SHALL re-anchor the view to the page the player is **currently looking at** (the top-visible page, tracked while scroll position and page offsets are in a consistent coordinate space), NOT back to the originally-opened question's page. A fresh open or a jump to another question SHALL still land on that question's mapped page.

#### Scenario: Pinch performs the browser's native zoom

- **WHEN** the player pinches with two fingers over the open PDF panel on a touch device
- **THEN** the browser's native viewport zoom occurs (the viewer does not intercept or suppress the gesture)

#### Scenario: Pinch does not re-rasterize the document

- **WHEN** the player pinch-zooms over the open PDF panel on a phone
- **THEN** the rendered page width and the mounted page window stay unchanged — no re-rasterization, reflow, or scroll re-anchor occurs during or after the gesture
- **AND** only the browser's compositor scales the already-rendered raster

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
