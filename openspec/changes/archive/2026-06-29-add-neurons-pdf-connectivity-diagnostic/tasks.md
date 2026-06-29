# Tasks — add-neurons-pdf-connectivity-diagnostic

## 1. Implementation
- [x] 1.1 `driveFetch.ts`: set `referrerPolicy:'origin'` + `credentials:'omit'` + `mode:'cors'` on booklet requests
- [x] 1.2 `driveFetch.ts`: `diagnoseDrive()` 3-probe matrix (A non-Google cross-origin / B Drive small-Range no-header / C Drive + resource-key header), reporting status + redirect + CORS type, or caught error
- [x] 1.3 `OfflineAllPdfControl.tsx`: 「🔍 診斷連線」 button + results box
- [x] 1.4 `OfflineAllPdfControl.tsx`: surface the bulk run's first failure live during the run (`首個失敗：…`)

## 2. Verification
- [x] 2.1 `tsc --noEmit` clean
- [x] 2.2 `drive-fetch` (13) + `local-pdf-provenance` (10) tests green
- [x] 2.3 Chrome MCP smoke: button renders + runs; matrix returns A `HTTP 200 [cors]`, B/C `✗ Failed to fetch` (rate-limited test IP) → matrix works + new fetch options are safe (A proves it)
- [ ] 2.4 Owner runs 「🔍 診斷連線」 on the real iPad and screenshots A/B/C — the pattern pins the cause (device-wide block / Drive-specific / preflight / downstream)

## 3. Ship
- [x] 3.1 verify → archive → commit (track-neurons) → merge main → push → CF Pages deploy
- [ ] 3.2 Prod bundle smoke
- [ ] 3.3 Targeted fix follows from 2.4's pattern (e.g. device-setting guidance / preflight handling / cache-write fix)
