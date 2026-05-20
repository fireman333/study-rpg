// R2 account-lifecycle cleanup — wraps Worker /reset + /delete-account
// endpoints so the client can wipe all of a user's R2 blobs alongside
// the Supabase RPCs (delete_my_data / delete_my_account).
//
// Worker endpoints (cloudflare/sync-worker/src/delete.ts):
//   POST /reset           → list+delete `users/<sub>/*` in R2 PRIMARY
//   POST /delete-account  → same handler; semantic difference is client-side
//
// Both endpoints require a valid Supabase JWT. The Worker derives the
// `user_id` (= R2 path prefix) from the JWT `sub` claim, so the client
// CANNOT request another user's cleanup even by forging a request body.

import type { SupabaseClient } from '@supabase/supabase-js'
import { clearPresignCache, getWorkerUrl } from './client'
import { clearAllEtags } from './etag'

export type CleanupOp = 'reset' | 'delete-account'

export interface CleanupResult {
  deleted: number
  user: string
}

export async function requestR2Cleanup(
  supabase: SupabaseClient,
  op: CleanupOp,
): Promise<CleanupResult> {
  const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
  if (sessionErr) throw new Error(`r2_cleanup_no_session: ${sessionErr.message}`)
  if (!session?.access_token) throw new Error('r2_cleanup_no_session')

  const path = op === 'reset' ? '/reset' : '/delete-account'
  const res = await fetch(`${getWorkerUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`r2_cleanup${path}_${res.status}: ${body.slice(0, 200)}`)
  }

  // Worker returns { r2: 'ok', deleted: N, user: '<sub>' }
  const payload = (await res.json()) as { deleted?: number; user?: string }

  // Drop client-side caches so subsequent push/pull start fresh against
  // the now-empty R2 prefix.
  clearAllEtags()
  clearPresignCache()

  return {
    deleted: payload.deleted ?? 0,
    user: payload.user ?? session.user.id,
  }
}
