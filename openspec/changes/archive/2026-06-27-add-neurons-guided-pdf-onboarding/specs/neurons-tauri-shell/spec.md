## MODIFIED Requirements

### Requirement: Desktop resolves a question's source PDF through the same OpenResult contract

The desktop platform backend SHALL implement the platform adapter surface (`getStatus` / `grantFolder` / `openExplanation` / `releaseExplanationUrl` / `hasProvenance`) and SHALL return the **same** `OpenResult` shape (`{ ok:true, page, url, file }` on success) that the web (File System Access) path returns, so the existing platform-agnostic docked PDF panel renders it unchanged. Resolution SHALL identify which booklet a granted-folder PDF is by **content fingerprint** (page count + normalized text hashes of sampled pages) matched against the committed fingerprint manifest — NOT by exact filename — so a file resolves regardless of how it was named on download or whether macOS stored its name as NFD. The backend SHALL never throw into the UI: failures SHALL come back as `{ ok:false, reason, message? }` so the caller degrades to the inline 詳解 and the guided-download prompt (No Silent Errors).

#### Scenario: Booklet matched by content fingerprint regardless of filename
- **WHEN** a granted-folder PDF matches a booklet's manifest fingerprint (page count + text hashes), even though its filename differs from any baked provenance filename
- **THEN** `openExplanation` for a question in that booklet returns `{ ok:true, page, url, file }` and the docked panel renders the PDF at the mapped page
- **AND** the same file resolves whether its on-disk name is NFC or NFD

#### Scenario: Match-confidence policy
- **WHEN** a candidate PDF matches a booklet on page count plus all available sampled-page text hashes (strong), or on page count plus a majority of them (weak)
- **THEN** the file is accepted as that booklet
- **AND** when it matches on page count ONLY (no usable text layer), it is treated as low-confidence and requires explicit player confirmation before being used (not silently resolved)

#### Scenario: Missing booklet degrades to guided download
- **WHEN** no PDF in the granted folder fingerprints to the question's booklet (or no folder is granted)
- **THEN** `openExplanation` returns `{ ok:false, reason }` and the UI surfaces the guided-download prompt for that booklet (official link + rescan), with the inline 詳解 still available

#### Scenario: Resolved source URL is released on close
- **WHEN** the docked panel closes a desktop-resolved PDF
- **THEN** `releaseExplanationUrl` revokes the `blob:` URL it created (no leak)

### Requirement: Desktop build distributes zero copyrighted PDF bytes

The desktop shell SHALL bundle no exam/explanation PDFs and SHALL host, mirror, cache, or fetch zero copyrighted PDF bytes through any project-controlled server. It SHALL only open files the player already holds locally (supplied via the folder grant) and SHALL only ever **link** the player to the publisher's own official public source for downloads. This preserves the project's zero-copyrighted-bytes posture (no 陽明 redistribution licensing gate) on desktop, matching the web path.

#### Scenario: No PDFs are shipped or served by the project
- **WHEN** the desktop app is built and used
- **THEN** no 陽明 source PDF is included in the bundle, downloaded by the app from a project-controlled server, or proxied through one
- **AND** the only PDFs the app opens are those inside the player's own granted folder, and the only download path it offers is a link to the publisher's official Google Drive

## ADDED Requirements

### Requirement: Booklet fingerprint manifest and official-link map are committed build artifacts

The system SHALL provide two committed artifacts, generated offline from the owner's local 陽明 PDFs and the publisher's official link list (CI cannot regenerate them — no PDFs present):
- a **fingerprint manifest** `{ bookletId, canonicalFile, pageCount, fingerprints[], expectedSizeRange }[]` for the ~46 booklets, where each fingerprint is a normalized-text hash of a sampled page, produced by the SAME PDF engine used at runtime (bundled pdfjs) so build-time and runtime hashes are comparable;
- a **booklet → official Drive-link map** `{ bookletId → { driveFileId, viewUrl } }` parsed from the publisher's official links (normalizing the `/file/d/<ID>/view`, `uc?export=view&id=<ID>`, and `resourcekey` URL forms), with `bookletId` reconciled against the provenance map so a question resolves to a bookletId and thus an official link.

#### Scenario: Manifest hashes are build/runtime comparable
- **WHEN** the manifest is generated for a booklet and the same PDF is later fingerprinted at runtime
- **THEN** the runtime page count and normalized-text hashes equal the manifest's for that booklet (same engine + normalization)

#### Scenario: Question resolves to an official link via bookletId
- **WHEN** a mapped question's bookletId is looked up in the link map
- **THEN** a valid official Drive `viewUrl` for that booklet is returned for the guided-download prompt

### Requirement: Guided download surfaces the official source for a missing booklet

On the desktop build, when a mapped question's booklet cannot be resolved in the granted folder, the system SHALL present an actionable guided-download prompt: which booklet is needed, a link that opens the publisher's official Google Drive page in the system browser, and a「掃描資料夾」action that re-fingerprints the folder and resolves newly-added files. A settings affordance SHALL list all booklets' official links for a player who wants to download everything up front. All such UI SHALL credit「陽明國考考古題小組」and frame the action as downloading from the publisher's official source — it SHALL NOT state or imply that the app provides the PDF.

#### Scenario: Missing-booklet prompt links to the official source
- **WHEN** the player triggers the source-PDF action for a question whose booklet isn't in the folder
- **THEN** a prompt shows the booklet identity, an official Drive link that opens in the system browser, and a「掃描資料夾」action
- **AND** the copy credits 陽明國考考古題小組 and never claims the app supplies the PDF

#### Scenario: Rescan resolves a newly downloaded file
- **WHEN** the player downloads the booklet to the granted folder and triggers「掃描資料夾」
- **THEN** the folder is re-fingerprinted and the question's source PDF now opens in the docked panel

### Requirement: Onboarding banner for first-run folder grant

On any platform that can open a local source PDF — the desktop build, OR a web build whose browser supports the File System Access API (`isLocalPdfSupported()` is true) — while no folder has been granted (`getStatus()` is not `ready`), the system SHALL show a dismissible onboarding banner that teaches the two-step setup: (1) download your PDFs from the publisher's official links, (2) grant the folder for read-only access. The banner SHALL disappear once a folder is granted. It SHALL NOT appear where opening a local PDF is unsupported (a browser without File System Access — Safari / Firefox / mobile — and not the desktop build).

#### Scenario: Banner shown until folder granted
- **WHEN** a local-PDF-capable platform (the desktop app, or an FSA-capable browser) runs with no granted folder
- **THEN** the onboarding banner is shown with the download + grant steps
- **AND** after the player grants a folder, the banner no longer appears

#### Scenario: Banner hidden where local PDF is unsupported
- **WHEN** the app runs in a browser without File System Access (Safari / Firefox / mobile) and not as the desktop build
- **THEN** the onboarding banner is not shown
