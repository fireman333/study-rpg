## Why

The owner's iPad still can't bulk-download the offline PDFs after three fixes, and the cause kept resisting diagnosis because **CORS failures are opaque to JS** and the bug is **unreproducible** from the dev side. Two pieces of evidence finally narrowed it:

- **Google Cloud Console → Drive API metrics (24h)**: response codes are **200 + 302 only, `403 ≈ 0`**, and `DriveFiles.Get` errors = **0**. So it is **NOT** referrer rejection, **NOT** quota, **NOT** auth — every request that *reaches* the Drive API method succeeds. The failure is therefore **client-side or device-side**.
- A live diagnostic (this change) on a rate-limited test machine shows the mechanism: a non-Google cross-origin fetch returns `HTTP 200 [cors]`, while the Drive fetch throws `TypeError: Failed to fetch` — i.e. a **CORS-masked Drive rejection** (a 403 with no CORS headers, possibly enforced at Google's edge before the API metric) surfaces as the exact generic error the player sees. So the remaining candidates are: the iPad's requests are blocked before reaching Drive (content blocker / VPN / iCloud Private Relay / DNS), or Safari rejects the response client-side (CORS / the 302→`googleusercontent` redirect).

Codex (consulted twice, with web research) confirmed the reframe and that the only way to pin it on a device with no Web Inspector is an **in-app diagnostic matrix**.

## What Changes

- **`driveFetch.ts`**:
  - Every booklet request now sets `referrerPolicy: 'origin'`, `credentials: 'omit'`, `mode: 'cors'` explicitly (the key is referrer-restricted; this forces the app origin as `Referer` regardless of any page policy — defensive, verified harmless: the diagnostic's test A uses the same options and returns `200 [cors]`).
  - New `diagnoseDrive()` runs a 3-probe matrix and reports each outcome (status + whether a 302 redirect was followed + the CORS response type, or the caught error): **A** a non-Google cross-origin fetch, **B** a small-Range Drive fetch with no custom header, **C** a Drive fetch with the `X-Goog-Drive-Resource-Keys` custom header (preflight).
- **`OfflineAllPdfControl.tsx`**:
  - A 「🔍 診斷連線」 button surfaces the matrix in the UI so the owner can screenshot a decisive result from the iPad. The PATTERN is conclusive even though individual error strings are opaque: A fails → device blocks all cross-origin; A ok + B fails → Drive specifically blocked; B ok + C fails → only the custom-header/preflight path; all ok → the fetch works and the bug is downstream (cache write).
  - The first failure of the bulk run is also surfaced **live during the run** (`首個失敗：…`), not only at completion (a run where every booklet fails can take minutes).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: booklet requests set an explicit referrer/CORS policy, and the offline feature provides an in-app connectivity diagnostic (a probe matrix surfaced in the UI) plus a live first-failure indicator, so an unreproducible device-specific fetch failure can be pinned from the device alone.

## Impact

- **Modified**: `apps/neurons-tw/src/platform/driveFetch.ts`, `apps/neurons-tw/src/components/OfflineAllPdfControl.tsx`.
- **No** byte-store / Dexie / R2 / sync / dependency change; bytes still flow Drive → browser directly.
- **Verification**: typecheck clean; `drive-fetch` (13) + `local-pdf-provenance` (10) tests green; Chrome MCP smoke ran the diagnostic live (A `200 [cors]`; B/C `Failed to fetch` from the rate-limited test IP — confirms the matrix + that the new fetch options are safe). The owner runs the diagnostic on the real iPad and screenshots A/B/C to pin the cause; the targeted fix follows from the pattern.
