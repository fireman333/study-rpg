# neurons-explanation-pdf-provenance (delta)

## ADDED Requirements

### Requirement: The PDF view SHALL support in-app zoom, driven by buttons and touch pinch, that keeps the player's place

The rendered PDF SHALL support **in-app zoom** as application state (re-rasterizing the page at the new width for crisp text — not a persistent CSS scale), clamped to a usable range whose floor is below fit-to-width (so an over-wide page can always be shrunk back) with a fit-to-width reset control. On-screen － / ＋ buttons and a ％ reset SHALL be available on all devices.

On touch devices a **two-finger pinch on the PDF surface SHALL drive this same zoom**: during the gesture the view SHALL track the fingers with a live, cheap visual preview (a compositor transform about the pinch centroid — the document is NOT re-rasterized per frame), and on release the final zoom SHALL be **committed exactly once** as a continuous value within the same clamp (not snapped to the button step ladder). The browser's native pinch behaviors (page zoom, Safari Tab Overview) SHALL be suppressed inside the panel, while **one-finger scrolling stays native** and unaffected. While a pinch is in progress the viewer's scroll-driven page-window growth and height-compensation machinery SHALL be frozen so the transient preview cannot corrupt the scroll model; the commit SHALL reuse the viewer's existing deterministic landing path (no second landing mechanism).

After the initial open has landed, ANY page-width change — a pinch commit, the ± buttons, or a panel drag-resize — SHALL re-anchor the view to the page the player is **currently looking at** (the top-visible page, tracked while scroll position and page offsets are in a consistent coordinate space), NOT back to the originally-opened question's page. A fresh open or a jump to another question SHALL still land on that question's mapped page.

#### Scenario: Pinch previews live and commits one re-raster

- **WHEN** the player pinches with two fingers on the rendered PDF
- **THEN** the view scales live about the pinch centroid during the gesture
- **AND** on release the zoom commits exactly once (one re-rasterization at the final continuous value), landing on the same content without a second landing mechanism

#### Scenario: One-finger scroll is unaffected

- **WHEN** the player scrolls the PDF with one finger
- **THEN** native scrolling (including momentum) behaves as before — no zoom occurs and the gesture handling does not interfere

#### Scenario: Zoom keeps the player's place

- **GIVEN** the player opened a question's PDF and then scrolled several pages away
- **WHEN** they change the zoom (pinch or ± buttons) or drag-resize the docked panel
- **THEN** the view re-anchors to the page currently at the top of the viewport, not back to the question's page

#### Scenario: A fresh open still lands on the question's page

- **WHEN** the player opens the PDF action for a (different) question
- **THEN** the viewer lands on that question's mapped page regardless of any prior zoom or scroll position

#### Scenario: Native pinch hijack is suppressed inside the panel

- **WHEN** the player pinches outward over the PDF panel on iOS Safari
- **THEN** the gesture zooms the PDF in-app rather than triggering the browser's native pinch behavior (e.g. Tab Overview / page zoom)
