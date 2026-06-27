## MODIFIED Requirements

### Requirement: Player can open the local source PDF at the mapped page
On a supported platform, after the player has granted a local PDF folder, the system SHALL let the player open the original source PDF for a mapped question and view that question's page, via a provenance action surfaced alongside the inline explanation. The PDF SHALL be rendered in an **in-app viewer** (not delegated to a new browser tab / the host's built-in PDF viewer), opened at the mapped page, with at minimum page-to-page navigation and a way to dismiss it. The viewer SHALL be the platform-agnostic rendering surface: the platform adapter resolves the source (file bytes / URL) per platform, while the viewer renders identically across platforms, so a future desktop (Tauri) backend reuses the same viewer by supplying a source URL through the same resolver contract.

#### Scenario: Open mapped question's PDF at its page in the in-app viewer
- **WHEN** the player activates the provenance action for a question that has a map entry and the granted folder contains the matching PDF
- **THEN** the system renders that local PDF in the in-app viewer positioned at the mapped page
- **AND** it does NOT navigate the app away (no new tab / no full-page replacement)

#### Scenario: Navigate and dismiss the viewer
- **WHEN** the in-app viewer is open on a question's mapped page
- **THEN** the player can move to adjacent pages of that PDF and dismiss the viewer
- **AND** dismissing it releases the loaded source (no leaked object URL) and returns the player to where they were

#### Scenario: Viewer fails to render the PDF
- **WHEN** the source resolves but the PDF cannot be rendered (corrupt/unreadable file)
- **THEN** the viewer surfaces a non-blocking error (it MUST NOT fail silently)
- **AND** the inline explanation remains available as the fallback

#### Scenario: Mapped file missing from granted folder
- **WHEN** the player activates the provenance action but the mapped PDF filename is not found in the granted folder
- **THEN** the system surfaces a non-blocking message indicating the PDF was not found (it MUST NOT fail silently)
- **AND** the inline explanation remains available
