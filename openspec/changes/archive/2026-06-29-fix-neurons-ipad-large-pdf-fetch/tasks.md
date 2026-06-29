# Tasks — fix-neurons-ipad-large-pdf-fetch

## 1. Implementation (`driveFetch.ts`)
- [x] 1.1 Fetch the first 4 MiB `Range` slice as a probe; classify 403/429/404/offline/config as before
- [x] 1.2 On `206` + parseable `Content-Range` total > chunk → stream slice 0 then pull slices 1..N into one body (back-pressured, never the whole PDF in JS)
- [x] 1.3 Single-slice file / ignored-`Range` (`200`) / unparseable total → single-shot path (no regression)
- [x] 1.4 Per-request AbortController timeout + retry transient 5xx / network (incl. iOS network-lost) with backoff; default retries 2 → 3
- [x] 1.5 Preserve `fetchBooklet` contract so bulk + on-demand call sites are unchanged

## 2. Verification
- [x] 2.1 `tsc --noEmit` clean (neurons-tw)
- [x] 2.2 Unit tests: existing 10 + 3 new (multi-slice assembly bytes-intact / single-slice = 1 request / mid-stream failure surfaces on body read) — `drive-fetch` green (13); `local-pdf-provenance` green (10)
- [x] 2.3 Live `curl` Range probe of the failing booklet (113-1-醫學一): `206` + `Content-Range bytes 0-1048575/24135038` + valid `%PDF-1.7` → Range honored, chunking activates
- [ ] 2.4 Owner real-device smoke (iPad Safari): after clearing data, 「全部下載供離線」 progresses (本次下載 climbs, not stuck at 0); a previously-failing booklet's 「看原始詳解 PDF」 now loads instead of 「網路連線失敗」

## 3. Ship
- [ ] 3.1 verify → archive → commit (track-neurons) → merge main → push → CF Pages neurons deploy green
- [ ] 3.2 Prod bundle smoke on `med-study-rpg.com/neurons/`
