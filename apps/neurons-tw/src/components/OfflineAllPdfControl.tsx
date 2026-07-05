/**
 * OfflineAllPdfControl — the「全部下載供離線」action for原始詳解 PDF (add-neurons-pdf-drive-autofetch,
 * task 5.3). Fetches every booklet in the committed manifest from the publisher's Drive and caches it
 * on the device, so later opens work offline. Completion is derived from the byte-store's cached list
 * vs the manifest (no schema table); the player's preference rides the existing key-value `meta` store.
 *
 * Failures never block: a per-booklet error is counted and surfaced; the rest still cache.
 *
 * Edge-throttle hardening (fix-neurons-pdf-edge-throttle): booklets are now fetched as ONE whole-file
 * request each (no Range chunking — that amplified the per-IP request burst that trips Google's edge
 * abuse throttle). The bulk run paces between booklets, and when it detects a SUSPECTED edge throttle
 * (a CORS-masked Drive failure while the player's own origin is still reachable) it stops the queue
 * and persists a progressive cooldown instead of hammering Drive. Already-cached booklets are kept, so
 * re-running later resumes (skips the cached ones).
 *
 * Mobile-Safari durability (fix-neurons-offline-pdf-progress): the full set is ~250 MB–1.5 GB (one
 * booklet is 123 MB), and the Cache API is best-effort, evictable storage. The progress counter
 * distinguishes downloaded vs skipped vs failed, and an out-of-space (quota) failure is classified
 * distinctly; persistent storage is requested up front to reduce eviction.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { loadBookletLinks, type BookletLinkMap } from '../platform/manifest'
import { EmojiIcon } from './EmojiIcon'
import { byteStore } from '../platform/byteStore'
import { fetchBooklet, parseResourceKey, diagnoseDrive, isCorsMaskedError, isSuspectedEdgeThrottle } from '../platform/driveFetch'
import { getCooldownUntil, recordThrottleStrike, noteDriveSuccess } from '../platform/pdfCooldown'
import { db } from '../lib/db'

const META_KEY = 'pdfOfflineAll'
/** Inter-booklet spacing so a full run never bursts at one egress IP (each file is now ONE request). */
const PACE_BASE_MS = 4000
const PACE_JITTER_MS = 2000

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const paceMs = (): number => PACE_BASE_MS + Math.floor(Math.random() * PACE_JITTER_MS)
function formatClock(until: number): string {
  try {
    return new Date(until).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

interface LiveProgress {
  checked: number
  total: number
  downloaded: number
  skipped: number
}
interface RunResult {
  downloaded: number
  skipped: number
  failedNet: number
  failedSpace: number
  /** True when the run stopped early because a Drive edge throttle was suspected. */
  throttled?: boolean
  /** First failure's stage + error, surfaced so a stuck device can be diagnosed from a screenshot. */
  firstError?: string
}

/** Best-effort: ask the browser to keep this origin's storage from being evicted. Harmless if denied
 * (Safari grants on its own heuristics) or unsupported. Returns the resulting persisted state. */
async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) return false
    if (await navigator.storage.persisted?.()) return true
    return (await navigator.storage.persist?.()) ?? false
  } catch {
    return false
  }
}

/** Best-effort remaining cache budget, in bytes, or null if unknown. */
async function estimateRemaining(): Promise<number | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return quota > 0 ? Math.max(0, quota - usage) : null
  } catch {
    return null
  }
}

function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.code === 22 || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

