// R2 client — Worker presign + URL caching.
//
// Calls the study-rpg-sync-worker /presign endpoint with the user's Supabase
// JWT to obtain short-lived presigned R2 URLs scoped to the JWT's `sub`.
// The Worker enforces tenancy at signing time (Decision 4 in design.md).

import type { SupabaseClient } from '@supabase/supabase-js'

export type Bundle = 'm1' | 'm2' | 'bookmarks'
export type PresignOp = 'put' | 'get'

export interface PresignResult {
  url: string
  expiresAt: number  // epoch ms
}

const WORKER_URL = (import.meta.env.VITE_SYNC_WORKER_URL as string | undefined) ??
  'https://study-rpg-sync-worker.tony85314.workers.dev'

// Cache presigned URLs within their TTL minus a 60s safety margin so we don't
// burn a Worker request on every push/pull when a recent URL would do.
const cache = new Map<string, PresignResult>()

function cacheKey(bundle: Bundle, op: PresignOp): string {
  return `${bundle}:${op}`
}

export function clearPresignCache(): void {
  cache.clear()
}

export async function requestPresign(
  supabase: SupabaseClient,
  bundle: Bundle,
  op: PresignOp,
): Promise<PresignResult> {
  const key = cacheKey(bundle, op)
  const cached = cache.get(key)
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw new Error(`presign_no_session: ${error.message}`)
  if (!session?.access_token) throw new Error('presign_no_session')

  const res = await fetch(`${WORKER_URL}/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ bundle, op }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`presign_failed_${res.status}: ${body.slice(0, 200)}`)
  }

  const result = (await res.json()) as PresignResult
  cache.set(key, result)
  return result
}

export function getWorkerUrl(): string {
  return WORKER_URL
}
