// Push/pull bundle to R2 with ETag-based optimistic concurrency.
//
// Mirrors the medexam-tw engine-r2 pattern (HEAD-then-GET to dodge R2's CORS
// 304 bug; If-Match for overwrite, If-None-Match:* for first push; 412 retry
// loop with exponential backoff).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NeuronsDB } from '../../db'
import {
  applyBundleSnapshot,
  buildBundleSnapshot,
  gunzipBundle,
  gzipBundle,
  type ApplyResult,
  type BundleSnapshot,
} from './bundles'
import { requestPresign } from './client'
import { getEtag, setEtag, clearEtag, refreshEtagFromStore } from './etag'
import { withPushLock } from './push-lock'
import { honorResetMarker } from '../account-guard'

const MAX_PUSH_RETRIES = 3
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
  /** Parsed bundle snapshot, present when GET succeeded and gunzip decoded. */
  snapshot?: BundleSnapshot
  decodeFailed?: boolean
}

export async function pushBundle(
  supabase: SupabaseClient,
  db: NeuronsDB,
  userId: string,
  opts?: {
    /**
     * Replace the Dexie-derived snapshot (add-neurons-account-reset): the
     * reset flow pushes a constant empty bundle carrying `reset_at` instead
     * of snapshotting local data. Re-invoked per attempt like the default
     * builder so the retry loop semantics stay identical.
     */
    snapshotOverride?: () => Promise<BundleSnapshot> | BundleSnapshot
  },
): Promise<PushBundleResult> {
  let lastErr: unknown = null
  let lastStatus: number | null = null

  for (let attempt = 1; attempt <= MAX_PUSH_RETRIES; attempt++) {
    try {
      const snapshot = opts?.snapshotOverride
        ? await opts.snapshotOverride()
        : await buildBundleSnapshot(db)
      const gz = await gzipBundle(snapshot)
      // Pass snapshot.meta.schema_version so the Worker can validate against
      // R2 customMetadata['schema-version'] and bake the value into the
      // presigned URL's signed `x-amz-meta-schema-version` header
      // (add-bundle-schema-version-guard P1 opt-in).
      const { url, requiredHeaders } = await requestPresign(
        supabase,
        'put',
        snapshot.meta.schema_version,
      )

      const headers: Record<string, string> = {
        'Content-Type': 'application/gzip',
        ...(requiredHeaders ?? {}),
      }
      const known = getEtag(userId)
      if (known) headers['If-Match'] = known
      else headers['If-None-Match'] = '*'

      const res = await fetch(url, { method: 'PUT', headers, body: gz })

      if (res.ok) {
        const etag = res.headers.get('ETag')
        // Push-path 200: persist immediately — the just-uploaded snapshot IS
        // local truth, so there is no un-merged-state race (cf. the pull path).
        if (etag) setEtag(userId, etag)
        return { etag, bytes: gz.size, attempts: attempt }
      }

      if (res.status === 412 || res.status === 409) {
        await pullBundle(supabase, db, userId, { conditional: false })
        lastStatus = res.status
        await sleep(BACKOFF_MS[attempt - 1] ?? 4000)
        continue
      }

      if (res.status === 428 && !known) {
        await pullBundle(supabase, db, userId, { conditional: false })
        lastStatus = res.status
        await sleep(BACKOFF_MS[attempt - 1] ?? 4000)
        continue
      }

      const body = await res.text().catch(() => '')
      throw new Error(`r2_push_${res.status}: ${body.slice(0, 200)}`)
    } catch (err) {
      lastErr = err
      if (isUnrecoverable(err)) throw err
      if (attempt >= MAX_PUSH_RETRIES) break
      await sleep(BACKOFF_MS[attempt - 1] ?? 4000)
    }
  }

  if (lastStatus === 412 || lastStatus === 409) {
    throw new Error('r2_blob_concurrent_writer_exhausted: neurons')
  }
  throw new Error(
    `r2_push_exhausted: ${(lastErr as { message?: string })?.message ?? 'unknown'}`,
  )
}

