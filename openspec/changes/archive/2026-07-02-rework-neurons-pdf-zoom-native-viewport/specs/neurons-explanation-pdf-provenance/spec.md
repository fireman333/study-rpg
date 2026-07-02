# neurons-explanation-pdf-provenance (delta)

## REMOVED Requirements

### Requirement: The PDF view SHALL support in-app zoom, driven by buttons and touch pinch, that keeps the player's place

**Reason**: The custom in-viewer pinch gesture (live transform preview → single re-raster commit) failed the owner's same-day real-device test, and intercepting the gesture required suppressing the browser's native pinch over the panel — making the (full-screen on phones) PDF panel read as un-zoomable. Replaced by the native-viewport-zoom requirement below; the button-zoom and keep-your-place clauses carry over into it unchanged.

## ADDED Requirements

### Requirement: The PDF view SHALL support in-app button zoom that keeps the player's place, and SHALL leave pinch to the browser's native viewport zoom

The rendered PDF SHALL support **in-app zoom** as application state (re-rasterizing the page at the new width for crisp text — not a persistent CSS scale), clamped to a usable range whose floor is below fit-to-width (so an over-wide page can always be shrunk back) with a fit-to-width reset control, driven by on-screen － / ＋ buttons and a ％ reset available on all devices.

The viewer SHALL NOT implement its own two-finger pinch gesture and SHALL NOT suppress the browser's native pinch behaviors over the panel (no pinch-blocking `touch-action` on the PDF scroll surface, no `gesturestart`/`gesturechange` interception): a two-finger pinch over the PDF — as anywhere else in the app — performs the **browser's native viewport zoom**. The app SHALL NOT declare a viewport meta that disables user scaling. One-finger scrolling of the PDF stays native and unaffected. (Native viewport zoom scales the already-rasterized pixels; the ± buttons remain the crisp re-raster path.)

After the initial open has landed, ANY page-width change — the ± buttons or a panel drag-resize — SHALL re-anchor the view to the page the player is **currently looking at** (the top-visible page, tracked while scroll position and page offsets are in a consistent coordinate space), NOT back to the originally-opened question's page. A fresh open or a jump to another question SHALL still land on that question's mapped page.

#### Scenario: Pinch performs the browser's native zoom

- **WHEN** the player pinches with two fingers over the open PDF panel on a touch device
- **THEN** the browser's native viewport zoom occurs (the viewer does not intercept or suppress the gesture)

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
