/**
 * Browser-direct Google Drive fetch for booklet PDFs (add-neurons-pdf-drive-autofetch, design D1/D6;
 * fix-neurons-ipad-large-pdf-fetch).
 *
 * The browser fetches each booklet straight from the publisher's official Drive via the Drive REST
 * API with a referrer-restricted, NON-secret public key (design D7) — the app's own infra is never
 * in the byte path. This never throws into the UI: it returns a typed result so the caller degrades
 * to the inline explanation + the official Drive link (No Silent Errors).
 *
 * Why Range-chunked (fix-neurons-ipad-large-pdf-fetch): a single whole-file fetch of a large PDF
 * (tens of MB, up to ~123 MB) reliably **throws** on iPad / iOS Safari — WebKit drops the large
 * cross-origin response mid-flight ("the network connection was lost", surfaced as a TypeError) —
 * even though curl and desktop browsers succeed on the exact same URL. So we fetch the file in small
 * (4 MiB) `Range` slices and stream them into one body: no single request is ever large, which is
 * what WebKit chokes on. The bytes still flow Drive → the player's browser directly (no proxy, no
 * app-owned server — the licensing invariant), and the assembled body streams to the Cache API on
 * disk via back-pressure, never materialized whole in JS.
 *
 * Error policy: per-request AbortController timeout + retry transient 5xx / network errors with
 * backoff; surface 403/429 (quota) and 404 (link-rot) as terminal; detect offline up front.
 */

export type DriveFetchReason = 'offline' | 'quota' | 'not-found' | 'config' | 'error'

export type DriveFetchResult =
  | { ok: true; response: Response }
  | { ok: false; reason: DriveFetchReason; status?: number; message: string; detail?: string }

/** Short diagnostic string for a thrown fetch — distinguishes e.g. a CORS-masked quota response
 * ("Load failed" / "Failed to fetch") from a dropped large response ("network connection lost"). */
function errDetail(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 80)
  return String(err).slice(0, 80)
}

export interface DriveFetchOptions {
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Injectable for tests; defaults to VITE_GDRIVE_API_KEY. */
  apiKey?: string
  /** Injectable for tests; defaults to navigator.onLine. */
  isOnline?: () => boolean
  /** Max retries per request for transient (5xx / network) failures. */
  retries?: number
  /** Base backoff in ms (attempt N waits delayMs × N). */
  delayMs?: number
  /** Injectable for tests so retries don't actually wait. */
  sleep?: (ms: number) => Promise<void>
  /** Per-request abort timeout in ms (guards an indefinitely-hung request). */
  timeoutMs?: number
}

const DEFAULT_KEY = import.meta.env.VITE_GDRIVE_API_KEY as string | undefined
const ENDPOINT = 'https://www.googleapis.com/drive/v3/files'
// One whole-file request per booklet (fix-neurons-pdf-edge-throttle). Range chunking was REMOVED: it
// amplified one booklet into ~31 requests and a 46-booklet bulk run into hundreds–thousands of rapid
// requests from one IP, which trips Google's per-IP edge abuse throttle (a CORS-less "Sorry" 403 that
// the browser surfaces as `TypeError: Load failed`). A single request is fewer requests AND less code;
// the "iOS drops large responses" theory that motivated chunking was disproven (a tiny 4 MiB request
// fails too). 180s because a whole 123 MB fetch on a mobile network legitimately exceeds the old 30s.
const DEFAULT_TIMEOUT = 180_000

/**
 * One request with an AbortController timeout, retrying transient 5xx + network errors with backoff.
 * Returns the Response (caller inspects `.status`); throws only after exhausting retries on a network
 * error / abort.
 */
