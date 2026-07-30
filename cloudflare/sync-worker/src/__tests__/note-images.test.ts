import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { corsHeaders } from '../cors'
import { jpegBytes, simpleWebp } from './note-image-fixtures'

// Mock ONLY verifyJWT (the JWKS-fetching call); keep the real extractBearer so the
// Authorization-header parsing path is exercised. Mirrors r2-read.test.ts.
vi.mock('../auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth')>()
  return { ...actual, verifyJWT: vi.fn() }
})
import { verifyJWT } from '../auth'
import { handleNoteImages, noteImageKey, sweepExpired } from '../note-images'
import type { Env } from '../index'

const ORIGIN = 'https://med-study-rpg.com'
const H = corsHeaders(ORIGIN, true)
const SUB = '11111111-1111-4111-8111-111111111111'
const IMAGE_ID = '22222222-2222-4222-8222-222222222222'
const KEY = 'idem-key-0001'

type Rpc = (body: Record<string, unknown>) => Response
interface R2Stub {
  get?: (key: string) => unknown
  put?: (key: string, body: unknown, opts: unknown) => unknown
  delete?: (keys: unknown) => unknown
}

function ok(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 })
}
function pgError(code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), { status: 400 })
}

function harness(opts: { rpc?: Record<string, Rpc>; r2?: R2Stub; serviceKey?: string | undefined } = {}) {
  const calls: Array<{ fn: string; body: Record<string, unknown> }> = []
  const fetchMock = vi.fn(async (input: unknown, init?: { body?: string }) => {
    const fn = String(input).split('/rpc/')[1] ?? ''
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {}
    calls.push({ fn, body })
    const route = opts.rpc?.[fn]
    return route ? route(body) : ok([])
  })
  vi.stubGlobal('fetch', fetchMock)

  const get = vi.fn(opts.r2?.get ?? (() => null))
  const put = vi.fn(opts.r2?.put ?? (() => ({ etag: 'e' })))
  const del = vi.fn(opts.r2?.delete ?? (() => undefined))
  const env = {
    SUPABASE_JWKS_URL: 'https://x/keys',
    SUPABASE_PROJECT_REF: 'proj',
    SUPABASE_SERVICE_ROLE_KEY: 'serviceKey' in opts ? opts.serviceKey : 'svc-key',
    R2_PRIMARY: { get, put, delete: del },
  } as unknown as Env

  const pending: Array<Promise<unknown>> = []
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext
  return { env, calls, get, put, del, ctx, settle: () => Promise.all(pending) }
}

function upload(body: Uint8Array | null, query = `?key=${KEY}&ack=1`, method = 'POST', headers: Record<string, string> = {}): Request {
  return new Request(`https://api.med-study-rpg.com/note-images${query}`, {
    method,
    headers: { Authorization: 'Bearer tok', ...headers },
    ...(body ? { body } : {}),
  })
}
function read(id = IMAGE_ID, headers?: Record<string, string>, method = 'GET'): Request {
  return new Request(`https://api.med-study-rpg.com/note-images/${id}`, { method, headers })
}

async function snapshot(res: Response) {
  return {
    status: res.status,
    headers: Object.fromEntries([...res.headers].sort()),
    body: await res.text(),
  }
}

beforeEach(() => {
  vi.mocked(verifyJWT).mockReset()
  vi.mocked(verifyJWT).mockResolvedValue({ sub: SUB })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CORS already admits both methods (task 4.11)', () => {
  it('allows POST and GET without a cors.ts change', () => {
    expect(H['Access-Control-Allow-Methods']).toContain('POST')
    expect(H['Access-Control-Allow-Methods']).toContain('GET')
    expect(H['Access-Control-Allow-Headers']).toContain('Authorization')
    expect(H['Access-Control-Allow-Headers']).toContain('Content-Type')
  })
})

