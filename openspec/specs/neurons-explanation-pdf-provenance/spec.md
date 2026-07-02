# neurons-explanation-pdf-provenance Specification

## Purpose

The contract for the PDF provenance feature: on any platform that can fetch and render a PDF (web desktop and mobile), a player can open the original 陽明 explanation PDF at the exact page a question's 詳解 came from, giving a "textbook-grade original layout" source without the app distributing any copyrighted bytes. The web feature auto-fetches a booklet on demand directly from the publisher's official Google Drive (browser → Drive API → device-local cache), with no folder grant and no manual download. Covers the build-time question→{file, page} map (derived from the existing `explanation-figures` manifest, regenerated as a gitignored build artifact), booklet identity by a stable `bookletKey` → Drive `driveFileId` (+ optional `resourceKey`), on-demand fetch + a swappable byte-store cache (Cache API in v1, never IndexedDB blobs) with an offline-all option, a non-secret referrer-restricted Drive API key, a responsive panel (docked on wide viewports / full-screen overlay on narrow), graceful degradation when the source is unavailable (offline / fetch failure, with the official link), and the zero-app-hosted-bytes guarantee. The inline 詳解 (text + cropped figures/tables) is unchanged and remains the fallback; this is an additive entry point. Created by archiving change `add-neurons-local-pdf-provenance`; the auto-fetch model supersedes the original File System Access folder-grant approach (change `add-neurons-pdf-drive-autofetch`).
## Requirements
### Requirement: Provenance map is generated as a build artifact from manifest
The system SHALL provide a build-time builder that derives a question-to-PDF-page map `{ questionId: { file, page } }` from five committed sources, in increasing override priority: (1) the `explanation-figures/manifest.json` figure provenance (bbox-precise), (2) a committed `provenance/question-page-map.json` of text-question pages produced by the base deterministic resolver, (3) a committed `provenance/question-page-map-residual.json` of additional pages produced by the second-layer resolver (`resolve_residual.py`), (4) a committed `provenance/base-corrections.json` of deterministic stem-run re-resolutions that correct base-resolver off-by-one errors (wins over base + residual), and (5) a committed `provenance/verified-overrides.json` of human/agent-verified pages (wins over all). The builder SHALL be deterministic, SHALL take the minimum page when a question's figures span multiple pages, SHALL apply the sources in that priority order (base-corrections and verified-overrides winning for any question they list; otherwise an earlier source is not overridden), and SHALL write its output to a gitignored `public/` path that is regenerated on every build and deploy (never hand-committed).

The base text-question resolver SHALL locate each born-digital question's page via its 題號 anchor, gate the result by within-booklet page monotonicity, and cross-check it against an independent signal (the corpus stem's distinctive token searched in the PDF). The second-layer resolver SHALL additionally resolve residual born-digital questions by (a) multi-token stem voting constrained to the within-booklet monotonic window (for booklets with a usable CJK text layer, including booklets the base resolver skipped merely because its 題號-anchor pattern matched few anchors), and (b) numeric question-anchor plus Latin-token cross-check (for booklets whose CJK text layer is garbled by a broken custom font but whose page images and Latin terms remain intact), and MAY fold in agent-verified pages supplied as an explicit input. Every second-layer resolution SHALL be re-gated for within-booklet monotonicity and for the question's content actually appearing on the chosen page. A question SHALL be included in the map only when its resolution passes these gates; questions whose signals conflict, whose page breaks monotonicity, whose page genuinely lacks a usable text layer for that question (no token hit), or that have no source PDF SHALL be excluded (left unmapped → action hidden), not guessed.

#### Scenario: Map covers every figure-provenance question
- **WHEN** the builder runs against the current `manifest.json`
- **THEN** the output map contains a `{ file, page }` entry for every questionId present in the manifest with a `sourcePdf` + `page`
- **AND** each `file` equals the manifest's `sourcePdf` string verbatim (the real on-disk filename)

#### Scenario: Map covers deterministically-resolved text questions
- **WHEN** a text question's 題號 anchor and its stem cross-check resolve to the same page (±1) in a born-digital booklet
- **THEN** the output map contains a `{ file, page }` entry for that question
- **AND** the figure manifest's page wins for any question present in both sources

