// R2 push/pull adapter — bundle-level LWW with ETag optimistic concurrency.
//
// pushBundle: build snapshot → gzip → PUT with If-Match (or If-None-Match: *
//   for first push); on 412 pull-merge-retry up to 3 attempts.
// pullBundle: GET (conditional with If-None-Match if opts.conditional), 304
//   short-circuits, 404 = no blob yet, otherwise decompress + applyToLocal.

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
}

export async function pushBundle(
  supabase: SupabaseClient,
  db: Dexie,
  adapters: ReadonlyArray<TableAdapter>,
  bundle: Bundle,
  userId: string,
): Promise<PushBundleResult> {
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= MAX_PUSH_RETRIES; attempt++) {
    try {
      const snapshot = await buildBundleSnapshot(db, adapters, userId)
      const gz = await gzipBundle(snapshot)
      const { url } = await requestPresign(supabase, bundle, 'put')

      const headers: Record<string, string> = {
        'Content-Type': 'application/gzip',
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

      // 412 Precondition Failed: another device pushed first. Pull, merge, retry.
      // 409 Conflict: some R2 paths return 409 instead of 412.
      if (res.status === 412 || res.status === 409) {
        await pullBundle(supabase, db, adapters, bundle, { conditional: false })
        const backoff = BACKOFF_MS[attempt - 1] ?? 4000
        await sleep(backoff)
        continue
      }

      // First-push race: If-None-Match: * lost. Same recovery as 412.
      if (res.status === 428 && !known) {
        await pullBundle(supabase, db, adapters, bundle, { conditional: false })
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
  const headers: Record<string, string> = {}
  if (opts?.conditional) {
    const known = getEtag(bundle)
    if (known) headers['If-None-Match'] = known
  }

  const res = await fetch(url, { method: 'GET', headers })

  if (res.status === 304) {
    return { etag: getEtag(bundle), notModified: true, blobMissing: false, applied: null }
  }
  if (res.status === 404) {
    return { etag: null, notModified: false, blobMissing: true, applied: null }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`r2_pull_${res.status}: ${body.slice(0, 200)}`)
  }

  const blob = await res.blob()
  const snapshot = await gunzipBundle(blob)
  const etag = res.headers.get('ETag')
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
