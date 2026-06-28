## Context

Today's web 「看原始詳解 PDF」 (`neurons-explanation-pdf-provenance`) resolves the source PDF from a File System Access folder grant: the player manually downloads the 46 陽明 booklets and grants a read-only folder, after which a docked `react-pdf` panel opens the booklet at the mapped page. FSA is **Chromium-desktop only** → Safari and all mobile users get nothing, and the multi-step download-then-grant onboarding (`PdfOnboardingBanner` + `BookletDownloadList`) is friction.

A browser-direct Google Drive fetch has been **validated end-to-end**: a personal-gmail, referrer-restricted API key calling `GET https://www.googleapis.com/drive/v3/files/{id}?alt=media&key=…` from the `med-study-rpg.com` origin returns `HTTP 206 / content-type application/pdf / %PDF-` for a public file; a request without the referrer is `403`-blocked; Range is supported. Every key-free / no-credential alternative (Drive `/preview` iframe, `uc?export=*`, gview, postMessage viewer control) was proven impossible (no Drive URL serves inline `application/pdf`; cross-origin SOP blocks viewer control). A Worker proxy and R2 self-host were ruled out (proxy puts app infra in the byte path; R2 host is licensing-GRAY under CC-BY-NC because the PDFs embed third-party figures).

Constraints carried in: the docked viewer is `react-pdf` and loads a **whole** file (blob/ArrayBuffer); the app's Dexie is at schema **v20** and any `.version(21)` table forces a mandatory upgrade-fixture (CI lint); the cache is a **pure optimization** (Drive is always re-fetchable).

## Goals / Non-Goals

**Goals:**
- Page-anchored original-PDF view on **web + mobile**, with **zero user action** (app auto-fetches; no download, no grant, no picker).
- Preserve the **zero APP-hosted bytes** posture: bytes flow publisher-Drive → browser → device cache; the app never bundles/hosts/mirrors/serves them.
- Minimal new surface: **no Dexie schema bump**, **no viewer rewrite**, **no new dependency**.
- Remove the FSA folder-grant flow + onboarding banner + CJK filename matching.

**Non-Goals:**
- OPFS storage + pdf.js range/partial reads (deferred to a later change — only pays off after a viewer rewrite).
- Removing the Tauri desktop shell (separate follow-up change, now justified).
- Cloud-syncing cached PDF bytes (device-local only; cache is disposable).
- Changing the **page renderer** (`PdfDocumentView` unchanged). `PdfPanelHost` + `PdfPanelProvider` do change — they gain a responsive layout (see D8) — because the docked model is unusable on phones and this change is what makes the feature reach mobile.
- Hosting any bytes on R2 / a Worker proxy.

## Decisions

**D1 — Delivery: browser-direct Drive API fetch (not proxy / R2 / OAuth).**
The browser fetches each booklet from the publisher's official Drive via the Drive REST API with a referrer-restricted public key. Rationale: validated CORS + bytes; app infra never touches the bytes (posture preserved); lowest user friction (nothing to do). *Alternatives:* Worker proxy (disqualified — transient pass-through still puts app infra in the byte path); R2 self-host (licensing-GRAY — needs 陽明 written permission + third-party-figure clearance); OAuth `drive.readonly` (scary "all your Drive" restricted scope + Google verification); `drive.file`+Picker (per-file picking, public files aren't in the user's Drive).

**D2 — Storage: Cache API v1 behind a swappable byte-store; OPFS deferred.**
A tiny interface `{ get(key), put(key, resp), delete(key), list() }`, implemented v1 with the Cache API (`caches.open`). Rationale: the viewer already consumes a whole blob, so OPFS's range-read win requires an additional raw-pdf.js + `PDFDataRangeTransport` rewrite (not in scope) — until then OPFS is just a different backend for the same memory profile. Cache API streams the fetch `Response` to disk (no 96 MB held in JS), is cross-browser incl. mobile, and the interface makes a later OPFS swap free. *Alternatives:* OPFS now (more plumbing, same v1 memory); IndexedDB blob (mobile-Safari large-blob failure modes — rejected).

**D3 — No Dexie table / no schema bump.**
The Cache API itself answers the metadata questions: `cache.match(key)` = "is this booklet cached?", `cache.keys()` = cached-booklet list (for the offline-all completion indicator + a future manage-storage UI). No LRU (eviction = harmless re-fetch). The 「全部下載供離線」 preference rides the **existing key-value `meta` store** (no schema change). Rationale: a Dexie cache table would force v20→v21 + a mandatory upgrade-fixture for metadata that is derivable. *Alternative:* Dexie metadata/LRU table (unnecessary cost, rejected).

**D4 — Booklet identity = stable `bookletKey` → `driveFileId`.**
The question→`{page}` map references a stable `bookletKey` (PDF filename is display/debug only). The committed `booklet-drive-links.json` (`bookletKey → driveFileId` [+ `resourceKey`]) is the booklet manifest. The provenance-map builder is extended so each entry carries (or resolves to) its `bookletKey`+`driveFileId`; the runtime fetches by Drive ID. Rationale: filenames drift / have NFC-NFD variants; an ID is the stable identity boundary. The legacy `0B…` ID (`104-1-醫學二`) carries a `resourceKey` → the fetch adds `X-Goog-Drive-Resource-Keys: {id}/{rk}` when present.

