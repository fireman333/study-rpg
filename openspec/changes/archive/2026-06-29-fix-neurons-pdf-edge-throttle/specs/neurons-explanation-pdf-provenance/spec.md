## MODIFIED Requirements

### Requirement: Booklet is auto-fetched on demand and cached, with an offline-all option
The web platform adapter SHALL fetch a booklet's PDF bytes from the publisher's Drive **on demand** — only when the player opens a mapped question whose booklet is not yet cached — and SHALL store the response in a device-local cache so subsequent opens of any question in that booklet are served from cache without a network request. The system SHALL also provide a Settings control 「全部下載供離線」 that fetches and caches every booklet in the committed manifest in one action. No folder grant, picker, or manual download SHALL be required.

Each booklet SHALL be fetched as a **single whole-file request** (`GET …?alt=media`); the adapter SHALL NOT split a booklet into multiple client-side `Range` requests. This keeps the number of Drive requests per booklet at one, so the bulk action does not amplify into the per-IP request burst that triggers Google's edge abuse throttle.

The offline-all action SHALL skip booklets that are already cached (no re-fetch) and SHALL fetch the rest **sequentially, one at a time**, and SHALL wait a short **paced delay with jitter** between consecutive booklet fetches so a full run does not present a burst of requests to one egress IP. Before fetching it SHALL make a **best-effort** request for persistent storage (so the browser is less likely to evict the cache); this request makes **no persistence guarantee** (consistent with the byte-store eviction stance) and SHALL NOT block or fail the action if denied or unsupported. While running and on completion the action SHALL report progress that **distinguishes** booklets newly **downloaded**, booklets **skipped** because already cached, and booklets that **failed** — it SHALL NOT present a single undifferentiated counter that makes a fast cache-skip indistinguishable from a slow re-fetch. A failure caused by **insufficient device storage** (a quota error) SHALL be classified and surfaced **distinctly** from a network/fetch failure, with a non-blocking message that names the out-of-space condition (and the remaining-space estimate when the browser exposes one). After caching a booklet the action SHALL **verify the write landed**; a write that cannot be confirmed SHALL be counted as a failure rather than silently treated as success.

When the action detects a **suspected Drive edge throttle** (per the graceful-degradation requirement) it SHALL **stop the remaining queue immediately** rather than continuing to issue Drive requests that will be throttled, SHALL persist a cooldown, and SHALL surface a non-blocking message that the download was paused, that already-cached booklets are kept, and that it can be resumed later (re-running skips the cached ones).

