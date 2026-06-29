# Tasks — fix-neurons-offline-pdf-progress

## 1. Implementation (`OfflineAllPdfControl.tsx`)
- [x] 1.1 Request best-effort persistent storage before the bulk fetch (`navigator.storage.persist()`, guarded + no-throw)
- [x] 1.2 Replace the loop-index progress with separate `downloaded / skipped / failed` tallies and surface them in the status line
- [x] 1.3 Classify `QuotaExceededError` as 「儲存空間不足」, distinct from a network failure; show remaining-space estimate when available
- [x] 1.4 Verify each cache write landed (`byteStore.get` after `put`); count an unverified write as a failure
- [x] 1.5 Keep sequential download; no byte-store / driveFetch interface change

## 2. Verification
- [x] 2.1 `tsc --noEmit` clean (neurons-tw)
- [x] 2.2 `drive-fetch` + `local-pdf-provenance` unit tests green (20)
- [x] 2.3 Chrome MCP render smoke: control renders with the new hint + honest `已快取 N / 46` line, no console error, `navigator.storage.persist/estimate` callable
- [ ] 2.4 Owner real-device smoke (iPhone + iPad): (a) skipped vs downloaded counts are distinct; (b) a large booklet that won't fit shows 「儲存空間不足」 not a generic fail; (c) re-opening the app keeps the cache (persist effective)

## 3. Ship
- [ ] 3.1 `/spec run` — verify → archive → commit (track-neurons) → merge main → push → CF Pages neurons deploy green
- [ ] 3.2 Prod smoke on `med-study-rpg.com/neurons/` (HelpMenu → 原始詳解 PDF section renders the offline control)