/** Cache one response + verify it landed. Classifies the outcome so the bulk loop stays flat. */
type PutOutcome = { r: 'landed' | 'space' | 'unconfirmed' | 'error'; err?: unknown }
async function tryPut(key: string, response: Response): Promise<PutOutcome> {
  try {
    await byteStore.put(key, response)
    // Verify the write landed — on iOS a large booklet can fail to persist without a thrown error.
    return { r: (await byteStore.get(key)) ? 'landed' : 'unconfirmed' }
  } catch (err) {
    return { r: isQuotaError(err) ? 'space' : 'error', err }
  }
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`
  return `${Math.round(n / 1e3)} KB`
}

export function OfflineAllPdfControl(): JSX.Element {
  const [links, setLinks] = useState<BookletLinkMap | null>(null)
  const [cached, setCached] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<LiveProgress | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  // Active edge-throttle cooldown end (epoch ms), or 0. Bulk hard-respects it.
  const [cooldownUntil, setCooldownUntil] = useState<number>(0)
  // First failure surfaced LIVE during the run — the completion summary can be minutes away when
  // every booklet fails, so the player must be able to see the cause without waiting for the end.
  const [liveError, setLiveError] = useState('')
  // Connectivity diagnostic matrix — demoted to a secondary affordance shown only on failure.
  const [diag, setDiag] = useState<string[] | null>(null)
  const [diagBusy, setDiagBusy] = useState(false)

  async function refreshCachedCount(map: BookletLinkMap): Promise<void> {
    try {
      const keys = new Set(await byteStore.list())
      setCached(Object.keys(map).filter((k) => keys.has(k)).length)
    } catch {
      setCached(0)
    }
  }

  useEffect(() => {
    let alive = true
    loadBookletLinks().then((l) => {
      if (!alive || !l) return
      setLinks(l)
      void refreshCachedCount(l)
    })
    void estimateRemaining().then((r) => {
      if (alive) setRemaining(r)
    })
    void getCooldownUntil().then((u) => {
      if (alive) setCooldownUntil(u)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!links) return <p style={hintStyle}>載入清單中…</p>
  const total = Object.keys(links).length
  const allCached = total > 0 && cached >= total
  const coolingDown = cooldownUntil > Date.now()

  async function downloadAll(): Promise<void> {
    if (!links) return
    // Bulk HARD-respects an active edge-throttle cooldown — don't issue any Drive request.
    const until = await getCooldownUntil()
    if (until > Date.now()) {
      setCooldownUntil(until)
      setResult(null)
      setLiveError('')
      return
    }
    setCooldownUntil(0)
    setBusy(true)
    setResult(null)
    setLiveError('')
    // User-gesture-triggered: ask the browser to keep these PDFs from being evicted.
    await requestPersistentStorage()
    try {
      await db.meta.put({ key: META_KEY, value: '1' })
    } catch {
      /* preference persistence is best-effort */
    }
    const keys = Object.keys(links)
    let downloaded = 0
    let skipped = 0
    let failedNet = 0
    let failedSpace = 0
    let throttled = false
    let networkFetches = 0
    let corsMaskedFailures = 0
    let firstError = ''
    const note = (stage: string, err?: unknown): void => {
      if (firstError) return
      const name = err instanceof Error ? err.name || 'Error' : ''
      const msg = err instanceof Error ? err.message : err != null ? String(err) : ''
      firstError = `${stage}${name ? ` ${name}` : ''}${msg ? `: ${msg}` : ''}`.slice(0, 90)
      setLiveError(firstError) // surface it immediately, mid-run
    }
    for (let i = 0; i < keys.length; i++) {
      setProgress({ checked: i, total: keys.length, downloaded, skipped })
      const key = keys[i]
      const link = links[key]
      // Skip booklets already cached (fast — no network).
      try {
        if (await byteStore.get(key)) {
          skipped += 1
          continue
        }
      } catch {
        /* treat as uncached → re-fetch */
      }
      // Pace between consecutive NETWORK fetches (cache-skips above don't count).
      if (networkFetches > 0) await sleep(paceMs())
      networkFetches += 1
      const res = await fetchBooklet(link.driveFileId, parseResourceKey(link.viewUrl))
      if (!res.ok) {
        // Suspected Google per-IP edge throttle? Gate the (origin-probing) classifier behind a strike
        // count so one transient blip doesn't trigger a cooldown: only after a prior success this run,
        // or a 2nd CORS-masked failure. If confirmed → stop the queue + persist a cooldown, no retry.
        if (res.reason === 'error' && isCorsMaskedError(res.detail)) {
          corsMaskedFailures += 1
          if ((downloaded > 0 || corsMaskedFailures >= 2) && (await isSuspectedEdgeThrottle(res))) {
            const cd = await recordThrottleStrike()
            throttled = true
            setCooldownUntil(cd)
            break
          }
        }
        failedNet += 1
        // `抓取 <reason> <detail>` — the detail distinguishes a CORS-masked throttle ("Load failed")
        // from a quota 403 ("HTTP 403") or link-rot ("HTTP 404").
        note(`抓取 ${res.reason}${res.detail ? ` ${res.detail}` : ''}`)
        continue
      }
      // Cache the real response — clone keeps memory low (a whole 123 MB .blob() pressures iOS); fall
      // back to a buffered clean-200 Blob only if the direct put fails non-terminally.
      let put = await tryPut(key, res.response.clone())
      if (put.r === 'error' || put.r === 'unconfirmed') {
        try {
          const blob = await res.response.blob()
          put = await tryPut(key, new Response(blob, { headers: { 'content-type': 'application/pdf' } }))
        } catch (err) {
          put = { r: isQuotaError(err) ? 'space' : 'error', err }
        }
      }
      if (put.r === 'landed') {
        downloaded += 1
        void noteDriveSuccess()
      } else if (put.r === 'space') {
        failedSpace += 1
        note('空間不足', put.err)
      } else if (put.r === 'unconfirmed') {
        failedSpace += 1
        note('寫入快取未落地')
      } else {
        failedNet += 1
        note('寫入快取', put.err)
      }
    }
    setProgress({ checked: keys.length, total: keys.length, downloaded, skipped })
    setResult({ downloaded, skipped, failedNet, failedSpace, throttled, firstError: firstError || undefined })
    setBusy(false)
    await refreshCachedCount(links)
    setRemaining(await estimateRemaining())
  }

  async function runDiag(): Promise<void> {
    if (!links) return
    setDiagBusy(true)
    setDiag(null)
    const entries = Object.entries(links)
    const plain = entries.find(([, v]) => !/resourcekey=/.test(v.viewUrl))
    const rk = entries.find(([, v]) => /resourcekey=/.test(v.viewUrl))
    try {
      const out = await diagnoseDrive({
        plainFileId: plain?.[1].driveFileId,
        rkFileId: rk?.[1].driveFileId,
        resourceKey: rk ? parseResourceKey(rk[1].viewUrl) : undefined,
      })
      setDiag(out)
    } catch (e) {
      setDiag([`診斷執行失敗：${String(e)}`])
    }
    setDiagBusy(false)
  }

  // Demote the connectivity diagnostic to a secondary affordance: only offer it once a download has
  // actually failed / been throttled (it served its first-diagnosis purpose; not a standing control).
  const showDiag = !busy && (coolingDown || (result != null && (result.failedNet > 0 || result.throttled)))

  return (
    <div style={wrapStyle}>
      <button type="button" style={btnStyle} onClick={downloadAll} disabled={busy || coolingDown}>
        {busy ? '下載中…' : allCached ? '✓ 已全部下載' : coolingDown ? '⏸ 已暫停（Drive 限流）' : '⬇ 全部下載供離線'}
      </button>
      <span style={statusStyle}>
        {busy && progress
          ? `檢查 ${progress.checked}/${progress.total} · 本次下載 ${progress.downloaded}・略過已快取 ${progress.skipped}`
          : `已快取 ${cached} / ${total} 份`}
      </span>
      {busy && liveError && <span style={warnStyle}>首個失敗：{liveError}</span>}
      {coolingDown && (
        <span style={warnStyle}>
          Google Drive 暫時限制大量下載，已暫停；已完成的 {cached} 份仍可離線看。約 {formatClock(cooldownUntil)} 後可再按「全部下載供離線」續跑（會自動跳過已下載的）。也可改用單份開啟時的官方連結。
        </span>
      )}
      {!busy && result && !result.throttled && (result.failedSpace > 0 || result.failedNet > 0) && (
        <span style={warnStyle}>
          {result.failedSpace > 0
            ? `儲存空間不足，${result.failedSpace} 份未能快取——手機 / Safari 對網頁可用空間有限。${
                remaining != null ? `目前約剩 ${formatBytes(remaining)}。` : ''
              }可改用桌機瀏覽器，或清出空間後再試；已下載的 ${result.downloaded + result.skipped} 份仍可離線看。`
            : `${result.failedNet} 份下載失敗，稍後可再試。`}
          {result.firstError ? `（首個失敗：${result.firstError}）` : ''}
        </span>
      )}
      {!busy && !result && !allCached && !coolingDown && (
        <span style={hintStyle}>全部約需數百 MB 至 1 GB；手機空間有限時可能無法全部存下，仍可在開啟單份時即時載入。</span>
      )}
      {/* Connectivity diagnostic — demoted: only offered after a failure / throttle. */}
      {showDiag && (
        <div style={{ flexBasis: '100%', marginTop: '0.3rem' }}>
          <button type="button" style={diagBtnStyle} onClick={runDiag} disabled={diagBusy || busy}>
            {diagBusy ? '診斷中…' : (<><EmojiIcon char="🔍" size={13} decorative /> 診斷連線（下載一直失敗時點這）</>)}
          </button>
          {diag && (
            <div style={diagBoxStyle}>
              {diag.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div style={{ marginTop: '0.3rem', color: '#6a5a45' }}>
                A=非Google跨域 · B=Drive小範圍 · C=Drive+特殊標頭。把這幾行截圖回報即可定位。
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const wrapStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }
const btnStyle: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid #9bb37f',
  borderRadius: '4px',
  background: '#dfe9cf',
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.82rem',
  fontWeight: 700,
  padding: '0.3rem 0.6rem',
}
const statusStyle: CSSProperties = { fontSize: '0.78rem', color: '#6a5a45', fontFamily: 'var(--font-legible)' }
const warnStyle: CSSProperties = {
  flexBasis: '100%',
  fontSize: '0.76rem',
  color: '#8a3b2a',
  fontFamily: 'var(--font-legible)',
  lineHeight: 1.5,
}
const hintStyle: CSSProperties = { fontSize: '0.78rem', color: '#6a5a45', fontFamily: 'var(--font-legible)', lineHeight: 1.5 }
const diagBtnStyle: CSSProperties = {
  cursor: 'pointer',
  border: '1px dashed #b7a07f',
  borderRadius: '4px',
  background: '#f3ece0',
  color: '#5a4a35',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.78rem',
  padding: '0.25rem 0.5rem',
}
const diagBoxStyle: CSSProperties = {
  marginTop: '0.4rem',
  padding: '0.5rem 0.6rem',
  background: '#fbf7ee',
  border: '1px solid #d8c8a8',
  borderRadius: '4px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: '0.76rem',
  lineHeight: 1.7,
  color: '#3a2a1a',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
}
