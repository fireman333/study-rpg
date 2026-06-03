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
  /** Headers the client MUST include verbatim on the subsequent PUT to R2,
   *  baked into the SigV4 signature scope by the Worker. Only populated when
   *  the Worker enforced schema_version (P1 opt-in, A1). Omitting or altering
   *  any header here causes R2 to reject the PUT with 403 SignatureDoesNotMatch. */
  requiredHeaders?: Record<string, string>
}

// Treat empty / whitespace / trailing-slash as unset or normalize. GitHub
// Actions exposes `${{ secrets.X }}` as "" when the secret is undefined,
// which would otherwise override the prod default with a broken empty URL.
// Cloudflare Pages dashboard env vars sometimes copy with stray whitespace,
// and "https://api.med-study-rpg.com/" + "/presign" → double slash.
const WORKER_URL_RAW = import.meta.env.VITE_SYNC_WORKER_URL as string | undefined
const WORKER_URL_TRIMMED = (WORKER_URL_RAW ?? '').trim().replace(/\/+$/, '')
const WORKER_URL =
  WORKER_URL_TRIMMED.length > 0
    ? WORKER_URL_TRIMMED
    : 'https://study-rpg-sync-worker.tony85314.workers.dev'

// Cache presigned URLs within their TTL minus a 60s safety margin so we don't
// burn a Worker request on every push/pull when a recent URL would do.
// PUT presigns are also keyed by schemaVersion because the signed metadata
// header (x-amz-meta-schema-version) is baked into the URL signature — a URL
// minted for SV=4 cannot be reused for a SV=5 push.
const cache = new Map<string, PresignResult>()

function cacheKey(bundle: Bundle, op: PresignOp, schemaVersion: number | null): string {
  return op === 'put' && schemaVersion != null
    ? `${bundle}:put:sv=${schemaVersion}`
    : `${bundle}:${op}`
}

export function clearPresignCache(): void {
  cache.clear()
}

export async function requestPresign(
  supabase: SupabaseClient,
  bundle: Bundle,
  op: PresignOp,
  schemaVersion?: number,
): Promise<PresignResult> {
  // Only send schema_version on PUT — Worker ignores it on GET anyway.
  const sv = op === 'put' && typeof schemaVersion === 'number' ? schemaVersion : null
  const key = cacheKey(bundle, op, sv)
  const cached = cache.get(key)
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw new Error(`presign_no_session: ${error.message}`)
  if (!session?.access_token) throw new Error('presign_no_session')

  const body: { bundle: Bundle; op: PresignOp; schema_version?: number } = { bundle, op }
  if (sv != null) body.schema_version = sv

  const res = await fetch(`${WORKER_URL}/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  // 409 = Worker refused SV downgrade (add-bundle-schema-version-guard).
  // Distinct from 409 returned by R2 on PUT (concurrent writer); engine-r2
  // pushBundle's retry path covers the latter, this branch surfaces a
  // server-confirmed downgrade so callers can distinguish it from the
  // existing client-side `r2_schema_downgrade_refused` log line.
  if (res.status === 409) {
    let cloud: unknown
    let incoming: unknown
    try {
      const parsed = (await res.json()) as { cloud?: unknown; incoming?: unknown }
      cloud = parsed.cloud
      incoming = parsed.incoming
    } catch {
      // body unparseable, leave undefined
    }
    throw new Error(
      `r2_schema_downgrade_refused_by_server: cloud=${cloud ?? '?'} incoming=${incoming ?? '?'} bundle=${bundle}`,
    )
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`presign_failed_${res.status}: ${text.slice(0, 200)}`)
  }

  const result = (await res.json()) as PresignResult
  cache.set(key, result)
  return result
}

export function getWorkerUrl(): string {
  return WORKER_URL
}
