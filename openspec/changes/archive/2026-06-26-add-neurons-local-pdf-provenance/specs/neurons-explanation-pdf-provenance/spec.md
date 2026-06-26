## ADDED Requirements

### Requirement: Provenance map is generated as a build artifact from manifest
The system SHALL provide a build-time builder that derives a question-to-PDF-page map from the committed `explanation-figures/manifest.json` provenance, producing `{ questionId: { file, page } }` for every question that has figure/table provenance. The builder SHALL be deterministic, SHALL take the minimum page when a question's figures span multiple pages, and SHALL write its output to a gitignored `public/` path that is regenerated on every build and deploy (never hand-committed).

#### Scenario: Map covers every provenance-bearing question
- **WHEN** the builder runs against the current `manifest.json`
- **THEN** the output map contains a `{ file, page }` entry for every questionId present in the manifest with a `sourcePdf` + `page`
- **AND** each `file` equals the manifest's `sourcePdf` string verbatim (the real on-disk filename)

#### Scenario: Multi-page figures collapse to the first page
- **WHEN** a question's figures reference more than one page in the manifest
- **THEN** the map entry's `page` is the minimum of those pages

#### Scenario: Map output is a regenerated build artifact
- **WHEN** the content build chain (`prebuild` / `predev`) runs
- **THEN** the map is (re)written to the gitignored `public/provenance/` path
- **AND** no `public/` map JSON is tracked in git

### Requirement: Player can open the local source PDF at the mapped page
On a supported platform, after the player has granted a local PDF folder, the system SHALL let the player open the original source PDF for a mapped question and navigate it to that question's page, via a provenance action surfaced alongside the inline explanation.

#### Scenario: Open mapped question's PDF at its page
- **WHEN** the player activates the provenance action for a question that has a map entry and the granted folder contains the matching PDF
- **THEN** the system opens that local PDF positioned at the mapped page

#### Scenario: Mapped file missing from granted folder
- **WHEN** the player activates the provenance action but the mapped PDF filename is not found in the granted folder
- **THEN** the system surfaces a non-blocking message indicating the PDF was not found (it MUST NOT fail silently)
- **AND** the inline explanation remains available

### Requirement: Folder grant persists across sessions
The web implementation SHALL let the player grant a read-only local folder once and SHALL persist the directory handle in a device-local IndexedDB store (separate from the cloud-synced Dexie tables) so the grant survives across sessions, re-requesting the permission gesture when the browser requires it. The persisted handle SHALL NOT be uploaded to cloud sync.

#### Scenario: Grant survives a reload
- **WHEN** the player has granted a folder in a prior session and reopens the app
- **THEN** the system reuses the persisted handle (after any required permission re-prompt) without forcing a fresh folder pick

#### Scenario: Handle stays device-local
- **WHEN** a folder handle is persisted
- **THEN** it is stored only in the local `meta` store and is excluded from any R2 / cloud-sync bundle

### Requirement: Graceful degradation on unsupported context
Where the platform lacks local-file capability (e.g. Safari, mobile, no File System Access API), or no folder is granted, or the question has no map entry, the system SHALL hide the provenance action and SHALL fall back to the existing inline explanation without surfacing an error that disrupts the quiz flow.

#### Scenario: Unsupported platform hides the action
- **WHEN** the running platform cannot open local files
- **THEN** the provenance action is not shown
- **AND** the inline explanation renders unchanged

#### Scenario: Unmapped question hides the action
- **WHEN** a question has no entry in the provenance map
- **THEN** the provenance action is not shown for that question

### Requirement: App distributes zero copyrighted PDF bytes
The system SHALL NOT bundle, host, download, or transmit any source PDF bytes. The local-PDF feature SHALL operate solely by referencing files the player already has in their own granted local folder.

#### Scenario: No PDF shipped in the app
- **WHEN** the app is built and deployed
- **THEN** no source exam-explanation PDF file is included in the bundle, the repository, or any hosted asset path

### Requirement: CJK filename matching normalizes Unicode form
Because source PDF filenames are Chinese and macOS may store them in NFD while the map stores NFC, the file lookup SHALL enumerate the granted folder's actual entries and compare names with both sides normalized to NFC, rather than relying on an exact-name handle lookup.

#### Scenario: NFD on-disk name matches NFC map name
- **WHEN** the granted folder holds a PDF whose on-disk name is in NFD form and the map entry's `file` is the NFC form of the same name
- **THEN** the lookup matches them and opens the file
