# neurons-explanation-pdf-provenance Specification

## Purpose

The contract for the local-PDF provenance feature: on a supported platform, a player can open their OWN locally-held original 陽明 explanation PDF at the exact page a question's 詳解 came from, giving a "textbook-grade original layout" source without the app distributing any copyrighted bytes. Covers the build-time question→{file, page} map (derived from the existing `explanation-figures` manifest, regenerated as a gitignored build artifact), the platform adapter (Phase 1 = File System Access API; a Tauri desktop backend is a deferred Phase 2 behind the same surface), device-local persistence of the granted folder handle (separate from cloud-synced storage), graceful degradation on unsupported platforms / unmapped questions, the zero-copyrighted-bytes guarantee, and CJK-safe (NFC) filename matching. The inline 詳解 (text + cropped figures/tables) is unchanged and remains the fallback; this is an additive entry point. Created by archiving change `add-neurons-local-pdf-provenance`.
## Requirements
### Requirement: Provenance map is generated as a build artifact from manifest
The system SHALL provide a build-time builder that derives a question-to-PDF-page map `{ questionId: { file, page } }` from five committed sources, in increasing override priority: (1) the `explanation-figures/manifest.json` figure provenance (bbox-precise), (2) a committed `provenance/question-page-map.json` of text-question pages produced by the base deterministic resolver, (3) a committed `provenance/question-page-map-residual.json` of additional pages produced by the second-layer resolver (`resolve_residual.py`), (4) a committed `provenance/base-corrections.json` of deterministic stem-run re-resolutions that correct base-resolver off-by-one errors (wins over base + residual), and (5) a committed `provenance/verified-overrides.json` of human/agent-verified pages (wins over all). The builder SHALL be deterministic, SHALL take the minimum page when a question's figures span multiple pages, SHALL apply the sources in that priority order (base-corrections and verified-overrides winning for any question they list; otherwise an earlier source is not overridden), and SHALL write its output to a gitignored `public/` path that is regenerated on every build and deploy (never hand-committed).

The base text-question resolver SHALL locate each born-digital question's page via its 題號 anchor, gate the result by within-booklet page monotonicity, and cross-check it against an independent signal (the corpus stem's distinctive token searched in the PDF). The second-layer resolver SHALL additionally resolve residual born-digital questions by (a) multi-token stem voting constrained to the within-booklet monotonic window (for booklets with a usable CJK text layer, including booklets the base resolver skipped merely because its 題號-anchor pattern matched few anchors), and (b) numeric question-anchor plus Latin-token cross-check (for booklets whose CJK text layer is garbled by a broken custom font but whose page images and Latin terms remain intact), and MAY fold in agent-verified pages supplied as an explicit input. Every second-layer resolution SHALL be re-gated for within-booklet monotonicity and for the question's content actually appearing on the chosen page. A question SHALL be included in the map only when its resolution passes these gates; questions whose signals conflict, whose page breaks monotonicity, whose page genuinely lacks a usable text layer for that question (no token hit), or that have no source PDF SHALL be excluded (left unmapped → action hidden), not guessed.

#### Scenario: Map covers every figure-provenance question
- **WHEN** the builder runs against the current `manifest.json`
- **THEN** the output map contains a `{ file, page }` entry for every questionId present in the manifest with a `sourcePdf` + `page`
- **AND** each `file` equals the manifest's `sourcePdf` string verbatim (the real on-disk filename)

#### Scenario: Map covers deterministically-resolved text questions
- **WHEN** a text question's 題號 anchor and its stem cross-check resolve to the same page (±1) in a born-digital booklet
- **THEN** the output map contains a `{ file, page }` entry for that question
- **AND** the figure manifest's page wins for any question present in both sources

#### Scenario: Map covers second-layer-resolved residual questions
- **WHEN** a residual born-digital question is resolved by multi-token stem voting within its monotonic window, or by numeric-anchor + Latin cross-check in a garbled-text-layer booklet, and the resolution passes the monotonicity + on-page-content gate
- **THEN** the output map contains a `{ file, page }` entry for that question
- **AND** the base text map and figure manifest win for any question already present in them

#### Scenario: Booklet with a usable text layer is resolved even if the base resolver skipped it
- **WHEN** a booklet was excluded by the base resolver only because its 題號-anchor pattern matched few anchors, yet its pages carry a usable CJK text layer (or a garbled-font layer with surviving Latin terms and page numbers)
- **THEN** the second-layer resolver attempts it via stem-run (clean) or numeric-anchor + Latin / vision (garbled), and maps each question whose resolution passes the content + monotonicity gate

