## ADDED Requirements

### Requirement: Desktop shell boots the existing web app in a native window
The system SHALL provide a Tauri 2 desktop shell under `apps/neurons-tw/src-tauri/` that loads the **existing** neurons web app (the same Vite build, not a separate frontend) inside a native window, runnable locally via `cargo tauri dev`. The desktop code path SHALL be gated behind a build target flag (`VITE_TARGET==='desktop'`); when the flag is absent the web build, bundle, and `med-study-rpg.com/neurons/` deploy SHALL be byte-for-byte unaffected.

#### Scenario: Desktop window loads the app
- **WHEN** the owner runs the desktop dev command (`cargo tauri dev` with `VITE_TARGET=desktop`)
- **THEN** a native window opens and renders the running neurons app (home/quiz/explanation surfaces), driven by the same codebase as the web build

#### Scenario: Web build is unaffected by the desktop target
- **WHEN** the web build runs without `VITE_TARGET` set (`pnpm build` / the CF-Pages pipeline)
- **THEN** the output `base` and asset references are unchanged from before this change
- **AND** the produced web bundle contains no `@tauri-apps/*` desktop dependency

### Requirement: Player grants a read-only local PDF folder on desktop
On the desktop platform the system SHALL let the player pick their OWN folder of 陽明 source PDFs through a native folder picker, granting **read-only** access. The granted folder root SHALL persist device-local (not in the cloud-synced store, not in a Dexie table) and SHALL be re-registered on app launch. The desktop backend SHALL never expose a write/delete path to the player's files.

#### Scenario: First grant via folder picker
- **WHEN** the player triggers the provenance action on desktop with no folder yet granted
- **THEN** a native folder picker opens
- **AND** on selection the chosen folder root is recorded for read-only access and persisted device-local

#### Scenario: Grant persists across restarts
- **WHEN** the player has granted a folder and relaunches the desktop app
- **THEN** the previously granted folder is re-registered without prompting again
- **AND** the persisted grant is device-local and is not written to cloud sync

#### Scenario: Reads are confined to the granted folder
- **WHEN** the backend reads a source PDF
- **THEN** it reads only a `*.pdf` file located directly within the granted folder root
- **AND** a requested filename containing a path separator or `..`, or resolving outside the granted root, is rejected rather than read

### Requirement: Desktop resolves a question's source PDF through the same OpenResult contract
The desktop platform backend SHALL implement the platform adapter surface (`getStatus` / `grantFolder` / `openExplanation` / `releaseExplanationUrl` / `hasProvenance`) and SHALL return the **same** `OpenResult` shape (`{ ok:true, page, url, file }` on success) that the web (File System Access) path returns, so the existing platform-agnostic docked PDF panel renders it unchanged. Resolution SHALL reuse the shared provenance map lookup and CJK-safe (NFC) filename matching. The backend SHALL never throw into the UI: failures SHALL come back as `{ ok:false, reason, message? }` so the caller degrades to the inline 詳解 (No Silent Errors).

#### Scenario: Mapped question opens in the docked panel
- **WHEN** the player opens the source PDF for a mapped question on desktop with a granted folder containing the matching file
- **THEN** `openExplanation` returns `{ ok:true, page, url, file }`
- **AND** the existing docked panel renders that PDF at the mapped page (selectable text, continuous scroll), with no change to the viewer components

#### Scenario: CJK filename matched despite NFD-on-disk
- **WHEN** the mapped filename is stored on macOS in NFD form while the provenance map holds the NFC form
- **THEN** the backend matches the on-disk file by NFC-normalized comparison and reads it successfully

#### Scenario: Missing or unmapped resolves degrade gracefully
- **WHEN** the question is unmapped, the matching PDF is absent from the granted folder, or a read error occurs
- **THEN** `openExplanation` returns `{ ok:false, reason, message? }` (e.g. `unmapped` / `file-not-found` / `error`)
- **AND** the UI surfaces a non-blocking note and the inline 詳解 remains available

#### Scenario: Resolved source URL is released on close
- **WHEN** the docked panel closes a desktop-resolved PDF
- **THEN** `releaseExplanationUrl` revokes the `blob:` URL it created (no leak)

### Requirement: PDF rendering uses the bundled PDF.js, not the OS webview viewer
The desktop shell SHALL render PDFs with the app's bundled pdfjs worker (the same react-pdf v10 + `pdfjs-dist 5.4.296` asset used on the web) and SHALL NOT depend on the host webview's built-in PDF viewer or its `#page` fragment navigation (unreliable on macOS WKWebView). The bundled worker SHALL load locally (no CDN fetch) under the desktop build's relative asset base.

#### Scenario: Worker loads locally in the desktop window
- **WHEN** a PDF renders in the desktop window
- **THEN** the pdfjs worker is served from the bundled local asset (no network/CDN request)
- **AND** page navigation to the mapped page is performed by the in-app viewer, not the webview's native PDF `#page` handling

### Requirement: Desktop build distributes zero copyrighted PDF bytes
The desktop shell SHALL bundle no exam/explanation PDFs; it SHALL only open files the player already holds locally and supplies via the folder grant. This preserves the project's zero-copyrighted-bytes posture (no 陽明 redistribution licensing gate) on desktop, matching the web path.

#### Scenario: No PDFs are shipped in the app bundle
- **WHEN** the desktop app is built
- **THEN** no 陽明 source PDF is included in the bundle or downloaded by the app
- **AND** the only PDFs the app can open are those inside the player's own granted folder