**D5 — On-demand fetch + offline-all toggle.**
A booklet is fetched only when the player opens a mapped question in it; the response is cached, so repeat opens are instant (cache hit → no network). A Settings toggle 「全部下載供離線」 iterates the 46-booklet manifest and caches all. Mobile fetches large files without a size warning (grilled).

**D6 — Error / availability decision tree (No Silent Errors).**
- Unmapped question → action hidden (unchanged degradation).
- Mapped + cached → open from cache.
- Mapped + not cached + online → fetch (retry transient `5xx` with backoff; surface `403/429` quota + `404`/link-rot as a **non-blocking** message with the official Drive link as fallback); on success cache + open.
- Mapped + not cached + offline → non-blocking "not available offline" + official Drive link.
The inline 詳解 always remains the fallback; the quiz flow is never broken.

**D7 — Key/config.**
`VITE_GDRIVE_API_KEY` in `apps/neurons-tw/.env.local` (gitignored, per-app). Restricted to HTTP referrer `med-study-rpg.com/*` + the Drive API only. ⚠️ It must ALSO exist in the **deploy worktree** `~/coding-scratch/study-rpg/apps/neurons-tw/.env.local` or `pnpm deploy:cf` bakes a key-less build. The key is **not a secret** — it is abuse-limited by referrer + quota; access to the files rests on Drive sharing, not key secrecy.

**D8 — Responsive panel: docked on desktop, full-screen overlay on phones (added during apply, reviewed with Codex).**
The docked side-panel reflows app content beside it (`--pdf-panel-width`), but its width floor is 360px — on a ~390px phone the content collapses to a ~30px sliver (0 on a 360px phone). Since this change is what brings the feature to mobile, the panel must adapt. Below a single breakpoint (`max-width: 767.98px`) the panel becomes a full-screen overlay (`100vw × 100dvh`) covering the content, with the resize handle hidden and the reflow var held at 0 (content isn't pushed, just covered). Decisions from the Codex review: (a) **one breakpoint source of truth** — a JS `matchMedia` flag (`narrow`) in `PdfPanelProvider` drives both the reflow var and a CSS class on the host; the CSS only reacts to the class (no duplicate media-query cutoff); (b) **measure the body container** with a debounced `ResizeObserver` and feed that width to `PdfDocumentView`, rather than `innerWidth` or the clamped state width — uniform across docked/overlay and self-correcting on rotation; (c) `100vh` before `100dvh` (URL-bar-safe fallback) + `env(safe-area-inset-*)` so the close button clears the notch/home indicator; (d) **scroll-lock** the background only while the narrow overlay is up; (e) the panel is never rendered while closed, so the full-screen class can never cover a closed panel. `PdfDocumentView` itself is untouched — it already virtualizes (≤16 mounted pages) and re-pins the target on width change, so the rotation/large-booklet memory concerns are already handled. *Alternative considered:* a bottom-sheet (~90vh) — rejected for less reading area on dense exam pages.

## Risks / Trade-offs

- **Key extractable from the public bundle** → mitigated by referrer + API + quota restrictions; only public Drive files are addressable; monitor quota/errors; rotate if abused. (Documented, not eliminable — it is a client key by design.)
- **Per-worktree `.env.local` missed on deploy → prod silently key-less** (repo has been bitten) → a task + the verify step assert the deploy worktree carries the key; post-deploy prod smoke fetches a booklet and asserts `application/pdf`, not just a changed bundle.
- **Cache API origin-level eviction** (browser may clear the whole cache) → harmless (re-fetch on next open); no persistence guarantee is needed or claimed.
- **Drive link-rot / 陽明 changes a file ID** → surfaced as a non-blocking error + the official link; the manifest is committed and maintainable.
- **Mobile fetches a 96 MB booklet on cellular with no warning** (grilled choice) → accepted; on-demand limits it to booklets the player actually opens, and it caches after the first fetch.
- **Privacy**: the browser sends Drive file IDs + the public key to `googleapis.com`, so Google sees the user's IP + which booklets they open → documented; inherent to fetching from the publisher's Drive; the app adds no tracking and hosts no bytes.
- **Removing FSA orphans the device-local folder-handle store + folder code** → clean removal; opportunistically delete the dead `neurons-local-pdf` IndexedDB on first run post-update.

## Migration Plan

- **No data migration / no schema change.** Existing FSA-granted users (incl. the owner) need no action — auto-fetch supersedes the grant; their folder handle is simply unused (optionally deleted on first run).
- **Deploy**: put `VITE_GDRIVE_API_KEY` in both the dev worktree and the **deploy worktree** `.env.local`; build; `pnpm deploy:cf`; then prod smoke — open a mapped question → assert the booklet fetches (`application/pdf`) + the docked panel lands on the mapped page; re-check on a mobile viewport (forced-width probe) since FSA-less mobile is the new path.
- **Rollback**: revert the change (FSA flow returns; the committed key is harmless to leave). Clean because there is no schema/data change.

## Open Questions

- Exact `meta` key name for the 「全部下載供離線」 preference — resolve during apply (reuse the existing key-value meta convention; not a synced key).
- Build-time vs runtime `bookletKey` resolution — lean **build-time** (extend the provenance-map builder to emit `bookletKey`/`driveFileId` deterministically), keeping the runtime a pure lookup.
- Whether to proactively delete the dead `neurons-local-pdf` folder-handle DB or leave it inert — minor; lean delete-on-first-run.