/**
 * Serialized R2 push (port-neurons-r2-single-flight-push S1/S2). Runs
 * `pushBundle` under the per-user push lock (`withPushLock`), refreshing the
 * persisted ETag from localStorage FIRST so a serialized writer — especially a
 * second tab — sends `If-Match: <fresh>` instead of a stale in-memory value
 * that 412s. BOTH R2 PUT call sites route through this helper: the sync engine's
 * debounced / manual push AND the account-reset bundle push. Keeping them on one
 * helper prevents the two sites from drifting (cf. 二階's `pushAllNow`, which
 * first shipped missing the ETag refresh — codex F4).
 */
export function pushBundleSerialized(
  supabase: SupabaseClient,
  db: NeuronsDB,
  userId: string,
  opts?: Parameters<typeof pushBundle>[3],
): Promise<PushBundleResult> {
  return withPushLock(userId, () => {
    refreshEtagFromStore(userId)
    return pushBundle(supabase, db, userId, opts)
  })
}

export async function pullBundle(
  supabase: SupabaseClient,
  db: NeuronsDB,
  userId: string,
  opts?: { conditional?: boolean; force?: boolean },
): Promise<PullBundleResult> {
  const { url } = await requestPresign(supabase, 'get')

  const conditional = opts?.conditional !== false
  const force = opts?.force === true
  const cachedEtag = conditional && !force ? getEtag(userId) : null

  if (cachedEtag) {
    try {
      const headRes = await fetch(url, { method: 'HEAD' })
      if (headRes.status === 404) {
        // Server blob gone (deleted / reset): drop the stale etag so the
        // retry push falls back to If-None-Match:* instead of looping 412.
        clearEtag(userId)
        return { etag: null, notModified: false, blobMissing: true, applied: null }
      }
      if (headRes.ok) {
        const serverEtag = headRes.headers.get('ETag')
        if (serverEtag && serverEtag === cachedEtag) {
          return { etag: cachedEtag, notModified: true, blobMissing: false, applied: null }
        }
      } else {
        console.warn(
          `[sync:pullR2:neurons] HEAD ${headRes.status}, falling back to unconditional GET`,
        )
      }
    } catch (err) {
      console.warn(
        `[sync:pullR2:neurons] HEAD failed, falling back to unconditional GET: ${
          (err as { message?: string })?.message ?? 'unknown'
        }`,
      )
    }
  }

  const res = await fetch(url, { method: 'GET' })

  if (res.status === 404) {
    // Server blob gone (deleted / reset): drop the stale etag (see HEAD-404).
    clearEtag(userId)
    return { etag: null, notModified: false, blobMissing: true, applied: null }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`r2_pull_${res.status}: ${body.slice(0, 200)}`)
  }

  const blob = await res.blob()
  const etag = res.headers.get('ETag')

  let snapshot: Awaited<ReturnType<typeof gunzipBundle>>
  try {
    snapshot = await gunzipBundle(blob)
  } catch {
    // Corrupt-blob recovery: keep the etag so the next push can If-Match
    // overwrite the bad blob. No snapshot was merged.
    if (etag) setEtag(userId, etag)
    return { etag, notModified: false, blobMissing: false, applied: null, decodeFailed: true }
  }

  // Reset-propagation gate (add-neurons-account-reset) — see honorResetMarker.
  await honorResetMarker(db, snapshot.meta.reset_at)

  const applied = await applyBundleSnapshot(db, snapshot)

  // D2 (reduce-r2-412-storm): persist the pulled etag ONLY AFTER the snapshot
  // is merged into Dexie — never before. Publishing it pre-apply would let a
  // concurrent tab PUT with this etag while its local state is still un-merged,
  // bypassing whole-bundle conflict detection and overwriting newer cloud rows.
  if (etag) setEtag(userId, etag)

  return { etag, notModified: false, blobMissing: false, applied, snapshot }
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
