## Why

The just-shipped `add-neurons-tauri-shell` lets a desktop player open their own 陽明 PDFs, but resolution is by **exact filename** — fragile against how a player actually obtains the files (Google Drive names them arbitrarily; macOS stores CJK as NFD), so a downloaded booklet often won't match the provenance map's baked filename and the feature silently fails. There's also no in-app guidance on **where to get the PDFs** or **how to grant the folder**, so a new desktop user hits a dead end. This change makes desktop PDF onboarding actually work: identify booklets by **content fingerprint** (so filenames stop mattering), guide the player to the publisher's official downloads, teach the folder grant, and add a desktop bug-report channel. The project still distributes **zero copyrighted bytes** — it only links to the publisher's own public files.

## What Changes

- **Content-fingerprint resolution (desktop)**: identify which booklet a local PDF is by content (page count + normalized text hash of first / second / last page), not filename. New committed build artifact: a fingerprint manifest for the ~46 booklets (`{ bookletId, canonicalFile, pageCount, fingerprints[], expectedSizeRange }`), built from the owner's local PDFs. The Tauri Rust backend extracts page count + page text; `tauriBackend.ts` matches against the manifest instead of `findByNfcName`. Weak-match (page count + 2/3 text hashes) tolerates PDF-version drift; page-count-only → require explicit confirm. **Web (FSA) path unchanged.**
- **Booklet → official Drive-link map (committed)**: from the owner's 44 official 陽明 Google Drive links (104-1 … 115-1 × 醫學一/醫學二), extract each file-ID, key by bookletId, reconcile with the provenance map. Stale-link tolerant.
- **Guided-download UI (desktop-only)**: when a mapped question's booklet PDF isn't found in the granted folder, show an actionable prompt — official Drive link + which booklet + a「掃描資料夾」(rescan + fingerprint) action. On-demand by default; a「全部下載」list in settings. Always credits「陽明國考考古題小組」and frames it as "從出版方官方 Google Drive 下載到你的資料夾" — never "app 提供 PDF". **One-click direct-fetch is OUT OF SCOPE** (separate fast-follow change).
- **Auth onboarding banner (desktop-only)**: a global onboarding card when on Tauri desktop AND no folder granted (teaches 1. download 2. grant; dismisses after grant), plus the inline missing-file prompt above. Web build unaffected.
- **Desktop bug-report category**: add a neurons `bug_reports` category for desktop/Tauri issues, shown only when `isDesktop()`; the auto-context snapshot gains platform / OS / app-version. Backend: `bug_reports.category` is a CHECK constraint → a new `supabase/migrations/0018_*.sql` recreates `bug_reports_category_check` with the added value, applied via `supabase db push` (CLI-first), not the dashboard.
- **App icon**: replace the placeholder `src-tauri/icons/` with the cute pixel-art neuron icon + add it as the web favicon.

**Licensing invariant preserved (clarified, not weakened)**: the app hosts / mirrors / bundles zero copyrighted PDF bytes; it only links to the publisher's own public Google Drive and reads files the player downloaded themselves.

## Capabilities

### New Capabilities
<!-- none — this extends existing capabilities -->

### Modified Capabilities
- `neurons-tauri-shell`: the desktop source-PDF resolution requirement changes from exact-filename matching to **content-fingerprint** matching (filename becomes a storage convention only); ADD requirements for the committed fingerprint manifest + booklet→official-link map, the guided-download UI (links + rescan), and the desktop auth onboarding banner. The zero-copyrighted-bytes requirement is reaffirmed (guided download links to the publisher; distributes nothing).
- `neurons-bug-report`: the canonical neurons category set gains a desktop/Tauri value (UI + `@study-rpg/core` types + `0018` CHECK constraint stay in lockstep); the desktop category is shown only on desktop, and the auto-context snapshot captures platform / OS / app-version.

## Impact

- **Code (desktop)**: `apps/neurons-tw/src-tauri/src/main.rs` (Rust: page-count + page-text extraction for fingerprinting — likely a `pdfium`/lopdf-class dep), `apps/neurons-tw/src/platform/tauriBackend.ts` (fingerprint match replaces filename match), new guided-download + onboarding-banner React components (desktop-gated), `platform/provenance.ts`/types for the manifest + link-map loaders.
- **Build**: a new build-time script generating the fingerprint manifest + booklet-link map from the owner's local PDFs (run with the PDFs present; output committed, like the provenance map). Possibly a `.gitignore` / content-build wiring touch.
- **Backend**: `supabase/migrations/0018_*.sql` (category CHECK recreate); applied via `supabase db push`. Shared `bug_reports` table — only the CHECK changes; 二階 (standalone repo) unaffected by a neurons-only value. No IndexedDB / R2 schema change.
- **Assets**: `src-tauri/icons/` regenerated from the new source; `apps/neurons-tw/public/favicon.png` + `index.html`.
- **Web app**: unchanged behavior except the favicon; the guided-download / fingerprint / banner are all `isDesktop()`-gated. Deploying this (merge→main) ships the favicon + any shared-component touches to prod web.
- **Out of scope (separate follow-up)**: one-click direct-fetch from Drive (Rust HTTP + confirm-token + hardening); the 5 never-written 詳解 (AI-gen content change).
