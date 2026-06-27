## MODIFIED Requirements

### Requirement: Player can open the local source PDF at the mapped page
On a supported platform, after the player has granted a local PDF folder, the system SHALL let the player open the original source PDF for a mapped question and view that question's page, via a provenance action surfaced alongside the inline explanation. The PDF SHALL render in an in-app **docked side panel** (not a new browser tab / the host's built-in PDF viewer), opened at the mapped page. The panel SHALL: render selectable text (not image-only); allow continuous scrolling across the PDF's pages; be resizable by the player with the chosen width persisted across sessions; and be **non-modal** — while it is open the underlying app content (including a full-screen question/quiz surface it was opened from) SHALL reflow into the remaining width rather than be covered. The panel SHALL be the platform-agnostic rendering surface: the platform adapter resolves the source (file bytes / URL) per platform, while the panel renders identically across platforms, so a future desktop (Tauri) backend reuses the same panel by supplying a source URL through the same resolver contract.

#### Scenario: Open mapped question's PDF in the docked panel at its page
- **WHEN** the player activates the provenance action for a question that has a map entry and the granted folder contains the matching PDF
- **THEN** the system opens the docked panel rendering that local PDF scrolled to the mapped page
- **AND** it does NOT navigate the app away (no new tab / no full-page replacement) and shows no modal backdrop

#### Scenario: Underlying content reflows beside the open panel
- **WHEN** the docked panel is open
- **THEN** the underlying app surface (a normal page, or a full-screen quiz/exam surface the action was opened from) reflows into the width remaining to the left of the panel rather than being overlaid
- **AND** when the panel is closed the layout returns to its prior full width

#### Scenario: Select text, scroll across pages, and resize
- **WHEN** the panel is open on a multi-page PDF
- **THEN** the player can select/copy text from the rendered pages, scroll continuously from the mapped page to adjacent pages, and drag the panel's edge to resize it
- **AND** the chosen width persists to the next session

#### Scenario: Dismiss the panel
- **WHEN** the player dismisses the panel
- **THEN** the loaded source is released (no leaked object URL) and the underlying layout returns to full width

#### Scenario: Viewer fails to render the PDF
- **WHEN** the source resolves but the PDF cannot be rendered (corrupt/unreadable file)
- **THEN** the panel surfaces a non-blocking error (it MUST NOT fail silently)
- **AND** the inline explanation remains available as the fallback

#### Scenario: Mapped file missing from granted folder
- **WHEN** the player activates the provenance action but the mapped PDF filename is not found in the granted folder
- **THEN** the system surfaces a non-blocking message indicating the PDF was not found (it MUST NOT fail silently)
- **AND** the inline explanation remains available

## ADDED Requirements

### Requirement: Inline explanation defaults collapsed when the local-PDF action is available
When a question's local-PDF provenance action is available to the player (the platform supports local PDFs AND the question is mapped), the inline text explanation SHALL default to a collapsed state, since the original-layout PDF is the richer source; the player can still expand it. When the action is NOT available (unsupported platform or unmapped question), the inline explanation SHALL remain expanded by default, as it is the only source.

#### Scenario: PDF action available → inline explanation starts collapsed
- **WHEN** a question is rendered for which the local-PDF action is available
- **THEN** its inline explanation is collapsed by default
- **AND** the player can expand it manually

#### Scenario: PDF action unavailable → inline explanation stays expanded
- **WHEN** a question is rendered for which the local-PDF action is NOT available (unsupported platform or unmapped question)
- **THEN** its inline explanation is expanded by default
