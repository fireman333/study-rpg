# Tasks — fix-neurons-pdf-bulk-cache-blob-write

## 1. Implementation
- [x] 1.1 `driveFetch.ts`: add a `detail` string to every failure result (HTTP status, or thrown error `name: message`)
- [x] 1.2 `driveFetch.ts`: re-wrap the single-slice success path to a clean `200` / `application/pdf` response (Cache.put rejects `206`)
- [x] 1.3 `OfflineAllPdfControl.tsx`: cache via a buffered Blob (`res.response.blob()` → `cache.put(new Response(blob))`), not the JS-constructed stream
- [x] 1.4 `OfflineAllPdfControl.tsx`: surface the first failure's stage + cause (抓取 / 組裝 / 寫入快取 / 寫入快取未落地 / 空間不足 + detail)

## 2. Verification
- [x] 2.1 `tsc --noEmit` clean (neurons-tw)
- [x] 2.2 `drive-fetch` (13) + `local-pdf-provenance` (10) tests green
- [ ] 2.3 Owner real-device smoke (iPad): hard-reload, run 「全部下載供離線」, screenshot the 「首個失敗：…」 line — its stage + detail identifies whether the cause is Drive quota (抓取 … HTTP 403 / TypeError: Load failed), a dropped connection (… connection lost), or the cache write (寫入快取 …)

## 3. Ship
- [ ] 3.1 verify → archive → commit (track-neurons) → merge main → push → CF Pages neurons deploy green
- [ ] 3.2 Prod bundle smoke
- [ ] 3.3 Follow-up (after 2.3 confirms the cause): the targeted fix — quota pacing/backoff if quota, or otherwise per the surfaced stage
