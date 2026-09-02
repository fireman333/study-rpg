import { describe, it, expect, vi, beforeEach } from 'vitest'
import { corsHeaders } from '../cors'
import { bundleKey } from '../presign'

// Mock ONLY verifyJWT (the JWKS-fetching call); keep the real extractBearer so
// the Authorization-header parsing path is exercised. Everything else here is a
// pure unit — no miniflare, no real R2 (mirrors the project's node-env harness).
vi.mock('../auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth')>()
  return { ...actual, verifyJWT: vi.fn() }
})
import { verifyJWT } from '../auth'
import { handleR2Read } from '../r2-read'
import type { Env } from '../index'

const ORIGIN = 'https://med-study-rpg.com'
const H = corsHeaders(ORIGIN, true)
const SUB = 'user-123'

type GetImpl = (key: string, opts?: unknown) => unknown
function makeEnv(getImpl: GetImpl) {
  const get = vi.fn(getImpl)
  const env = {
    SUPABASE_JWKS_URL: 'https://x/keys',
    SUPABASE_PROJECT_REF: 'proj',
    R2_PRIMARY: { get },
  } as unknown as Env
  return { env, get }
}

function req(path: string, opts?: { method?: string; headers?: Record<string, string> }): Request {
  return new Request(`https://api.med-study-rpg.com${path}`, {
    method: opts?.method ?? 'GET',
    headers: { Authorization: 'Bearer tok', ...(opts?.headers ?? {}) },
  })
}

beforeEach(() => {
  vi.mocked(verifyJWT).mockReset()
  vi.mocked(verifyJWT).mockResolvedValue({ sub: SUB })
})

describe('corsHeaders — conditional-read support', () => {
  it('allows the If-None-Match request header and exposes ETag', () => {
    expect(H['Access-Control-Allow-Headers']).toContain('If-None-Match')
    expect(H['Access-Control-Expose-Headers']).toContain('ETag')
  })
})

describe('handleR2Read', () => {
  it('405 on non-GET (with CORS)', async () => {
    const { env } = makeEnv(() => null)
    const res = await handleR2Read(req('/r2/read?bundle=m2', { method: 'POST' }), env, H)
    expect(res.status).toBe(405)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
  })

  it('416 on Range (with CORS)', async () => {
    const { env, get } = makeEnv(() => null)
    const res = await handleR2Read(req('/r2/read?bundle=m2', { headers: { Range: 'bytes=0-10' } }), env, H)
    expect(res.status).toBe(416)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(get).not.toHaveBeenCalled()
  })

  it('401 on bad auth (with CORS)', async () => {
    vi.mocked(verifyJWT).mockRejectedValue(new Error('jwt_bad'))
    const { env } = makeEnv(() => null)
    const res = await handleR2Read(req('/r2/read?bundle=m2'), env, H)
    expect(res.status).toBe(401)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
  })

  it('400 on missing or invalid bundle', async () => {
    const { env } = makeEnv(() => null)
    expect((await handleR2Read(req('/r2/read'), env, H)).status).toBe(400)
    expect((await handleR2Read(req('/r2/read?bundle=nope'), env, H)).status).toBe(400)
  })

  it('200 streams body with gzip content-type + ETag + no Content-Encoding', async () => {
    const { env, get } = makeEnv(() => ({ httpEtag: '"e1"', body: 'GZBYTES' }))
    const res = await handleR2Read(req('/r2/read?bundle=m2'), env, H)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/gzip')
    expect(res.headers.get('ETag')).toBe('"e1"')
    expect(res.headers.get('Content-Encoding')).toBeNull()
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(await res.text()).toBe('GZBYTES')
    // key derived from jwt.sub; no conditional header → get called WITHOUT opts
    expect(get.mock.calls[0][0]).toBe(bundleKey(SUB, 'm2'))
    expect(get.mock.calls[0].length).toBe(1)
  })

  it('304 when If-None-Match matches (bodyless R2Object) — raw header into onlyIf', async () => {
    const { env, get } = makeEnv(() => ({ httpEtag: '"e1"' })) // no `body` prop
    const res = await handleR2Read(
      req('/r2/read?bundle=m2', { headers: { 'If-None-Match': '"e1"' } }),
      env,
      H,
    )
    expect(res.status).toBe(304)
    expect(res.headers.get('ETag')).toBe('"e1"')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    // The quoted etag is passed as a RAW Headers `onlyIf`, not converted.
    const [key, opts] = get.mock.calls[0] as [string, { onlyIf: Headers }]
    expect(key).toBe(bundleKey(SUB, 'm2'))
    expect(opts.onlyIf).toBeInstanceOf(Headers)
    expect(opts.onlyIf.get('If-None-Match')).toBe('"e1"')
  })

  it('404 when object missing (no ETag header, with CORS)', async () => {
    const { env } = makeEnv(() => null)
    const res = await handleR2Read(req('/r2/read?bundle=bookmarks'), env, H)
    expect(res.status).toBe(404)
    expect(res.headers.get('ETag')).toBeNull()
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
  })

  it('502 when the R2 binding throws (with CORS)', async () => {
    const { env } = makeEnv(() => {
      throw new Error('kaboom')
    })
    const res = await handleR2Read(req('/r2/read?bundle=m2'), env, H)
    expect(res.status).toBe(502)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
  })

  it('key is derived from jwt.sub, ignoring any client-supplied user/key hint', async () => {
    const { env, get } = makeEnv(() => ({ httpEtag: '"e1"', body: 'GZ' }))
    await handleR2Read(
      req('/r2/read?bundle=m2&user=evil&key=users/evil/m2-snapshot.json.gz'),
      env,
      H,
    )
    expect(get.mock.calls[0][0]).toBe(bundleKey(SUB, 'm2'))
    expect(get.mock.calls[0][0]).not.toContain('evil')
  })

  it('conditional pull but CHANGED → 200 + new ETag (If-None-Match sent, body returned)', async () => {
    const { env, get } = makeEnv(() => ({ httpEtag: '"e2"', body: 'NEWGZ' }))
    const res = await handleR2Read(
      req('/r2/read?bundle=m2', { headers: { 'If-None-Match': '"e1"' } }),
      env,
      H,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('"e2"')
    expect(res.headers.get('Content-Type')).toBe('application/gzip')
    expect(await res.text()).toBe('NEWGZ')
    // The stale client etag was still handed to onlyIf as a raw header.
    const [, opts] = get.mock.calls[0] as [string, { onlyIf: Headers }]
    expect(opts.onlyIf.get('If-None-Match')).toBe('"e1"')
  })

  it('502 when the R2 binding rejects ASYNCHRONOUSLY (real bindings reject, not sync-throw)', async () => {
    const { env } = makeEnv(() => Promise.reject(new Error('async kaboom')))
    const res = await handleR2Read(req('/r2/read?bundle=m2'), env, H)
    expect(res.status).toBe(502)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
  })
})
