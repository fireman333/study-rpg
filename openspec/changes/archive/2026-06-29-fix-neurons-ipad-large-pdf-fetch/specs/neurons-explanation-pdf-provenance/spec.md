## ADDED Requirements

### Requirement: Booklets are fetched in bounded Range slices for mobile-Safari reliability
The web platform adapter SHALL fetch a booklet's bytes from the publisher's Drive in **bounded `Range` slices** rather than as a single whole-file request, because iOS / mobile Safari (WebKit) drops a large in-flight cross-origin response mid-transfer (surfaced to JS as a network `TypeError`), making large booklets persistently un-fetchable as one request even though the same URL succeeds via `curl` and on desktop. Each network request SHALL be bounded (≤ a few MiB) so WebKit never sees a large in-flight response. The slices SHALL be assembled into one body that is consumed with back-pressure (one slice request at a time), so the whole PDF is NOT held in JS memory; the assembled body streams to the byte-store (bulk) or is read once (single-open). This SHALL preserve the zero-app-hosted-bytes invariant — every slice is fetched by the player's browser directly from the publisher's Drive, with no app-owned server, Worker, or bucket in the byte path. Each request SHALL have an abort timeout and SHALL retry transient `5xx` / network failures (including the iOS network-lost error) with backoff. When the file fits in the first slice, or the server does not honor `Range` (responds `200` with the whole body), the adapter SHALL fall back to the existing single-shot path. Terminal failures (403/429 quota, 404 link-rot, offline) and the official-Drive-link fallback are unchanged.

#### Scenario: A large booklet is fetched as multiple Range slices
- **WHEN** a booklet larger than one slice is fetched (the server returns `206 Partial Content` with a `Content-Range` total)
- **THEN** the adapter fetches it as a sequence of bounded `Range` requests and assembles them into the booklet's bytes
- **AND** no single network request carries the whole large file, so iOS / mobile Safari does not drop it mid-transfer
- **AND** the bytes are byte-for-byte the same file as a whole-file fetch would have produced

#### Scenario: Small file or no Range support takes the single-shot path
- **WHEN** the booklet fits within the first slice, or the server ignores `Range` and responds `200` with the whole body
- **THEN** the adapter uses the single response as-is (no behavior change for small booklets)

#### Scenario: A failed slice does not yield a partial/corrupt cache entry
- **WHEN** a slice request fails terminally (e.g. link-rot) part-way through assembling a booklet
- **THEN** the assembly surfaces the error to the consumer (no silent truncation), so the booklet is counted as failed and is not stored as a partial entry
- **AND** the inline explanation and the official Drive link remain available
