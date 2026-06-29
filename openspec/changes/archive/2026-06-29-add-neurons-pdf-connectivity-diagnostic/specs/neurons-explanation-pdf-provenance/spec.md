## ADDED Requirements

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
