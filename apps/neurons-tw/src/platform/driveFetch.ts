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
  | { ok: false; reason: DriveFetchReason; status?: number; message: string }

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
  /** Range slice size in bytes. Small enough that iOS Safari never sees a large in-flight response. */
  chunkSize?: number
}

const DEFAULT_KEY = import.meta.env.VITE_GDRIVE_API_KEY as string | undefined
const ENDPOINT = 'https://www.googleapis.com/drive/v3/files'
const DEFAULT_CHUNK = 4 * 1024 * 1024 // 4 MiB — empirically below iOS Safari's large-response cliff
const DEFAULT_TIMEOUT = 30_000

/** Parse the total length out of a `Content-Range: bytes <start>-<end>/<total>` header, or null. */
function parseContentRangeTotal(header: string | null): number | null {
  const m = /\/(\d+)\s*$/.exec(header ?? '')
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

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
      const res = await fetchImpl(url, controller ? { headers, signal: controller.signal } : { headers })
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
 * Fetch a booklet's PDF bytes from Drive by file id, in Range slices. Includes the
 * `X-Goog-Drive-Resource-Keys` header ONLY when the (legacy 0B…) file carries a resourceKey.
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
  const chunkSize = Math.max(1, opts.chunkSize ?? DEFAULT_CHUNK)

  const url = `${ENDPOINT}/${driveFileId}?alt=media&key=${encodeURIComponent(apiKey)}`
  const baseHeaders: Record<string, string> = {}
  if (resourceKey) baseHeaders['X-Goog-Drive-Resource-Keys'] = `${driveFileId}/${resourceKey}`
  const rangeHeaders = (start: number, end: number): Record<string, string> => ({
    ...baseHeaders,
    Range: `bytes=${start}-${end}`,
  })

  // First slice doubles as the probe (and is the whole file for a small booklet).
  let first: Response
  try {
    first = await fetchWithRetry(fetchImpl, url, rangeHeaders(0, chunkSize - 1), sleep, retries, delayMs, timeoutMs)
  } catch {
    return { ok: false, reason: 'error', message: '網路連線失敗，請稍後再試' }
  }

  if (first.status === 403 || first.status === 429) {
    return { ok: false, reason: 'quota', status: first.status, message: 'Google Drive 暫時忙線（配額），請稍後再試' }
  }
  if (first.status === 404) {
    return { ok: false, reason: 'not-found', status: 404, message: '官方雲端找不到這份 PDF（連結可能已更動）' }
  }
  // 200 = the server ignored the Range and sent the whole body (small file / no range support) — use
  // it as-is (legacy single-shot path; harmless for the small files that don't hit the iOS cliff).
  if (first.status === 200) return { ok: true, response: first }
  if (first.status !== 206) {
    return { ok: false, reason: 'error', status: first.status, message: `載入失敗（${first.status}）` }
  }

  // 206 Partial Content → assemble the rest in further Range slices.
  const total = parseContentRangeTotal(first.headers.get('content-range'))
  if (total == null) {
    // No usable length → fall back to a single full GET (legacy path).
    try {
      const full = await fetchWithRetry(fetchImpl, url, baseHeaders, sleep, retries, delayMs, timeoutMs)
      if (!full.ok) return { ok: false, reason: 'error', status: full.status, message: `載入失敗（${full.status}）` }
      return { ok: true, response: full }
    } catch {
      return { ok: false, reason: 'error', message: '網路連線失敗，請稍後再試' }
    }
  }
  if (total <= chunkSize) {
    // Whole file fit in the first slice.
    return { ok: true, response: first }
  }

  // Stream slice 0, then pull slices 1..N. Each network request stays ≤ chunkSize, so iOS Safari
  // never sees a large in-flight response; Cache.put / blob() drains this with back-pressure (one
  // 4 MiB request at a time), so the whole PDF is never held in JS memory.
  const firstBuf = new Uint8Array(await first.arrayBuffer())
  let offset = firstBuf.byteLength
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(firstBuf)
    },
    async pull(controller) {
      if (offset >= total) {
        controller.close()
        return
      }
      const end = Math.min(offset + chunkSize, total) - 1
      let res: Response
      try {
        res = await fetchWithRetry(fetchImpl, url, rangeHeaders(offset, end), sleep, retries, delayMs, timeoutMs)
      } catch (err) {
        controller.error(err)
        return
      }
      if (res.status !== 206 && res.status !== 200) {
        controller.error(new Error(`Range slice at ${offset} failed (${res.status})`))
        return
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.byteLength === 0) {
        // Defensive: a zero-length slice would loop forever — treat as a failed transfer.
        controller.error(new Error(`Empty Range slice at ${offset}`))
        return
      }
      controller.enqueue(buf)
      offset += buf.byteLength
    },
  })
  return { ok: true, response: new Response(stream, { headers: { 'content-type': 'application/pdf' } }) }
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