#### Scenario: Map covers second-layer-resolved residual questions
- **WHEN** a residual born-digital question is resolved by multi-token stem voting within its monotonic window, or by numeric-anchor + Latin cross-check in a garbled-text-layer booklet, and the resolution passes the monotonicity + on-page-content gate
- **THEN** the output map contains a `{ file, page }` entry for that question
- **AND** the base text map and figure manifest win for any question already present in them

#### Scenario: Booklet with a usable text layer is resolved even if the base resolver skipped it
- **WHEN** a booklet was excluded by the base resolver only because its 題號-anchor pattern matched few anchors, yet its pages carry a usable CJK text layer (or a garbled-font layer with surviving Latin terms and page numbers)
- **THEN** the second-layer resolver attempts it via stem-run (clean) or numeric-anchor + Latin / vision (garbled), and maps each question whose resolution passes the content + monotonicity gate

#### Scenario: Base off-by-one correction wins over the base map
- **WHEN** a question's base-map page is found (e.g. by an end-to-end page-verification pass) to carry a different question, and a deterministic stem-run re-resolution finds a booklet page with a long contiguous run of that question's own stem
- **THEN** the corrected page is recorded in `provenance/base-corrections.json` and the builder maps that question to it, winning over the base and residual maps

#### Scenario: Agent-verified page is accepted only after re-gating
- **WHEN** an agent-supplied page for a residual question is folded into the second-layer resolver
- **THEN** it is added to the map only if it passes the same within-booklet monotonicity + on-page-content gate
- **AND** otherwise the question stays unmapped (action hidden) rather than mapped to an unverified page

#### Scenario: Human-verified override bypasses the automated gates
- **WHEN** a question's card cannot be gated by the automated pipeline — its stem/options are rendered as an embedded image (no extractable text for the stem-run check) or its 陽明 booklet's physical card order differs from the 考選部 qNumber (breaking the monotonicity fallback) — and a human/agent has confirmed the correct page by reading the actual rendered card
- **THEN** the page is recorded in `provenance/verified-overrides.json` and the builder maps that question to it, winning over all other sources
- **AND** questions NOT listed in the overrides are unaffected (still gated normally)

#### Scenario: Conflicting, textless, or un-sourced resolutions are excluded
- **WHEN** a question's signals disagree, its page breaks within-booklet monotonicity, its page genuinely lacks a usable text layer for that question (no token hit and no vision confirmation), or its booklet has no source PDF on disk
- **THEN** the question is NOT added to the map (its action stays hidden) rather than mapped to a guessed page

#### Scenario: Multi-page figures collapse to the first page
- **WHEN** a question's figures reference more than one page in the manifest
- **THEN** the map entry's `page` is the minimum of those pages

#### Scenario: Map output is a regenerated build artifact
- **WHEN** the content build chain (`prebuild` / `predev`) runs
- **THEN** the map is (re)written to the gitignored `public/provenance/` path
- **AND** no `public/` map JSON is tracked in git