#### Scenario: Base off-by-one correction wins over the base map
- **WHEN** a question's base-map page is found (e.g. by an end-to-end page-verification pass) to carry a different question, and a deterministic stem-run re-resolution finds a booklet page with a long contiguous run of that question's own stem
- **THEN** the corrected page is recorded in `provenance/base-corrections.json` and the builder maps that question to it, winning over the base and residual maps

#### Scenario: Agent-verified page is accepted only after re-gating
- **WHEN** an agent-supplied page for a residual question is folded into the second-layer resolver
- **THEN** it is added to the map only if it passes the same within-booklet monotonicity + on-page-content gate
- **AND** otherwise the question stays unmapped (action hidden) rather than mapped to an unverified page

#### Scenario: Human-verified override bypasses the automated gates
- **WHEN** a question's card cannot be gated by the automated pipeline — its stem/options are rendered as an embedded image (no extractable text for the stem-run check) or its 陽明 booklet's physical card order differs from the 考選部 qNumber (breaking the monotonicity fallback) — and a human/agent has confirmed the correct page by reading the actual rendered card
- **THEN** the page is recorded in `provenance/verified-overrides.json` and the builder maps that question to it, winning over all other sources
- **AND** questions NOT listed in the overrides are unaffected (still gated normally)

#### Scenario: Conflicting, textless, or un-sourced resolutions are excluded
- **WHEN** a question's signals disagree, its page breaks within-booklet monotonicity, its page genuinely lacks a usable text layer for that question (no token hit and no vision confirmation), or its booklet has no source PDF on disk
- **THEN** the question is NOT added to the map (its action stays hidden) rather than mapped to a guessed page

#### Scenario: Multi-page figures collapse to the first page
- **WHEN** a question's figures reference more than one page in the manifest
- **THEN** the map entry's `page` is the minimum of those pages

#### Scenario: Map output is a regenerated build artifact
- **WHEN** the content build chain (`prebuild` / `predev`) runs
- **THEN** the map is (re)written to the gitignored `public/provenance/` path
- **AND** no `public/` map JSON is tracked in git

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

### Requirement: Folder grant persists across sessions
The web implementation SHALL let the player grant a read-only local folder once and SHALL persist the directory handle in a device-local IndexedDB store (separate from the cloud-synced Dexie tables) so the grant survives across sessions, re-requesting the permission gesture when the browser requires it. The persisted handle SHALL NOT be uploaded to cloud sync.

#### Scenario: Grant survives a reload
- **WHEN** the player has granted a folder in a prior session and reopens the app
- **THEN** the system reuses the persisted handle (after any required permission re-prompt) without forcing a fresh folder pick

#### Scenario: Handle stays device-local
- **WHEN** a folder handle is persisted
- **THEN** it is stored only in the local IndexedDB store and is excluded from any R2 / cloud-sync bundle

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

### Requirement: Cross-booklet mis-files and confirmed-absent explanations are handled correctly
When 陽明's volunteer 詳解 booklets mis-file a question's explanation — either printing it in the SIBLING booklet of the same exam (e.g. a 醫學一 question's 詳解 typeset inside the 醫學(二) PDF, and vice-versa) or omitting it entirely — the provenance map SHALL reflect the verified reality rather than a 題號-anchored guess. A verified-override entry MAY therefore name a `file` that differs from the question's own nominal booklet, and a question for which verification proves no 詳解 exists in any of its exam's booklets SHALL be left unmapped (its provenance action hidden) rather than retained at an incorrect page.

#### Scenario: Override relocates a question to the sibling booklet
- **WHEN** a question's 詳解 is confirmed (by reading the rendered card and by a verbatim stem-run found in the sibling booklet's text) to be printed in the OTHER booklet of the same exam sitting than the one its base-map entry assumed
- **THEN** its `provenance/verified-overrides.json` entry records that sibling booklet's filename and page, and the builder maps the question to it (winning over all other sources)
- **AND** the entry's `file` is allowed to differ from the question's nominal 醫學一/醫學二 booklet

#### Scenario: Confirmed-absent explanation is removed, not left wrong
- **WHEN** an end-to-end verification confirms that no 詳解 for a question exists on any page of any of its exam sitting's booklets (the 陽明 volunteers never wrote it), while the base map currently maps it to an incorrect page
- **THEN** that entry is removed from `provenance/question-page-map.json` so the question becomes unmapped and its provenance action is hidden
- **AND** the map is NEVER left pointing a confirmed-absent question at a wrong page

