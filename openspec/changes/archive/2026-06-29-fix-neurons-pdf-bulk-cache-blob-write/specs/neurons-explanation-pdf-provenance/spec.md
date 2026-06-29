## MODIFIED Requirements

### Requirement: Booklet is auto-fetched on demand and cached, with an offline-all option
The web platform adapter SHALL fetch a booklet's PDF bytes from the publisher's Drive **on demand** — only when the player opens a mapped question whose booklet is not yet cached — and SHALL store the response in a device-local cache so subsequent opens of any question in that booklet are served from cache without a network request. The system SHALL also provide a Settings control 「全部下載供離線」 that fetches and caches every booklet in the committed manifest in one action. No folder grant, picker, or manual download SHALL be required.

The offline-all action SHALL skip booklets that are already cached (no re-fetch) and SHALL fetch the rest **sequentially**. Before fetching it SHALL make a **best-effort** request for persistent storage (so the browser is less likely to evict the cache); this request makes **no persistence guarantee** (consistent with the byte-store eviction stance) and SHALL NOT block or fail the action if denied or unsupported. While running and on completion the action SHALL report progress that **distinguishes** booklets newly **downloaded**, booklets **skipped** because already cached, and booklets that **failed** — it SHALL NOT present a single undifferentiated counter that makes a fast cache-skip indistinguishable from a slow re-fetch. A failure caused by **insufficient device storage** (a quota error) SHALL be classified and surfaced **distinctly** from a network/fetch failure, with a non-blocking message that names the out-of-space condition (and the remaining-space estimate when the browser exposes one). After caching a booklet the action SHALL **verify the write landed**; a write that cannot be confirmed SHALL be counted as a failure rather than silently treated as success.

The action SHALL cache each booklet by buffering the fetched body into a **Blob** wrapped in a clean `200` `application/pdf` response, NOT by handing a `206` or a JS-constructed `ReadableStream` body to the cache (WebKit's `Cache.put` rejects a `206` and can reject a constructed-stream body). When any booklet fails, the action SHALL record and surface the **first failure's stage** (fetch / slice-assembly / cache-write / out-of-space) together with its **underlying cause** (the HTTP status, or a thrown error's name and message), so a device-specific failure that cannot be reproduced or remotely inspected can be diagnosed from the UI alone.

#### Scenario: First open of a booklet fetches; later opens hit cache
- **WHEN** the player opens a mapped question in a booklet that is not yet cached
- **THEN** the adapter fetches that booklet from Drive, caches it, and renders the page
- **AND** opening another mapped question in the SAME booklet afterwards renders from cache with no network fetch

#### Scenario: Offline-all caches uncached booklets and skips cached ones
- **WHEN** the player activates 「全部下載供離線」
- **THEN** the system fetches and caches every not-yet-cached booklet in the manifest and skips the already-cached ones without re-fetching them
- **AND** its completion state is derivable from the cached-booklet list versus the manifest (no separate schema table required)
- **AND** the progress reported to the player distinguishes how many were downloaded this run from how many were skipped-because-cached

#### Scenario: Best-effort persistent storage requested before bulk download
- **WHEN** the player activates 「全部下載供離線」
- **THEN** the system requests persistent storage best-effort before fetching
- **AND** if the request is denied or unsupported the bulk download still proceeds, and the system claims no persistence guarantee

#### Scenario: Out-of-space failure is surfaced distinctly
- **WHEN** caching a booklet fails because the device is out of storage (a quota error)
- **THEN** the system counts it as an out-of-space failure (not a generic / network failure) and surfaces a non-blocking 「儲存空間不足」 message
- **AND** the booklets that did cache remain available offline and the rest of the run continues

#### Scenario: An unconfirmed cache write counts as failed
- **WHEN** a booklet's cache write does not land (no error thrown, but the bytes are not retrievable afterward)
- **THEN** the system counts that booklet as failed rather than reporting it as downloaded
- **AND** a later run re-attempts it instead of treating it as already cached

#### Scenario: First failure's stage and cause are surfaced for diagnosis
- **WHEN** at least one booklet fails during the offline-all run
- **THEN** the result surfaces the first failure's stage (fetch / assembly / cache-write / out-of-space) and its underlying cause (HTTP status or thrown-error name and message)
- **AND** a buffered Blob with a clean `200` response is used for the cache write (a `206` or JS-constructed stream body is never handed to `Cache.put`)