describe('POST /note-images — refusals before any write', () => {
  it('405 on a non-POST to the collection', async () => {
    const { env } = harness()
    expect((await handleNoteImages(upload(null, '', 'GET'), env, H)).status).toBe(405)
  })

  it('401 without a bearer token, and the body is never read', async () => {
    const { env, calls } = harness()
    const res = await handleNoteImages(
      new Request('https://api.med-study-rpg.com/note-images?key=' + KEY + '&ack=1', {
        method: 'POST',
        body: simpleWebp(),
      }),
      env,
      H,
    )
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('400 on an idempotency key that does not match the stored CHECK', async () => {
    const { env } = harness()
    expect((await handleNoteImages(upload(simpleWebp(), '?key=short&ack=1'), env, H)).status).toBe(400)
    expect((await handleNoteImages(upload(simpleWebp(), '?key=has%20space&ack=1'), env, H)).status).toBe(400)
    expect((await handleNoteImages(upload(simpleWebp(), '?ack=1'), env, H)).status).toBe(400)
  })

  // The acknowledgement is the ONLY pre-publication safeguard on this path, so
  // "present in some form" is not the bar.
  it('400 without the image acknowledgement, and truthiness does not substitute', async () => {
    const { env, calls } = harness()
    for (const q of [`?key=${KEY}`, `?key=${KEY}&ack=true`, `?key=${KEY}&ack=yes`, `?key=${KEY}&ack=0`]) {
      const res = await handleNoteImages(upload(simpleWebp(), q), env, H)
      expect(res.status).toBe(400)
      expect(JSON.parse(await res.text()).error).toBe('image_acknowledgement_required')
    }
    expect(calls).toHaveLength(0)
  })

  it('413 on a declared length over the ceiling, without buffering the body', async () => {
    const { env, calls } = harness()
    const res = await handleNoteImages(
      upload(simpleWebp(), undefined, 'POST', { 'Content-Length': String(3 * 1024 * 1024) }),
      env,
      H,
    )
    expect(res.status).toBe(413)
    expect(calls).toHaveLength(0)
  })

  it('422 with the profile reason when the bytes are not a simple WebP', async () => {
    const { env, calls, put } = harness()
    const res = await handleNoteImages(upload(jpegBytes()), env, H)
    expect(res.status).toBe(422)
    expect(JSON.parse(await res.text())).toMatchObject({ error: 'unacceptable_image', reason: 'not-riff' })
    expect(calls).toHaveLength(0)
    expect(put).not.toHaveBeenCalled()
  })

  it('503, loudly, when the service-role key is absent', async () => {
    const { env, put } = harness({ serviceKey: undefined })
    const res = await handleNoteImages(upload(simpleWebp()), env, H)
    expect(res.status).toBe(503)
    expect(JSON.parse(await res.text()).error).toBe('service_role_key_missing')
    expect(put).not.toHaveBeenCalled()
  })
})

describe('POST /note-images — the write', () => {
  const reserved = (replayed = false): Record<string, Rpc> => ({
    community_note_image_reserve: () => ok([{ image_id: IMAGE_ID, replayed }]),
  })

  it('201, and the dimensions recorded are the ones READ OUT of the container', async () => {
    const { env, calls, put, ctx, settle } = harness({ rpc: reserved() })
    const bytes = simpleWebp(1600, 900)
    // Query hints that contradict the bytes must decide nothing.
    const res = await handleNoteImages(
      upload(bytes, `?key=${KEY}&ack=1&width=9999&height=1&format=image/gif`),
      env,
      H,
      ctx,
    )
    await settle()
    expect(res.status).toBe(201)
    expect(JSON.parse(await res.text())).toEqual({ imageId: IMAGE_ID, replayed: false })

    const reserve = calls.find((c) => c.fn === 'community_note_image_reserve')
    expect(reserve?.body).toEqual({
      p_uploader: SUB,
      p_idempotency_key: KEY,
      p_byte_length: bytes.byteLength,
      p_width: 1600,
      p_height: 900,
      p_format: 'image/webp',
      p_image_ack: true,
    })
  })

  it('writes under a key outside users/, so the backup cron does not copy it', async () => {
    const { env, put, ctx, settle } = harness({ rpc: reserved() })
    await handleNoteImages(upload(simpleWebp()), env, H, ctx)
    await settle()
    expect(put.mock.calls[0][0]).toBe(noteImageKey(IMAGE_ID))
    expect(put.mock.calls[0][0]).not.toContain('users/')
  })

  it('writes conditionally, so an assigned identity can never be overwritten', async () => {
    const { env, put, ctx, settle } = harness({ rpc: reserved() })
    await handleNoteImages(upload(simpleWebp()), env, H, ctx)
    await settle()
    expect(put.mock.calls[0][2]).toMatchObject({
      httpMetadata: { contentType: 'image/webp' },
      onlyIf: { etagDoesNotMatch: '*' },
    })
  })

  it('a replay returns the first identity and writes nothing', async () => {
    const { env, put, ctx, settle } = harness({ rpc: reserved(true) })
    const res = await handleNoteImages(upload(simpleWebp()), env, H, ctx)
    await settle()
    expect(res.status).toBe(200)
    expect(JSON.parse(await res.text())).toEqual({ imageId: IMAGE_ID, replayed: true })
    expect(put).not.toHaveBeenCalled()
  })

  it('409 rather than an overwrite when the store says the identity already holds bytes', async () => {
    const { env, ctx, settle } = harness({ rpc: reserved(), r2: { put: () => null } })
    const res = await handleNoteImages(upload(simpleWebp()), env, H, ctx)
    await settle()
    expect(res.status).toBe(409)
    expect(JSON.parse(await res.text()).error).toBe('identity_already_written')
  })

  // SQLSTATE, not PostgREST's HTTP status: 0029 chose these codes and they survive
  // PostgREST changing its own mapping.
  it('maps the upload bound to 429 and the pause to 403, by SQLSTATE', async () => {
    const bound = harness({
      rpc: { community_note_image_reserve: () => pgError('53400', 'community_note_images: 24-hour upload bound reached') },
    })
    const boundRes = await handleNoteImages(upload(simpleWebp()), bound.env, H)
    expect(boundRes.status).toBe(429)
    expect(JSON.parse(await boundRes.text()).error).toBe('upload_bound_reached')
    expect(bound.put).not.toHaveBeenCalled()

    const paused = harness({
      rpc: { community_note_image_reserve: () => pgError('42501', 'community_note_images: submissions are paused') },
    })
    const pausedRes = await handleNoteImages(upload(simpleWebp()), paused.env, H)
    expect(pausedRes.status).toBe(403)
    expect(paused.put).not.toHaveBeenCalled()
  })

  it('502 with the message on an unrecognised database failure — never a silent success', async () => {
    const { env, put } = harness({
      rpc: { community_note_image_reserve: () => new Response('gateway exploded', { status: 500 }) },
    })
    const res = await handleNoteImages(upload(simpleWebp()), env, H)
    expect(res.status).toBe(502)
    expect(JSON.parse(await res.text()).detail).toContain('gateway exploded')
    expect(put).not.toHaveBeenCalled()
  })

  it('sweeps expired objects on the upload path, since nothing else would', async () => {
    const claimed = ['33333333-3333-4333-8333-333333333333']
    const { env, del, ctx, settle } = harness({
      rpc: {
        community_note_image_reserve: () => ok([{ image_id: IMAGE_ID, replayed: false }]),
        community_note_images_claim_expired: () => ok(claimed),
      },
    })
    await handleNoteImages(upload(simpleWebp()), env, H, ctx)
    await settle()
    expect(del).toHaveBeenCalledWith([noteImageKey(claimed[0])])
  })
})

describe('GET /note-images/<id> — one refusal, whatever the reason', () => {
  it('is byte-identical across absent object, malformed id, and missing bytes', async () => {
    const absent = harness({ rpc: { community_note_image_authorize: () => ok([]) } })
    const authorizedButGone = harness({
      rpc: { community_note_image_authorize: () => ok([{ format: 'image/webp', byte_length: 10 }]) },
      r2: { get: () => null },
    })
    const malformed = harness()

    const a = await snapshot(await handleNoteImages(read(), absent.env, H))
    const b = await snapshot(await handleNoteImages(read(), authorizedButGone.env, H))
    const c = await snapshot(await handleNoteImages(read('not-a-uuid'), malformed.env, H))

    expect(a).toEqual(b)
    expect(a).toEqual(c)
    expect(a.status).toBe(404)
    expect(a.body).toBe('')
    // A refusal must not be replayable from a cache after the note's state changes.
    expect(a.headers['cache-control']).toBe('private, no-store')
  })

  it('a non-GET on the item path is the same refusal, not a 405', async () => {
    const { env } = harness()
    const res = await handleNoteImages(read(IMAGE_ID, undefined, 'DELETE'), env, H)
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
  })

  it('an infrastructure failure is NOT dressed up as a refusal', async () => {
    const { env } = harness({ serviceKey: undefined })
    const res = await handleNoteImages(read(), env, H)
    expect(res.status).toBe(503)
    expect(JSON.parse(await res.text()).error).toBe('service_role_key_missing')
  })
})

describe('GET /note-images/<id> — serving', () => {
  const authorized = (format = 'image/webp'): Record<string, Rpc> => ({
    community_note_image_authorize: () => ok([{ format, byte_length: 30 }]),
  })

  it('serves with the write-time content type, nosniff, and a bounded private cache', async () => {
    const { env } = harness({
      rpc: authorized(),
      r2: { get: () => ({ body: 'WEBPBYTES' }) },
    })
    const res = await handleNoteImages(read(), env, H)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('WEBPBYTES')
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400')
  })

  it('takes the content type from the stored row, not from R2 metadata', async () => {
    const { env } = harness({
      rpc: authorized(),
      r2: { get: () => ({ body: 'X', httpMetadata: { contentType: 'text/html' } }) },
    })
    const res = await handleNoteImages(read(), env, H)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
  })

  // An <img> cannot send an Authorization header, so unauthenticated is the normal
  // case and the serving predicate decides on p_requester = null.
  it('passes a null requester when no credential is presented', async () => {
    const { env, calls } = harness({ rpc: authorized(), r2: { get: () => ({ body: 'X' }) } })
    await handleNoteImages(read(), env, H)
    expect(calls[0].body).toEqual({ p_image_id: IMAGE_ID, p_requester: null })
  })

  it('passes the verified subject when one is, and never anything from the URL', async () => {
    const { env, calls } = harness({ rpc: authorized(), r2: { get: () => ({ body: 'X' }) } })
    await handleNoteImages(
      new Request(`https://api.med-study-rpg.com/note-images/${IMAGE_ID}?requester=evil&token=evil`, {
        headers: { Authorization: 'Bearer tok' },
      }),
      env,
      H,
    )
    expect(calls[0].body).toEqual({ p_image_id: IMAGE_ID, p_requester: SUB })
  })

  // Silently downgrading a broken token to "anonymous" would turn an expired session
  // into an unexplained disappearance of the author's own images.
  it('401 on a present but invalid token, rather than falling back to anonymous', async () => {
    vi.mocked(verifyJWT).mockRejectedValue(new Error('jwt_expired'))
    const { env, calls } = harness({ rpc: authorized() })
    const res = await handleNoteImages(read(IMAGE_ID, { Authorization: 'Bearer stale' }), env, H)
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })
})

describe('sweepExpired', () => {
  it('accepts both PostgREST shapes for a SETOF scalar', async () => {
    const bare = harness({ rpc: { community_note_images_claim_expired: () => ok(['aaa', 'bbb']) } })
    await sweepExpired(bare.env)
    expect(bare.del).toHaveBeenCalledWith([noteImageKey('aaa'), noteImageKey('bbb')])

    const wrapped = harness({
      rpc: {
        community_note_images_claim_expired: () =>
          ok([{ community_note_images_claim_expired: 'ccc' }]),
      },
    })
    await sweepExpired(wrapped.env)
    expect(wrapped.del).toHaveBeenCalledWith([noteImageKey('ccc')])
  })

  it('logs and deletes nothing on an unrecognised shape, rather than guessing', async () => {
    const { env, del } = harness({
      rpc: { community_note_images_claim_expired: () => ok([{ a: 1, b: 2 }]) },
    })
    await sweepExpired(env)
    expect(del).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('says so when there is nothing to claim, instead of looking like it did not run', async () => {
    const { env, del } = harness({ rpc: { community_note_images_claim_expired: () => ok([]) } })
    await sweepExpired(env)
    expect(del).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith('[note-images] expiry sweep: nothing to claim')
  })

  it('reports loudly when the rows are gone but the bytes could not be deleted', async () => {
    const { env } = harness({
      rpc: { community_note_images_claim_expired: () => ok(['ddd']) },
      r2: {
        delete: () => {
          throw new Error('r2 down')
        },
      },
    })
    await sweepExpired(env)
    expect(console.error).toHaveBeenCalled()
  })
})
