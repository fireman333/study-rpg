## 1. Build-time booklet identity (bookletKey → driveFileId)

- [x] 1.1 Extend the provenance-map builder so every mapped question entry resolves to a stable `bookletKey` and its `driveFileId` (+ `resourceKey?`), sourced from the committed `packages/content-neurons-tw/provenance/booklet-drive-links.json` (filename stays display/debug only). — DONE (`scripts/booklet-identity.mjs` pure resolver + builder integration; links file feeds sourceHash).
- [x] 1.2 Verify build output: every mapped question yields a `driveFileId`; the legacy `104-1-醫學二` entry carries its `resourceKey`; print imported / unresolved / total counts (No Silent Errors). — DONE (4381/4381 resolved, 0 unresolved; resourceKey only on 104-1-醫學二's 100 Qs; builder logs `driveId X/Y resolved, N unresolved`).

## 2. Swappable byte-store (Cache API v1)

- [x] 2.1 Define the byte-store interface `{ get(key), put(key, response), delete(key), list() }` (the seam for a future OPFS impl). — DONE (`src/platform/byteStore.ts` `ByteStore`).
- [x] 2.2 Implement the Cache API backend: `put` streams the fetch `Response` to the cache (never materializing the whole 96 MB in JS); `get` returns the cached `Response`/blob; `list` returns cached booklet keys; `delete` removes one. — DONE (`createCacheByteStore` + singleton; injectable CacheStorage for tests).
- [x] 2.3 Confirm NO new Dexie `.version(n)` is added (so `lint:dexie-fixtures` is not triggered) and no 20–96 MB blob is written to IndexedDB. — DONE (no schema bump; bytes live in Cache API only; offline-all preference rides existing `meta` store).

## 3. Drive fetch module

- [x] 3.1 Implement `fetchBooklet(driveFileId, resourceKey?)` → `GET https://www.googleapis.com/drive/v3/files/{id}?alt=media&key=${VITE_GDRIVE_API_KEY}`, adding `X-Goog-Drive-Resource-Keys: {id}/{resourceKey}` only when a `resourceKey` is present. — DONE (`src/platform/driveFetch.ts`; injectable fetch/key/online/sleep for tests).
- [x] 3.2 Error classification (No Silent Errors): retry transient `5xx` with backoff; return typed terminal errors for `403/429` (quota) and `404` (link-rot); detect offline. Never throw into the UI. — DONE (typed `DriveFetchResult`; network errors retried then `error`; `config` when key missing).

## 4. Platform adapter rewrite (web branch)

- [x] 4.1 Replace the web `getStatus` / `grantFolder` / `openExplanation` folder logic in `apps/neurons-tw/src/platform/` with fetch+cache resolution: mapped → (cached ? open : fetch+cache) → blob URL → existing `PdfPanel` at the mapped page. — DONE (`index.ts` web branch; `openExplanation` takes injectable deps; `isLocalPdfSupported` no longer FSA-gated; getStatus/grantFolder web no-op, kept for the out-of-scope desktop contract).
- [x] 4.2 Remove `folderStore` and the device-local `neurons-local-pdf` handle store; delete that IndexedDB opportunistically on first run after update. — DONE (`folderStore.ts` deleted; `cleanupLegacyPdfStorage()` runs once per device from App mount, localStorage-guarded).
- [x] 4.3 Keep `PdfPanelHost` / `PdfDocumentView` (the docked viewer) unchanged — only the source resolution changes. — DONE (untouched; `PdfPanelProvider.openPdf({url,page,file})` contract preserved).

## 5. UI changes

- [x] 5.1 Remove `PdfOnboardingBanner` + `BookletDownloadList` from `App.tsx` and delete the now-unused components (clear orphaned imports). — DONE (both components `git rm`'d; App import + JSX removed; HelpMenu's `BookletDownloadList` + now-unused `isDesktop` imports cleared).
- [x] 5.2 Re-gate `LocalPdfButton` / `useLocalPdfAvailable`: available = question is mapped (no FSA / platform gate; show on mobile + Safari). — DONE (`isLocalPdfSupported`→true; `hasProvenance` web-gates on `driveFileId`; button title/copy updated).
- [x] 5.3 Settings: add the 「全部下載供離線」 toggle — iterate the manifest and cache all booklets; completion derived from `byteStore.list()` vs the 46-booklet manifest; the preference rides the existing key-value `meta` store (no schema bump). — DONE (`OfflineAllPdfControl` in HelpMenu's PDF section; streams each booklet to cache; `pdfOfflineAll` meta flag; per-booklet failures counted non-blockingly).
- [x] 5.4 Wire non-blocking error / offline messages (with the official Drive link as fallback) per the error decision tree; inline 詳解 always remains the fallback. — DONE (`LocalPdfButton` surfaces `r.message` + 「開啟官方 Google Drive」 link; inline 詳解 untouched).

## 6. Config / env

- [x] 6.1 Add `VITE_GDRIVE_API_KEY` to `apps/neurons-tw/.env.local` (dev worktree, gitignored). — DONE (key appended, gitignored, Supabase vars preserved).
- [x] 6.2 Add the SAME key to the deploy worktree `~/coding-scratch/study-rpg/apps/neurons-tw/.env.local` (per-worktree gotcha — else `pnpm deploy:cf` bakes a key-less build). — DONE (verified identical to dev, length 39, gitignored).

## 7. Tests

- [x] 7.1 Unit: byte-store get/put/delete/list (fake Cache API); fetch error classification (5xx→retry, 403/429/404→typed, offline); `resourceKey` header inclusion only when present; `bookletKey`→`driveFileId` resolution incl. the resource-keyed booklet. — DONE (`byte-store.test.ts`, `drive-fetch.test.ts`, `booklet-identity.test.ts`; `local-pdf-*` rewritten for the fetch+cache path).
- [x] 7.2 Run `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` green. — DONE (neurons typecheck clean; 733/733 tests pass across 102 files).

## 8. Verify & smoke

- [x] 8.1 `/verify` (typecheck + unit + dead-code audit + `/simplify`). — DONE (full `pnpm -r typecheck` clean; 733/733 vitest; dead-code = tsc `noUnusedLocals/noUnusedParameters` (no eslint/knip configured) + grep found no dangling refs to deleted modules; code reviewed for simplicity).
- [x] 8.2 Chrome MCP dev smoke: open a mapped question → confirm the Drive fetch fires → docked panel lands on the mapped page; cache hit on repeat; force a fetch error → non-blocking message + official link, inline 詳解 still available. — DONE, **full success path verified** after owner added `http://localhost:5173/*` to the key's referrer allowlist (dev server forced onto 5173; note `vite.config` default is 5175). Q83 (104-1-醫學一) → `GET …/drive/v3/files/…?alt=media&key=… → 200` → docked panel rendered real pages 78–84, **landed on page 78** (the mapped page; scrollTop 73535/85023); booklet cached in `neurons-pdf-v1`. Q84 (same booklet) → **landed on page 79 with NO new network fetch** (still exactly 1 googleapis request = cache hit). Degrade path also verified on 5175 (disallowed referrer → 403 → `quota` message + official Drive link). No console errors.
- [x] 8.3 Mobile/RWD check: the action shows at any width AND the panel is usable on phones. — DONE (button has no width/platform gate since `isLocalPdfSupported()` is unconditional `true`; the panel is now responsive — see section 9). HelpMenu PDF section shows 「全部下載供離線」 + 「已快取 0 / 46 份」.
- [ ] 8.4 Post-deploy PROD smoke on `med-study-rpg.com/neurons/`: the built bundle carries the key (fetch succeeds, not 403 key-missing); open a mapped question → fetch + page-jump; **re-check on a real phone viewport — full-screen overlay (not a 30px sliver), no resize handle, close returns to content**. Confirm both CI deploys (`deploy-cf-pages.yml`) green. — PENDING (requires merge→deploy; the referrer-restricted key only 200s from the prod origin, and the real `matchMedia` sub-768 flip needs a true phone viewport).

## 9. Mobile RWD — responsive panel (added during apply, reviewed with Codex; design D8)

- [x] 9.1 `PdfPanelProvider`: add a single-source-of-truth `narrow` flag via `matchMedia('(max-width: 767.98px)')` (with change listener for orientation); hold the reflow var (`--pdf-panel-width`) at 0 when `open && narrow` so content is covered, not crushed; expose `narrow` on the context. — DONE.
- [x] 9.2 `PdfPanelHost`: render a full-screen overlay on narrow (class `pdf-panel--full`; inline style omits width/height so the CSS rule wins без !important); hide the resize handle; scroll-lock the background only while the narrow overlay is up; feed `PdfDocumentView` a debounced `ResizeObserver`-measured body width (uniform across docked/overlay + rotation) instead of `innerWidth`/clamped state. `PdfDocumentView` untouched. — DONE.
- [x] 9.3 CSS (`styles.css`): `.pdf-panel--full` = `100vw` × `100vh`→`100dvh` (URL-bar-safe fallback) + `env(safe-area-inset-*)`; hide `.pdf-panel__handle`. Breakpoint defined only in JS; CSS reacts to the class. — DONE.
- [x] 9.4 Verify: typecheck clean + 733/733 vitest; Chrome MCP — desktop docked still works (handle visible, content reflows via var, close present); narrow render path validated in isolation (panel base style + class → 100vw × 100dvh, handle `display:none`). Real `matchMedia` sub-768 flip → prod/phone (8.4). — DONE.
