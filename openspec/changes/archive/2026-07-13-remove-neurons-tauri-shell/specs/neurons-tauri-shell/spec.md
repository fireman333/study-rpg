## REMOVED Requirements

The entire `neurons-tauri-shell` capability is retired. The Tauri desktop shell was scaffolded but never merged to a distributable or deployed; the owner has dropped the desktop product. The web「看原始詳解 PDF」 Drive-autofetch flow (capability `neurons-explanation-pdf-provenance`) is the sole PDF-viewing path on desktop + mobile, and it independently owns the still-live guarantees (official-link fallback, zero copyrighted bytes, byte-cache viewer). No shipped behavior is lost.

### Requirement: Desktop shell boots the existing web app in a native window

**Reason**: The Tauri native shell is deleted (`apps/neurons-tw/src-tauri/` + `dev:tauri`/`build:tauri`); no desktop target ships.
**Migration**: None. Desktop users use the web app in a browser; the responsive web build already serves desktop viewports.

### Requirement: Player can grant a read-only local PDF folder on desktop

**Reason**: The native folder-grant resolver (`platform/tauriBackend.ts` + `@tauri-apps/plugin-dialog`) is deleted.
**Migration**: None on desktop-native. On web, source PDFs are auto-fetched from the publisher's Google Drive (referrer-restricted key) per `neurons-explanation-pdf-provenance`; no local folder grant is needed.

### Requirement: Desktop resolves a question's source PDF through the same OpenResult contract

**Reason**: The desktop branch of the platform seam (`platform/index.ts` `if (DESKTOP) → tauriBackend`) is removed.
**Migration**: The web `OpenResult` path (`driveFileId` → byte-cache → docked viewer) remains the single implementation; the `OpenResult` contract itself is unchanged.

### Requirement: PDF rendering uses the bundled PDF.js, not the OS webview viewer

**Reason**: There is no OS webview to defend against once the desktop shell is gone.
**Migration**: The web viewer (react-pdf + bundled pdfjs, docked panel) already renders all platforms; `neurons-explanation-pdf-provenance` owns it.

### Requirement: Desktop build distributes zero copyrighted PDF bytes

**Reason**: No desktop build exists to distribute.
**Migration**: The zero-copyrighted-bytes guarantee for the shipped (web) app is owned by `neurons-explanation-pdf-provenance` ("App distributes zero copyrighted PDF bytes"), unchanged.

### Requirement: Booklet fingerprint manifest and official-link map are committed build artifacts

**Reason**: The content-fingerprint manifest (`fingerprint-manifest.json` + `fingerprint*.ts`) was consumed only by the desktop local-folder resolver and is deleted with it.
**Migration**: The official-link map (`booklet-drive-links.json`) is retained — it is web-used (offline-all download) and is spec'd under `neurons-explanation-pdf-provenance` ("Booklet identity resolves via a stable bookletKey to a Drive file ID").

### Requirement: Guided download surfaces the official source for a missing booklet

**Reason**: Desktop-specific guided-download onboarding is removed with the shell.
**Migration**: On web, `neurons-explanation-pdf-provenance` ("Fetch errors and offline degrade gracefully with the official link") already surfaces the official Drive link when a booklet is unavailable.

### Requirement: Onboarding banner for first-run folder grant

**Reason**: First-run local-folder-grant onboarding only existed for the desktop shell (the web FSA onboarding was already removed when web moved to Drive-autofetch).
**Migration**: None. Web needs no folder grant; PDFs auto-fetch on demand.
