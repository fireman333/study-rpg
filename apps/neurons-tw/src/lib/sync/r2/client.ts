// R2 client — Worker presign caller for neurons-tw.
//
// Bundle name is fixed to 'neurons' (the Worker whitelists it per
// cloudflare/sync-worker/src/presign.ts BUNDLES). The Worker enforces
// tenancy at signing time using the JWT `sub` claim — body fields are
// ignored. R2 key on the server side: users/<jwt.sub>/neurons-snapshot.json.gz

import type { SupabaseClient } from '@supabase/supabase-js'

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

const WORKER_URL_RAW = import.meta.env.VITE_SYNC_WORKER_URL as string | undefined
const WORKER_URL_TRIMMED = (WORKER_URL_RAW ?? '').trim().replace(/\/+$/, '')
const WORKER_URL =
  WORKER_URL_TRIMMED.length > 0
    ? WORKER_URL_TRIMMED
    : 'https://api.med-study-rpg.com'

const BUNDLE_NAME = 'neurons' as const
export type Bundle = typeof BUNDLE_NAME

// Build identifier sent to the Worker so a throttled request can be attributed
// to a client version — the 07-13 storm was diagnosed only by rate SIGNATURE
// (old bundle ~7–431 req/min vs new bundle ~7/min ceiling), which is inference,
// not proof. The Worker logs this on its throttle path only, so it costs no
// extra log volume. Deliberately a BODY field, NOT a custom header: a custom
// cross-origin header triggers a CORS preflight OPTIONS on every /presign,
// doubling exactly the Worker request count this whole effort exists to cut.
// Absent in dev / when unset → omitted (the Worker treats it as optional).
const BUILD_ID = (import.meta.env.VITE_COMMIT_SHA as string | undefined)?.slice(0, 12)

// PUT presigns are keyed by schemaVersion because the signed metadata header
// (x-amz-meta-schema-version) is baked into the URL signature — a URL minted
// for SV=N cannot be reused for a SV=N+1 push (add-bundle-schema-version-guard P1).
const cache = new Map<string, PresignResult>()

function cacheKey(op: PresignOp, schemaVersion: number | null): string {
  return op === 'put' && schemaVersion != null ? `put:sv=${schemaVersion}` : op
}

export function clearPresignCache(): void {
  cache.clear()
}

export async function requestPresign(
  supabase: SupabaseClient,
  op: PresignOp,
  schemaVersion?: number,
): Promise<PresignResult> {
  const sv = op === 'put' && typeof schemaVersion === 'number' ? schemaVersion : null
  const key = cacheKey(op, sv)
  const cached = cache.get(key)
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw new Error(`presign_no_session: ${error.message}`)
  if (!session?.access_token) throw new Error('presign_no_session')

  const body: {
    bundle: typeof BUNDLE_NAME
    op: PresignOp
    schema_version?: number
    build?: string
  } = {
    bundle: BUNDLE_NAME,
    op,
  }
  if (sv != null) body.schema_version = sv
  if (BUILD_ID) body.build = BUILD_ID

  const res = await fetch(`${WORKER_URL}/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  // 409 = Worker refused SV downgrade (add-bundle-schema-version-guard).
  // Surface distinctly from client-side `r2_schema_downgrade_refused` so
  // logs and telemetry can tell the two enforcement layers apart.
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
      `r2_schema_downgrade_refused_by_server: cloud=${cloud ?? '?'} incoming=${incoming ?? '?'} bundle=${BUNDLE_NAME}`,
    )
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // 429 = Worker presign rate limiter (add-presign-put-rate-limit). Embed the
    // server's Retry-After hint (seconds) into the message so the sync engine's
    // 429 cooldown can honor it even after engine-r2 wraps this error into
    // `r2_push_exhausted: …`. The Worker DOES CORS-expose Retry-After as of
    // 2026-07-15 (cors.ts Access-Control-Expose-Headers), so cross-origin reads
    // now see it. It is nonetheless a no-op today: the Worker sends "10" and the
    // engine takes max(hint, its own 60s base), so the hint can only ever make
    // the client back off MORE — never less — and only once the Worker sends a
    // value above that base.
    if (res.status === 429) {
      // Only propagate a sane, bounded hint: Retry-After is integer seconds per
      // spec, so a non-safe-integer (absurdly large, decimal, or NaN) is
      // rejected here → the engine falls back to its own base cooldown. The
      // engine additionally clamps whatever it parses to a hard ceiling.
      const retryAfterSec = Number(res.headers.get('Retry-After'))
      const hint =
        Number.isSafeInteger(retryAfterSec) && retryAfterSec > 0
          ? ` retry_after=${retryAfterSec}`
          : ''
      throw new Error(`presign_failed_429:${hint} ${text.slice(0, 200)}`)
    }
    throw new Error(`presign_failed_${res.status}: ${text.slice(0, 200)}`)
  }

  const result = (await res.json()) as PresignResult
  cache.set(key, result)
  return result
}

export function getWorkerUrl(): string {
  return WORKER_URL
}