The action SHALL cache each booklet by storing a clean `application/pdf` response — preferring a cloned response and otherwise a buffered **Blob** wrapped in a clean `200` response — and SHALL NOT hand a JS-constructed `ReadableStream` body to the cache (WebKit's `Cache.put` can reject a constructed-stream body). When any booklet fails, the action SHALL record and surface the **first failure's stage** (fetch / cache-write / out-of-space) together with its **underlying cause** (the HTTP status, or a thrown error's name and message), so a device-specific failure that cannot be reproduced or remotely inspected can be diagnosed from the UI alone.

#### Scenario: First open of a booklet fetches; later opens hit cache
- **WHEN** the player opens a mapped question in a booklet that is not yet cached
- **THEN** the adapter fetches that booklet from Drive as a single whole-file request, caches it, and renders the page
- **AND** opening another mapped question in the SAME booklet afterwards renders from cache with no network fetch

#### Scenario: Offline-all caches uncached booklets and skips cached ones
- **WHEN** the player activates 「全部下載供離線」
- **THEN** the system fetches and caches every not-yet-cached booklet in the manifest and skips the already-cached ones without re-fetching them
- **AND** its completion state is derivable from the cached-booklet list versus the manifest (no separate schema table required)
- **AND** the progress reported to the player distinguishes how many were downloaded this run from how many were skipped-because-cached

#### Scenario: Bulk run paces requests between booklets
- **WHEN** the offline-all run fetches consecutive uncached booklets
- **THEN** it fetches them one at a time and waits a short jittered delay between booklets
- **AND** each booklet is fetched as a single whole-file request, not multiple Range requests

#### Scenario: Suspected throttle stops the queue and persists a cooldown
- **WHEN** a booklet fetch fails in a way classified as a suspected Drive edge throttle during the offline-all run
- **THEN** the system stops the remaining queue immediately (issues no further Drive requests for this run) and persists a cooldown
- **AND** it surfaces a non-blocking message that the download is paused, already-cached booklets are kept, and it can be resumed later
- **AND** a subsequent offline-all activation while still within the cooldown is refused with a message naming roughly when to retry, instead of issuing more requests

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
- **THEN** the result surfaces the first failure's stage (fetch / cache-write / out-of-space) and its underlying cause (HTTP status or thrown-error name and message)
- **AND** the cache write uses a clean `application/pdf` response (a JS-constructed stream body is never handed to `Cache.put`)

### Requirement: Fetch errors and offline degrade gracefully with the official link
On a fetch attempt the system SHALL distinguish transient, terminal, and **edge-throttle** failures and SHALL never fail silently. It SHALL retry transient `5xx` responses with backoff; it SHALL surface `403/429` (quota) and `404` / link-rot as a non-blocking message that includes the official Drive link for that booklet; and when the player is offline with the booklet uncached it SHALL show a non-blocking "not available offline" message. In every failure case the inline explanation SHALL remain available and the quiz flow SHALL continue.

Because Google's edge can reject bursty per-IP Drive traffic with a CORS-less `403` that the browser surfaces as an opaque `TypeError` (no readable status), the system SHALL detect a **suspected Drive edge throttle**: when a booklet fetch throws a `TypeError`-class error, the system SHALL run one **same-origin** connectivity probe; if that same-origin probe succeeds and `navigator.onLine` is not `false`, the failure SHALL be classified as a suspected edge throttle rather than a generic network error. On such a classification the system SHALL persist a **progressive cooldown** (escalating with repeated strikes, up to a daily cap; reset after repeated successful Drive fetches). The **bulk** action SHALL hard-respect the cooldown (refuse to start while active). A **single-open** SHALL only soft-respect the cooldown (it MAY still attempt one fetch and a success SHALL clear/relax the cooldown). A throttle failure SHALL surface throttle-aware copy (that Drive is temporarily limiting downloads and the action is paused / can be retried later), and SHALL NOT immediately retry the Drive request.

#### Scenario: Transient server error is retried then falls back
- **WHEN** a booklet fetch returns a transient `5xx`
- **THEN** the system retries with backoff, and if it still fails surfaces a non-blocking message with the official Drive link
- **AND** the inline explanation remains available

#### Scenario: Quota or link-rot surfaces the official link
- **WHEN** a booklet fetch returns `403`/`429` (quota) or `404` (link-rot / removed file)
- **THEN** the system surfaces a non-blocking message naming the booklet and linking its official Drive page
- **AND** does not break the quiz flow

#### Scenario: Offline with uncached booklet
- **WHEN** the player activates the action while offline and the booklet is not cached
- **THEN** the system shows a non-blocking "not available offline" message and keeps the inline explanation available

#### Scenario: CORS-masked edge throttle is classified via a same-origin probe
- **WHEN** a booklet fetch throws a `TypeError`-class error, a same-origin probe then succeeds, and `navigator.onLine` is not `false`
- **THEN** the system classifies the failure as a suspected Drive edge throttle (not a generic network error) and persists a progressive cooldown
- **AND** it surfaces throttle-aware copy and does not immediately retry the Drive request

#### Scenario: Bulk hard-respects, single-open soft-respects the cooldown
- **WHEN** a cooldown is active
- **THEN** the bulk offline-all action refuses to start and tells the player roughly when to retry
- **AND** a single 「看原始詳解 PDF」 open MAY still attempt one fetch, and a success clears or relaxes the cooldown

## REMOVED Requirements

### Requirement: Booklets are fetched in bounded Range slices for mobile-Safari reliability
**Reason**: The Range-slicing mandate is counterproductive. It was introduced for a hypothesis ("iOS / mobile Safari drops a large in-flight cross-origin response mid-transfer") that has since been disproven — a tiny 4 MiB Range request fails identically on the affected device. The real failure is Google's per-IP **edge abuse throttle** (a CORS-less `403` surfaced as `TypeError`), and Range slicing **amplifies** it by turning one booklet into ~31 requests (a 46-booklet bulk run into hundreds–thousands of requests), which is the burst that trips the throttle.
**Migration**: Booklets are now fetched as a **single whole-file request per booklet** (see the modified `Booklet is auto-fetched on demand and cached, with an offline-all option` requirement), with bulk pacing + suspected-throttle detection + a persisted cooldown (see the modified `Fetch errors and offline degrade gracefully with the official link` requirement) replacing the slice-assembly path. The zero-app-hosted-bytes invariant is unchanged — the single request is still fetched by the player's browser directly from the publisher's Drive.
