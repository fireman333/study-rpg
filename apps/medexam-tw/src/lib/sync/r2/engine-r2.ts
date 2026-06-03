// R2 push/pull adapter — bundle-level LWW with ETag optimistic concurrency.
//
// pushBundle: build snapshot → gzip → PUT with If-Match (or If-None-Match: *
//   for first push); on 412 pull-merge-retry up to 3 attempts.
// pullBundle: HEAD-then-unconditional-GET pattern. When the caller wants a
//   conditional pull AND we have a cached ETag AND force is not set, we first
//   issue HEAD to peek the server's current ETag. If it matches the cache, we
//   short-circuit with `notModified: true` and never fetch the body. Otherwise
//   we issue an unconditional GET (NO `If-None-Match` request header).
//
//   This works around a Cloudflare R2 bug: R2's S3-compatible `304 Not
//   Modified` responses omit the `Access-Control-Allow-Origin` header, so a
//   browser cross-origin request that would have legitimately received a 304
//   instead surfaces to JS as `TypeError: Failed to fetch`. The engine cannot
//   distinguish that from a real network failure → every successful cache hit
//   was being treated as a sync error. By never sending `If-None-Match` on the
//   body-fetching GET we ensure R2 never has cause to respond with 304.
//
//   404 on HEAD = blob missing (first-ever pull). HEAD failures (network, CORS
//   misconfig on HEAD method, unexpected status) log a `[sync:pullR2:<bundle>]`
//   warning and fall back to the unconditional GET path — defensive, so a
//   transient HEAD failure cannot turn into a pull error when fetching the body
//   directly would still succeed.

import type Dexie from 'dexie'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TableAdapter } from '../tables'
import {
  applyBundleSnapshot,
  buildBundleSnapshot,
  gunzipBundle,
  gzipBundle,
  type ApplyResult,
} from './bundles'
import { requestPresign, type Bundle } from './client'
import { getEtag, setEtag } from './etag'

const MAX_PUSH_RETRIES = 3
// Exponential backoff (ms) between push retries after a 412 stale-ETag.
const BACKOFF_MS = [250, 1000, 4000]

export interface PushBundleResult {
  etag: string | null
  bytes: number
  attempts: number
}

export interface PullBundleResult {
  etag: string | null
  notModified: boolean
  blobMissing: boolean
  applied: ApplyResult | null
  /** True when the response body could not be decoded as a valid gzip bundle.
   *  In this case `etag` may still be set from the response header so callers
   *  can use it for `If-Match` overwrite on a follow-up PUT. `applied` stays
   *  `null` because the corrupt body is NEVER merged into local Dexie. */
  decodeFailed?: boolean
}

export async function pushBundle(
  supabase: SupabaseClient,
  db: Dexie,
  adapters: ReadonlyArray<TableAdapter>,
  bundle: Bundle,
  userId: string,
): Promise<PushBundleResult> {
  let lastErr: unknown = null
  let lastStatus: number | null = null
  for (let attempt = 1; attempt <= MAX_PUSH_RETRIES; attempt++) {
    try {
      const snapshot = await buildBundleSnapshot(db, adapters, userId)
      const gz = await gzipBundle(snapshot)
      // Pass snapshot.meta.schema_version so the Worker can validate against
      // R2 customMetadata['schema-version'] and bake the value into the
      // presigned URL's signed `x-amz-meta-schema-version` header
      // (add-bundle-schema-version-guard P1 opt-in).
      const { url, requiredHeaders } = await requestPresign(
        supabase,
        bundle,
        'put',
        snapshot.meta.schema_version,
      )

      const headers: Record<string, string> = {
        'Content-Type': 'application/gzip',
        ...(requiredHeaders ?? {}),
      }
      const known = getEtag(bundle)
      if (known) headers['If-Match'] = known
      else headers['If-None-Match'] = '*'

      const res = await fetch(url, { method: 'PUT', headers, body: gz })

      if (res.ok) {
        const etag = res.headers.get('ETag')
        if (etag) setEtag(bundle, etag)
        return { etag, bytes: gz.size, attempts: attempt }
      }

      // 412 Precondition Failed: another device pushed first OR existing blob
      // is corrupt and our If-None-Match:* lost. Pull, merge, retry. The pull
      // also sets the etag so the retry uses If-Match for overwrite — that
      // doubles as the corrupt-blob recovery path because pullBundle now
      // extracts the ETag even when gunzip fails.
      // 409 Conflict: some R2 paths return 409 instead of 412.
      if (res.status === 412 || res.status === 409) {
        const pullResult = await pullBundle(supabase, db, adapters, bundle, { conditional: false })
        if (pullResult.decodeFailed && pullResult.etag) {
          // eslint-disable-next-line no-console
          console.info(
            `[sync:pushR2:${bundle}] recovered from corrupt blob via overwrite (preparing If-Match retry, etag ${pullResult.etag})`,
          )
        }
        lastStatus = res.status
        const backoff = BACKOFF_MS[attempt - 1] ?? 4000
        await sleep(backoff)
        continue
      }

      // First-push race: If-None-Match: * lost. Same recovery as 412.
      if (res.status === 428 && !known) {
        const pullResult = await pullBundle(supabase, db, adapters, bundle, { conditional: false })
        if (pullResult.decodeFailed && pullResult.etag) {
          // eslint-disable-next-line no-console
          console.info(
            `[sync:pushR2:${bundle}] recovered from corrupt blob via overwrite (preparing If-Match retry, etag ${pullResult.etag})`,
          )
        }
        lastStatus = res.status
        const backoff = BACKOFF_MS[attempt - 1] ?? 4000
        await sleep(backoff)
        continue
      }

      const body = await res.text().catch(() => '')
      throw new Error(`r2_push_${res.status}: ${body.slice(0, 200)}`)
    } catch (err) {
      lastErr = err
      // Network errors bubble up after retry budget. Don't retry CORS / auth
      // failures here — they won't get better.
      if (isUnrecoverable(err)) throw err
      if (attempt >= MAX_PUSH_RETRIES) break
      await sleep(BACKOFF_MS[attempt - 1] ?? 4000)
    }
  }
  // If the last attempt was a 412 with a recovered ETag in scope but we still
  // could not write, a real concurrent writer (or another corrupt-blob loop)
  // is winning. Surface that distinctly from real network failures so logs
  // are grep-able.
  if (lastStatus === 412 || lastStatus === 409) {
    throw new Error(`r2_blob_concurrent_writer_exhausted: ${bundle}`)
  }
  throw new Error(
    `r2_push_exhausted: ${(lastErr as { message?: string })?.message ?? 'unknown'}`,
  )
}

