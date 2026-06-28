## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Booklet is auto-fetched on demand and cached, with an offline-all option
The web platform adapter SHALL fetch a booklet's PDF bytes from the publisher's Drive **on demand** — only when the player opens a mapped question whose booklet is not yet cached — and SHALL store the response in a device-local cache so subsequent opens of any question in that booklet are served from cache without a network request. The system SHALL also provide a Settings control 「全部下載供離線」 that fetches and caches every booklet in the committed manifest in one action. No folder grant, picker, or manual download SHALL be required.

#### Scenario: First open of a booklet fetches; later opens hit cache
- **WHEN** the player opens a mapped question in a booklet that is not yet cached
- **THEN** the adapter fetches that booklet from Drive, caches it, and renders the page
- **AND** opening another mapped question in the SAME booklet afterwards renders from cache with no network fetch

#### Scenario: Offline-all toggle caches every booklet
- **WHEN** the player enables 「全部下載供離線」
- **THEN** the system fetches and caches all booklets in the manifest
- **AND** its completion state is derivable from the cached-booklet list versus the manifest (no separate schema table required)

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
On a fetch attempt the system SHALL distinguish transient from terminal failures and SHALL never fail silently. It SHALL retry transient `5xx` responses with backoff; it SHALL surface `403/429` (quota) and `404` / link-rot as a non-blocking message that includes the official Drive link for that booklet; and when the player is offline with the booklet uncached it SHALL show a non-blocking "not available offline" message. In every failure case the inline explanation SHALL remain available and the quiz flow SHALL continue.

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

## REMOVED Requirements

### Requirement: Folder grant persists across sessions
**Reason**: Auto-fetch from the publisher's Drive replaces the File System Access folder grant entirely — there is no folder to grant or persist. This removes the desktop-only gate and the multi-step download-then-grant onboarding.
**Migration**: Existing granted folders simply go unused (no player action required); the device-local folder-handle IndexedDB store (`neurons-local-pdf`) is removed and may be deleted opportunistically on first run after the update.

### Requirement: CJK filename matching normalizes Unicode form
**Reason**: The runtime now fetches a booklet by its Drive `driveFileId` (via `bookletKey`), not by matching a Chinese filename against on-disk folder entries, so NFC/NFD filename normalization is no longer part of source resolution.
**Migration**: The PDF filename becomes display/debug metadata only; identity and fetching are by `bookletKey` → `driveFileId`. No data migration is needed.