async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  sleep: (ms: number) => Promise<void>,
  retries: number,
  delayMs: number,
  timeoutMs: number,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    try {
      // Explicit referrerPolicy 'origin' forces the app origin as Referer (the API key is
      // referrer-restricted) regardless of any page Referrer-Policy; credentials 'omit' = no cookies
      // to Drive. Defensive against a referrer-strip causing a CORS-masked 403 (fix discussion).
      const init: RequestInit = { headers, referrerPolicy: 'origin', credentials: 'omit', mode: 'cors' }
      if (controller) init.signal = controller.signal
      const res = await fetchImpl(url, init)
      if (res.status >= 500 && attempt < retries) {
        await sleep(delayMs * (attempt + 1))
        continue
      }
      return res
    } catch (err) {
      // Network error / abort (incl. iOS "network connection lost") — transient: retry, then give up.
      if (attempt < retries) {
        await sleep(delayMs * (attempt + 1))
        continue
      }
      throw err
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

/**
 * Fetch a booklet's PDF bytes from Drive by file id as a SINGLE whole-file request
 * (fix-neurons-pdf-edge-throttle — no client-side Range chunking; one request per booklet keeps the
 * bulk run from amplifying into the per-IP burst that trips Google's edge abuse throttle). Includes
 * the `X-Goog-Drive-Resource-Keys` header ONLY when the (legacy 0B…) file carries a resourceKey.
 */
export async function fetchBooklet(
  driveFileId: string,
  resourceKey?: string,
  opts: DriveFetchOptions = {},
): Promise<DriveFetchResult> {
  const apiKey = opts.apiKey ?? DEFAULT_KEY
  if (!apiKey) return { ok: false, reason: 'config', message: '尚未設定 Drive 金鑰，暫時無法載入原始 PDF' }

  const isOnline = opts.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  if (!isOnline()) return { ok: false, reason: 'offline', message: '目前離線，且尚未下載這份 PDF' }

  const fetchImpl = opts.fetchImpl ?? fetch
  const retries = opts.retries ?? 3
  const delayMs = opts.delayMs ?? 500
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT

  const url = `${ENDPOINT}/${driveFileId}?alt=media&key=${encodeURIComponent(apiKey)}`
  const headers: Record<string, string> = {}
  if (resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${driveFileId}/${resourceKey}`

  let res: Response
  try {
    res = await fetchWithRetry(fetchImpl, url, headers, sleep, retries, delayMs, timeoutMs)
  } catch (err) {
    // A thrown error is most often a CORS-masked rejection (the edge "Sorry" 403 surfaces as a
    // TypeError with no readable status) or a dropped connection. The caller classifies a suspected
    // edge throttle via `isCorsMaskedError(detail)` + `sameOriginProbe()`.
    return { ok: false, reason: 'error', message: '網路連線失敗，請稍後再試', detail: errDetail(err) }
  }

  if (res.status === 403 || res.status === 429) {
    return {
      ok: false,
      reason: 'quota',
      status: res.status,
      message: 'Google Drive 暫時忙線（配額），請稍後再試',
      detail: `HTTP ${res.status}`,
    }
  }
  if (res.status === 404) {
    return { ok: false, reason: 'not-found', status: 404, message: '官方雲端找不到這份 PDF（連結可能已更動）', detail: 'HTTP 404' }
  }
  if (!res.ok) {
    return { ok: false, reason: 'error', status: res.status, message: `載入失敗（${res.status}）`, detail: `HTTP ${res.status}` }
  }
  return { ok: true, response: res }
}

/**
 * True if a fetch failure (an Error, or a `DriveFetchResult.detail` string) looks like a CORS-masked
 * network rejection — a thrown `TypeError` / "Load failed" / "Failed to fetch" / "NetworkError". The
 * browser hides the status of a CORS-rejected response, so Google's edge "Sorry" 403 throttle arrives
 * here indistinguishably from a genuine dropped connection; the caller disambiguates with a
 * same-origin probe (a real network outage also fails that probe; an edge throttle does not).
 */
export function isCorsMaskedError(errOrDetail: unknown): boolean {
  const s =
    errOrDetail instanceof Error
      ? `${errOrDetail.name}: ${errOrDetail.message}`
      : typeof errOrDetail === 'string'
        ? errOrDetail
        : String(errOrDetail ?? '')
  const m = s.toLowerCase()
  return (
    m.includes('typeerror') ||
    m.includes('load failed') ||
    m.includes('failed to fetch') ||
    m.includes('networkerror')
  )
}

/**
 * Probe whether the player's OWN origin is reachable (a lightweight same-origin request), to
 * disambiguate a CORS-masked Drive failure: if this SUCCEEDS while Drive threw, the network is up and
 * Drive specifically was rejected → a suspected edge throttle. Same-origin only — a cross-origin probe
 * (e.g. httpbin) adds its own failure modes (adblock / captive portal / DNS) and would give a false
 * signal. Any resolved response (even 404/405) means the origin is reachable.
 */
export async function sameOriginProbe(
  opts: { fetchImpl?: typeof fetch; url?: string; timeoutMs?: number } = {},
): Promise<boolean> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const base = (import.meta.env.BASE_URL as string | undefined) || '/'
  const url = opts.url ?? `${base}favicon.png?probe=${Date.now()}`
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000) : null
  try {
    await fetchImpl(url, {
      method: 'HEAD',
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {}),
    })
    return true
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Whether a FAILED booklet fetch looks like Google's per-IP edge throttle: the failure is CORS-masked
 * (a thrown TypeError, no readable status) AND the player's own origin is still reachable (so it's not
 * a real outage). The single classifier shared by the bulk download and single-open paths — each
 * caller layers its own policy on top (the bulk run gates this behind a strike count to avoid the
 * probe + a cooldown from one transient blip; single-open always asks). Returns false for any ok /
 * non-error / non-CORS-masked / genuinely-offline result.
 */
export async function isSuspectedEdgeThrottle(
  res: DriveFetchResult,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  if (res.ok || res.reason !== 'error' || !isCorsMaskedError(res.detail)) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  return sameOriginProbe({ fetchImpl: opts.fetchImpl })
}

/**
 * Connectivity diagnostic (fix discussion — the iPad bug is unreproducible and CORS errors are
 * opaque to JS, so we probe a MATRIX of request shapes and report each outcome). The PATTERN of
 * which probes fail is decisive even when individual error strings are not:
 *  - A fails → the device blocks/breaks ALL cross-origin (content blocker / VPN / Private Relay).
 *  - A ok, B fails → Drive/googleapis specifically blocked (referrer / CORS / network reject).
 *  - B ok, C fails → only the `X-Goog-Drive-Resource-Keys` custom-header (preflight) path fails.
 *  - all ok → the fetch path works; the bug is downstream (cache write / bulk logic).
 */
export async function diagnoseDrive(
  sample: { plainFileId?: string; rkFileId?: string; resourceKey?: string },
  opts: { fetchImpl?: typeof fetch; apiKey?: string } = {},
): Promise<string[]> {
  const apiKey = opts.apiKey ?? DEFAULT_KEY
  const fetchImpl = opts.fetchImpl ?? fetch
  const out: string[] = []
  const probe = async (label: string, url: string, headers?: Record<string, string>): Promise<void> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), 15_000) : null
    try {
      const init: RequestInit = { referrerPolicy: 'origin', credentials: 'omit', mode: 'cors' }
      if (headers) init.headers = headers
      if (controller) init.signal = controller.signal
      const res = await fetchImpl(url, init)
      // status + whether the 302→googleusercontent redirect was followed + the CORS response type
      // (a cors fetch that survives the redirect is type 'cors'; a blocked one throws instead).
      out.push(`${label}：HTTP ${res.status}${res.redirected ? ' 轉址' : ''} [${res.type}]`)
    } catch (err) {
      out.push(`${label}：✗ ${errDetail(err)}`)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  // A — non-Google cross-origin (is ANY cross-origin fetch reaching the network from this device?)
  await probe('A 非Google跨域', 'https://httpbin.org/status/200')
  // B — Drive, small Range, NO custom header (CORS-safelisted, no preflight)
  if (apiKey && sample.plainFileId) {
    await probe('B Drive小範圍', `${ENDPOINT}/${sample.plainFileId}?alt=media&key=${encodeURIComponent(apiKey)}`, {
      Range: 'bytes=0-1023',
    })
  }
  // C — Drive with the X-Goog-Drive-Resource-Keys custom header (triggers a CORS preflight)
  if (apiKey && sample.rkFileId && sample.resourceKey) {
    await probe('C Drive+RK標頭', `${ENDPOINT}/${sample.rkFileId}?alt=media&key=${encodeURIComponent(apiKey)}`, {
      'X-Goog-Drive-Resource-Keys': `${sample.rkFileId}/${sample.resourceKey}`,
      Range: 'bytes=0-1023',
    })
  }
  if (!apiKey) out.push('（缺 Drive 金鑰，B/C 跳過）')
  return out
}

/** Official Drive 「view」 URL for a booklet — the non-blocking fallback link on any fetch failure. */
export function officialDriveUrl(driveFileId: string, resourceKey?: string): string {
  return `https://drive.google.com/file/d/${driveFileId}/view${
    resourceKey ? `?resourcekey=${encodeURIComponent(resourceKey)}` : ''
  }`
}

/** Pull the Drive resourceKey out of a booklet's viewUrl (legacy 0B… files carry one), or undefined. */
export function parseResourceKey(viewUrl: string | undefined): string | undefined {
  const m = /[?&]resourcekey=([^&]+)/.exec(viewUrl ?? '')
  return m ? decodeURIComponent(m[1]) : undefined
}