export async function pullBundle(
  supabase: SupabaseClient,
  db: Dexie,
  adapters: ReadonlyArray<TableAdapter>,
  bundle: Bundle,
  opts?: { conditional?: boolean; force?: boolean },
): Promise<PullBundleResult> {
  const { url } = await requestPresign(supabase, bundle, 'get')

  // HEAD probe applies only when the caller wants a conditional pull, isn't
  // forcing, and we have a cached ETag to compare against. Otherwise skip to
  // the unconditional GET below — no `If-None-Match` header, so R2 cannot
  // respond with 304 (whose missing-CORS-header bug is the reason for this
  // whole pattern).
  const conditional = opts?.conditional !== false
  const force = opts?.force === true
  const cachedEtag = conditional && !force ? getEtag(bundle) : null

  if (cachedEtag) {
    try {
      const headRes = await fetch(url, { method: 'HEAD' })
      if (headRes.status === 404) {
        return { etag: null, notModified: false, blobMissing: true, applied: null }
      }
      if (headRes.ok) {
        const serverEtag = headRes.headers.get('ETag')
        if (serverEtag && serverEtag === cachedEtag) {
          return { etag: cachedEtag, notModified: true, blobMissing: false, applied: null }
        }
        // ETag differs or absent — fall through to unconditional GET.
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[sync:pullR2:${bundle}] HEAD probe returned ${headRes.status}, falling back to unconditional GET`,
        )
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[sync:pullR2:${bundle}] HEAD probe failed, falling back to unconditional GET: ${
          (err as { message?: string })?.message ?? 'unknown'
        }`,
      )
    }
  }

  const res = await fetch(url, { method: 'GET' })

  if (res.status === 404) {
    return { etag: null, notModified: false, blobMissing: true, applied: null }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`r2_pull_${res.status}: ${body.slice(0, 200)}`)
  }

  const blob = await res.blob()
  const etag = res.headers.get('ETag')

  // Try to decode the gzip body. A corrupt blob (e.g., a stray non-gzip byte
  // left over from a smoke test, or a truncated upload) MUST NOT crash the
  // engine — we still extract the ETag from the response header so callers
  // can use `If-Match: <etag>` to overwrite the corrupt blob on a follow-up
  // PUT, and we return `decodeFailed: true` so callers can log the recovery.
  // The corrupt body is NEVER merged into local Dexie.
  let snapshot: Awaited<ReturnType<typeof gunzipBundle>>
  try {
    snapshot = await gunzipBundle(blob)
  } catch {
    if (etag) setEtag(bundle, etag)
    return { etag, notModified: false, blobMissing: false, applied: null, decodeFailed: true }
  }

  if (etag) setEtag(bundle, etag)

  const applied = await applyBundleSnapshot(db, adapters, snapshot, { force: opts?.force })
  return { etag, notModified: false, blobMissing: false, applied }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isUnrecoverable(err: unknown): boolean {
  const msg = ((err as { message?: string })?.message ?? '').toLowerCase()
  if (msg.includes('presign_no_session')) return true
  if (msg.includes('presign_failed_401')) return true
  if (msg.includes('presign_failed_403')) return true
  return false
}
