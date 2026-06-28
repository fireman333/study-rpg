/**
 * Browser-direct Google Drive fetch for booklet PDFs (add-neurons-pdf-drive-autofetch, design D1/D6).
 *
 * The browser fetches each booklet straight from the publisher's official Drive via the Drive REST
 * API with a referrer-restricted, NON-secret public key (see design D7) — the app's own infra is
 * never in the byte path. This never throws into the UI: it returns a typed result so the caller
 * degrades to the inline explanation + the official Drive link (No Silent Errors).
 *
 * Error policy: retry transient 5xx (and network errors) with backoff; surface 403/429 (quota) and
 * 404 (link-rot) as terminal; detect offline up front.
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
  /** Max retries for transient (5xx / network) failures. */
  retries?: number
  /** Base backoff in ms (attempt N waits delayMs × N). */
  delayMs?: number
  /** Injectable for tests so retries don't actually wait. */
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_KEY = import.meta.env.VITE_GDRIVE_API_KEY as string | undefined
const ENDPOINT = 'https://www.googleapis.com/drive/v3/files'

/**
 * Fetch a booklet's PDF bytes from Drive by file id. Includes the
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
  const retries = opts.retries ?? 2
  const delayMs = opts.delayMs ?? 500
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  const url = `${ENDPOINT}/${driveFileId}?alt=media&key=${encodeURIComponent(apiKey)}`
  const headers: Record<string, string> = {}
  if (resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${driveFileId}/${resourceKey}`

  let lastStatus: number | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response
    try {
      res = await fetchImpl(url, { headers })
    } catch {
      // Network error — transient: retry with backoff, then give up.
      if (attempt < retries) {
        await sleep(delayMs * (attempt + 1))
        continue
      }
      return { ok: false, reason: 'error', message: '網路連線失敗，請稍後再試' }
    }

    if (res.ok) return { ok: true, response: res }
    lastStatus = res.status

    if (res.status === 403 || res.status === 429) {
      return { ok: false, reason: 'quota', status: res.status, message: 'Google Drive 暫時忙線（配額），請稍後再試' }
    }
    if (res.status === 404) {
      return { ok: false, reason: 'not-found', status: 404, message: '官方雲端找不到這份 PDF（連結可能已更動）' }
    }
    if (res.status >= 500 && attempt < retries) {
      await sleep(delayMs * (attempt + 1))
      continue
    }
    return { ok: false, reason: 'error', status: res.status, message: `載入失敗（${res.status}）` }
  }
  return { ok: false, reason: 'error', status: lastStatus, message: `載入失敗（${lastStatus ?? '未知'}）` }
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