### Requirement: Player can open the local source PDF at the mapped page
On any platform that can fetch and render a PDF (web **desktop and mobile**), the system SHALL let the player open the original source PDF for a mapped question and view that question's page, via a provenance action surfaced alongside the inline explanation. The source bytes SHALL be resolved by the platform adapter — for the web, fetched on demand from the publisher's official Google Drive and cached on the device (see the fetch / cache / identity requirements) — with no folder grant and no manual download required. The PDF SHALL render in an in-app **panel** (not a new browser tab / the host's built-in PDF viewer), opened at the mapped page. The panel SHALL: render selectable text (not image-only); and allow continuous scrolling across the PDF's pages. On **wide (desktop) viewports** the panel SHALL be a resizable **docked side panel** (chosen width persisted across sessions) that is **non-modal** — while it is open the underlying app content (including a full-screen question/quiz surface it was opened from) SHALL reflow into the remaining width rather than be covered. On **narrow (phone) viewports** the panel SHALL instead present as a full-screen overlay (see the responsive-presentation requirement). The panel SHALL be the platform-agnostic rendering surface: the platform adapter resolves the source bytes per platform, while the panel renders identically across platforms.

#### Scenario: Open mapped question's PDF in the docked panel at its page
- **WHEN** the player activates the provenance action for a question that has a map entry, and the booklet's bytes are available (already cached, or fetched on demand)
- **THEN** the system opens the docked panel rendering that PDF scrolled to the mapped page
- **AND** it does NOT navigate the app away (no new tab / no full-page replacement) and shows no modal backdrop

#### Scenario: Underlying content reflows beside the open panel (wide viewport)
- **WHEN** the docked panel is open on a wide (desktop) viewport
- **THEN** the underlying app surface (a normal page, or a full-screen quiz/exam surface the action was opened from) reflows into the width remaining to the left of the panel rather than being overlaid
- **AND** when the panel is closed the layout returns to its prior full width

#### Scenario: Select text, scroll across pages, and resize
- **WHEN** the panel is open on a multi-page PDF on a wide (desktop) viewport
- **THEN** the player can select/copy text from the rendered pages, scroll continuously from the mapped page to adjacent pages, and drag the panel's edge to resize it
- **AND** the chosen width persists to the next session

#### Scenario: Dismiss the panel
- **WHEN** the player dismisses the panel
- **THEN** the loaded source is released (no leaked object URL) and the underlying layout returns to full width

#### Scenario: Viewer fails to render the PDF
- **WHEN** the source resolves but the PDF cannot be rendered (corrupt/unreadable bytes)
- **THEN** the panel surfaces a non-blocking error (it MUST NOT fail silently)
- **AND** the inline explanation remains available as the fallback

### Requirement: Graceful degradation when source is unavailable
The system SHALL surface the provenance action for every **mapped** question on every platform that can fetch + render a PDF (web desktop and mobile, all evergreen browsers). The action SHALL be hidden ONLY when the question has no map entry. When the action is activated but the booklet bytes cannot be obtained (offline with nothing cached, or a hard fetch failure), the system SHALL fall back to the inline explanation and surface a non-blocking message (it MUST NOT silently fail or break the quiz flow). The feature SHALL NOT be gated on the File System Access API or any desktop-only capability.

#### Scenario: Mapped question shows the action on mobile and Safari
- **WHEN** a mapped question is rendered on a mobile browser or Safari (no File System Access API)
- **THEN** the provenance action is shown (the feature is NOT hidden for lack of FSA)

#### Scenario: Unmapped question hides the action
- **WHEN** a question has no entry in the provenance map
- **THEN** the provenance action is not shown for that question
- **AND** the inline explanation renders unchanged

#### Scenario: Source unobtainable degrades without breaking the flow
- **WHEN** the player activates the action but the booklet bytes cannot be obtained (offline + uncached, or hard fetch failure)
- **THEN** the system surfaces a non-blocking message (with the official Drive link) and keeps the inline explanation available
- **AND** the quiz flow is not interrupted

### Requirement: App distributes zero copyrighted PDF bytes
The app's own infrastructure SHALL NOT bundle, host, mirror, cache on app-owned storage, or serve any source PDF bytes. The web feature SHALL obtain a booklet only by the player's browser fetching it directly from the **publisher's official Google Drive**, so the bytes flow publisher-Drive → the player's browser → a device-local cache, and the app's servers are never in the byte path.

#### Scenario: No PDF shipped or hosted by the app
- **WHEN** the app is built and deployed
- **THEN** no source exam-explanation PDF file is included in the bundle, the repository, or any app-hosted / app-served asset path (R2, CDN, Worker, or otherwise)

#### Scenario: Bytes flow only publisher → browser → device
- **WHEN** a booklet is fetched
- **THEN** the request goes from the player's browser to Google's Drive API directly, and the response bytes are cached only on the player's device
- **AND** no app-owned server, Worker, or bucket receives, relays, or stores the PDF bytes

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

### Requirement: Cached PDF bytes use a swappable byte-store, never IndexedDB blobs
The cache SHALL be accessed through a small swappable byte-store interface (get / put / delete / list). The v1 implementation SHALL use the Cache API. The system SHALL NOT store 20–96 MB PDF blobs in IndexedDB / Dexie, and SHALL NOT introduce a new Dexie schema version for PDF caching. The cached-state queries ("is this booklet cached?", "list cached booklets") SHALL be answered by the byte-store itself; any user preference (e.g. the offline-all toggle) SHALL ride the existing key-value meta store. Because the cache is a pure optimization (the source is always re-fetchable), the system SHALL treat browser eviction as a harmless re-fetch and SHALL NOT claim a persistence guarantee.

#### Scenario: PDF bytes are not written to IndexedDB and add no Dexie version
- **WHEN** a booklet is cached
- **THEN** the bytes are stored via the byte-store (Cache API in v1), not in any Dexie/IndexedDB object store
- **AND** the change introduces no new `.version(n)` Dexie schema bump

#### Scenario: Eviction is recovered transparently
- **WHEN** a previously-cached booklet has been evicted by the browser and the player re-opens one of its questions
- **THEN** the adapter re-fetches it without surfacing an error

### Requirement: Booklet identity resolves via a stable bookletKey to a Drive file ID
The provenance map SHALL identify a question's source booklet by a stable `bookletKey` (the PDF filename is display/debug only and SHALL NOT be the identity boundary). The committed booklet manifest SHALL map each `bookletKey` to its Drive `driveFileId` and, where the file requires one, its `resourceKey`. The runtime SHALL fetch a booklet by its `driveFileId`, and SHALL include the `X-Goog-Drive-Resource-Keys: {driveFileId}/{resourceKey}` header whenever the manifest entry carries a `resourceKey`.

#### Scenario: Map resolves a question to a Drive file ID by bookletKey
- **WHEN** a mapped question is opened
- **THEN** its `bookletKey` is resolved through the committed manifest to a `driveFileId`, and the fetch addresses that file by ID (not by filename)

#### Scenario: Resource-keyed legacy booklet sends the resource-key header
- **WHEN** the booklet's manifest entry carries a `resourceKey` (e.g. the legacy `0B…` ID booklet)
- **THEN** the fetch includes the `X-Goog-Drive-Resource-Keys: {driveFileId}/{resourceKey}` header
- **AND** booklets without a `resourceKey` are fetched without that header

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

### Requirement: Booklet requests set an explicit referrer + CORS policy
Because the Drive API key is HTTP-referrer-restricted, every booklet request (on-demand, bulk, and diagnostic) SHALL set `referrerPolicy: 'origin'` (force the app origin as `Referer` regardless of any page `Referrer-Policy`), `credentials: 'omit'` (no cookies sent cross-origin), and `mode: 'cors'`. It SHALL NOT attempt to set the `Referer` header manually (a browser-controlled forbidden header).

#### Scenario: Requests carry the app origin as referrer
- **WHEN** the browser fetches a booklet (or runs the connectivity diagnostic)
- **THEN** the request uses `referrerPolicy: 'origin'` and `mode: 'cors'`, so a referrer-restricted key sees the app origin
- **AND** the app does not set a `Referer` header directly

### Requirement: Offline feature provides an in-app connectivity diagnostic
Because a fetch failure can be device-specific and unreproducible, and CORS failures are opaque to JavaScript (the status of a CORS-rejected response is not exposed), the offline-PDF UI SHALL provide an in-app diagnostic that probes a **matrix of request shapes** and reports each outcome (HTTP status + whether a redirect was followed + the CORS response type, or the caught error's name and message). The matrix SHALL include at least: a non-Google cross-origin request, a Drive request with a small byte-Range and no custom header, and a Drive request carrying the `X-Goog-Drive-Resource-Keys` custom header. The result SHALL be rendered in the UI so the player can capture it on a device with no developer tools. The offline-all run SHALL additionally surface its first failure **while it is still running**, not only on completion.

#### Scenario: Diagnostic surfaces a decisive request-shape matrix
- **WHEN** the player runs the connectivity diagnostic
- **THEN** the UI shows the outcome of each probe (cross-origin / plain-Drive / custom-header-Drive)
- **AND** the pattern of which probes pass or fail identifies whether the failure is a device-wide cross-origin block, a Drive-specific rejection, a custom-header/preflight issue, or downstream of a working fetch

#### Scenario: First bulk failure is visible during the run
- **WHEN** a booklet fails during the offline-all run and the run has not yet completed
- **THEN** the UI surfaces that first failure's stage and cause immediately, without waiting for all booklets to be processed

### Requirement: The embedded Drive API key is treated as a non-secret client credential
The system MAY embed a Google Drive API key in the client bundle to authorize the browser-direct fetch, but SHALL treat it as **non-secret**: the key SHALL be restricted to the app's HTTP referrer and to the Drive API only, SHALL NOT be granted any sensitive/restricted scope or non-Drive API, and the design SHALL rely on the files' own Drive sharing permissions (public/anyone-with-link) for access — never on key secrecy. Only public/shared Drive files SHALL be addressable.

#### Scenario: Key is restricted and only public files are reachable
- **WHEN** the embedded key is used from the app's origin
- **THEN** it succeeds only for requests carrying the app's referrer and only against the Drive API, and only for files that are publicly shared
- **AND** a request without the app's referrer is rejected by Google

### Requirement: The PDF panel is responsive — docked on wide viewports, full-screen on narrow
The panel SHALL adapt to viewport width. On a **wide (desktop) viewport** it SHALL be a docked side panel that the app content reflows beside (non-modal), with a draggable resize handle. On a **narrow (phone) viewport** it SHALL instead present as a **full-screen overlay** that covers the app content (no side-by-side reflow into a sliver), with the resize handle hidden. The rendered PDF SHALL fill the available width in both modes. The layout SHALL switch automatically at the viewport breakpoint — including on orientation change while the panel is open — and SHALL NOT require the player to reopen the panel.

#### Scenario: Narrow viewport shows a full-screen overlay
- **WHEN** the panel is opened on a narrow (phone) viewport
- **THEN** it covers the app content as a full-screen overlay rather than a docked side panel, the underlying content is not reflowed into a sliver, and the resize handle is not shown

#### Scenario: Wide viewport docks beside reflowed content
- **WHEN** the panel is opened on a wide (desktop) viewport
- **THEN** it docks to the side, the app content reflows into the remaining width (non-modal), and a draggable resize handle is shown

#### Scenario: Layout follows the viewport without reopening
- **WHEN** the viewport crosses the breakpoint while the panel is open (e.g. device rotation)
- **THEN** the panel switches between the docked and full-screen layouts automatically, without the player reopening it

### Requirement: The PDF view SHALL support in-app button zoom that keeps the player's place, and SHALL leave pinch to the browser's native viewport zoom

The rendered PDF SHALL support **in-app zoom** as application state (re-rasterizing the page at the new width for crisp text — not a persistent CSS scale), clamped to a usable range whose floor is below fit-to-width (so an over-wide page can always be shrunk back) with a fit-to-width reset control, driven by on-screen － / ＋ buttons and a ％ reset available on all devices.

The viewer SHALL NOT implement its own two-finger pinch gesture and SHALL NOT suppress the browser's native pinch behaviors over the panel (no pinch-blocking `touch-action` on the PDF scroll surface, no `gesturestart`/`gesturechange` interception): a two-finger pinch over the PDF — as anywhere else in the app — performs the **browser's native viewport zoom**. The app SHALL NOT declare a viewport meta that disables user scaling. One-finger scrolling of the PDF stays native and unaffected. (Native viewport zoom scales the already-rasterized pixels; the ± buttons remain the crisp re-raster path.)

The render width fed to the rasterizer SHALL derive from **layout-viewport measures** (the panel body's layout size) — never from the visual viewport (`visualViewport.width` or iOS's visual-viewport-tracking `innerWidth`) — so that a native pinch, which by definition shrinks the visual viewport, cannot feed back into the document: pinching SHALL NOT re-rasterize, reflow, or re-anchor the document during or after the gesture (the zoom is purely the browser compositor scaling the existing raster). Rotation, split-view, and the panel drag-resize remain the only render-width-change triggers.

After the initial open has landed, ANY page-width change — the ± buttons or a panel drag-resize — SHALL re-anchor the view to the page the player is **currently looking at** (the top-visible page, tracked while scroll position and page offsets are in a consistent coordinate space), NOT back to the originally-opened question's page. A fresh open or a jump to another question SHALL still land on that question's mapped page.

#### Scenario: Pinch performs the browser's native zoom

- **WHEN** the player pinches with two fingers over the open PDF panel on a touch device
- **THEN** the browser's native viewport zoom occurs (the viewer does not intercept or suppress the gesture)

#### Scenario: Pinch does not re-rasterize the document

- **WHEN** the player pinch-zooms over the open PDF panel on a phone
- **THEN** the rendered page width and the mounted page window stay unchanged — no re-rasterization, reflow, or scroll re-anchor occurs during or after the gesture
- **AND** only the browser's compositor scales the already-rendered raster

#### Scenario: Button zoom re-rasterizes crisply

- **WHEN** the player taps ＋ / － or the ％ reset
- **THEN** the page re-rasterizes at the new width (crisp text, not a scaled bitmap), within the clamped zoom range

#### Scenario: Zoom keeps the player's place

- **GIVEN** the player opened a question's PDF and then scrolled several pages away
- **WHEN** they change the zoom with the ± buttons or drag-resize the docked panel
- **THEN** the view re-anchors to the page currently at the top of the viewport, not back to the question's page

#### Scenario: A fresh open still lands on the question's page

- **WHEN** the player opens the PDF action for a (different) question
- **THEN** the viewer lands on that question's mapped page regardless of any prior zoom or scroll position

### Requirement: Cross-booklet mis-files and confirmed-absent explanations are handled correctly
When 陽明's volunteer 詳解 booklets mis-file a question's explanation — either printing it in the SIBLING booklet of the same exam (e.g. a 醫學一 question's 詳解 typeset inside the 醫學(二) PDF, and vice-versa) or omitting it entirely — the provenance map SHALL reflect the verified reality rather than a 題號-anchored guess. A verified-override entry MAY therefore name a `file` that differs from the question's own nominal booklet, and a question for which verification proves no 詳解 exists in any of its exam's booklets SHALL be left unmapped (its provenance action hidden) rather than retained at an incorrect page.

#### Scenario: Override relocates a question to the sibling booklet
- **WHEN** a question's 詳解 is confirmed (by reading the rendered card and by a verbatim stem-run found in the sibling booklet's text) to be printed in the OTHER booklet of the same exam sitting than the one its base-map entry assumed
- **THEN** its `provenance/verified-overrides.json` entry records that sibling booklet's filename and page, and the builder maps the question to it (winning over all other sources)
- **AND** the entry's `file` is allowed to differ from the question's nominal 醫學一/醫學二 booklet

#### Scenario: Confirmed-absent explanation is removed, not left wrong
- **WHEN** an end-to-end verification confirms that no 詳解 for a question exists on any page of any of its exam sitting's booklets (the 陽明 volunteers never wrote it), while the base map currently maps it to an incorrect page
- **THEN** that entry is removed from `provenance/question-page-map.json` so the question becomes unmapped and its provenance action is hidden
- **AND** the map is NEVER left pointing a confirmed-absent question at a wrong page

### Requirement: Inline explanation defaults collapsed when the local-PDF action is available
When a question's local-PDF provenance action is available to the player (the platform supports local PDFs AND the question is mapped), the inline text explanation SHALL default to a collapsed state, since the original-layout PDF is the richer source; the player can still expand it. When the action is NOT available (unsupported platform or unmapped question), the inline explanation SHALL remain expanded by default, as it is the only source.

#### Scenario: PDF action available → inline explanation starts collapsed
- **WHEN** a question is rendered for which the local-PDF action is available
- **THEN** its inline explanation is collapsed by default
- **AND** the player can expand it manually

#### Scenario: PDF action unavailable → inline explanation stays expanded
- **WHEN** a question is rendered for which the local-PDF action is NOT available (unsupported platform or unmapped question)
- **THEN** its inline explanation is expanded by default

