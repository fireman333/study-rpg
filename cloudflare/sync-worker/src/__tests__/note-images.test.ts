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
import { handleNoteImages, noteImageKey } from '../note-images'
import type { Env } from '../index'

const ORIGIN = 'https://med-study-rpg.com'
const H = corsHeaders(ORIGIN, true)
const SUB = '11111111-1111-4111-8111-111111111111'
const IMAGE_ID = '22222222-2222-4222-8222-222222222222'
const KEY = 'idem-key-0001'

type Rpc = (body: Record<string, unknown>) => Response
interface R2Stub {
  get?: (key: string) => unknown
  // Defaults to absent, matching `get`. The replay branch asks the store whether it
  // holds the object, so tests that care must say which world they are in.
  head?: (key: string) => unknown
  put?: (key: string, body: unknown, opts: unknown) => unknown
  delete?: (keys: unknown) => unknown
}

function ok(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 })
}
function pgError(code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), { status: 400 })
}

function harness(opts: { rpc?: Record<string, Rpc>; r2?: R2Stub; anonKey?: string | undefined } = {}) {
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
  const head = vi.fn(opts.r2?.head ?? (() => null))
  const put = vi.fn(opts.r2?.put ?? (() => ({ etag: 'e' })))
  const del = vi.fn(opts.r2?.delete ?? (() => undefined))
  const env = {
    SUPABASE_JWKS_URL: 'https://x/keys',
    SUPABASE_PROJECT_REF: 'proj',
    SUPABASE_ANON_KEY: 'anonKey' in opts ? opts.anonKey : 'anon-key',
    R2_PRIMARY: { get, head, put, delete: del },
  } as unknown as Env

  const pending: Array<Promise<unknown>> = []
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext
  return { env, calls, get, head, put, del, ctx, fetchMock, settle: () => Promise.all(pending) }
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

  it('503, loudly, when the publishable key is absent', async () => {
    const { env, put } = harness({ anonKey: undefined })
    const res = await handleNoteImages(upload(simpleWebp()), env, H)
    expect(res.status).toBe(503)
    expect(JSON.parse(await res.text()).error).toBe('anon_key_missing')
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
      p_idempotency_key: KEY,
      p_byte_length: bytes.byteLength,
      p_width: 1600,
      p_height: 900,
      p_format: 'image/webp',
      p_image_ack: true,
    })
  })

  it('forwards the uploader’s token, which is now the ONLY source of identity', async () => {
    const { env, fetchMock, ctx, settle } = harness({ rpc: reserved() })
    await handleNoteImages(
      new Request(`https://api.med-study-rpg.com/note-images?key=${KEY}&ack=1`, {
        method: 'POST',
        headers: { Authorization: 'Bearer uploader-token' },
        body: simpleWebp(),
      }),
      env,
      H,
      ctx,
    )
    await settle()
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
    expect(init.headers.Authorization).toBe('Bearer uploader-token')
    expect(init.headers.apikey).toBe('anon-key')
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

  it('a replay whose bytes the store already holds returns the first identity and rewrites nothing', async () => {
    const { env, head, put, ctx, settle } = harness({
      rpc: reserved(true),
      r2: { head: () => ({ etag: 'already-there' }) },
    })
    const res = await handleNoteImages(upload(simpleWebp()), env, H, ctx)
    await settle()
    expect(res.status).toBe(200)
    expect(JSON.parse(await res.text())).toEqual({ imageId: IMAGE_ID, replayed: true })
    expect(head).toHaveBeenCalledWith(noteImageKey(IMAGE_ID))
    expect(put).not.toHaveBeenCalled()
  })

  it('a replay stores bytes the store does not hold — the identity was assigned before they landed', async () => {
    // The defect this branch exists for: reserve answers `replayed` from the upload
    // ledger, whose row is written BEFORE the bytes, so an attempt that reserved and
    // then failed to write leaves an identity nothing can serve.
    const { env, put, ctx, settle } = harness({ rpc: reserved(true), r2: { head: () => null } })
    const res = await handleNoteImages(upload(simpleWebp()), env, H, ctx)
    await settle()
    expect(res.status).toBe(200)
    expect(JSON.parse(await res.text())).toEqual({ imageId: IMAGE_ID, replayed: true })
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0][0]).toBe(noteImageKey(IMAGE_ID))
    // The condition stays on the backfill: head said absent, the store still decides.
    expect(put.mock.calls[0][2]).toMatchObject({ onlyIf: { etagDoesNotMatch: '*' } })
  })

  it('a backfill the store refuses is a success, not the new-upload branch 409', async () => {
    // head said absent, a concurrent writer stored the object in between, the
    // conditional put is refused — which is exactly the outcome this branch wanted.
    const { env, put, ctx, settle } = harness({
      rpc: reserved(true),
      r2: { head: () => null, put: () => null },
    })
    const res = await handleNoteImages(upload(simpleWebp()), env, H, ctx)
    await settle()
    expect(put).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    expect(JSON.parse(await res.text())).toEqual({ imageId: IMAGE_ID, replayed: true })
  })

  it('a replay whose bytes cannot be stored is a failure, never a 200 carrying a dead identity', async () => {
    const { env, ctx, settle } = harness({
      rpc: reserved(true),
      r2: {
        head: () => null,
        put: () => {
          throw new Error('r2 down')
        },
      },
    })
    const res = await handleNoteImages(upload(simpleWebp()), env, H, ctx)
    await settle()
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain(IMAGE_ID)
  })

  it('a head the store cannot answer falls through to the conditional put', async () => {
    const { env, put, ctx, settle } = harness({
      rpc: reserved(true),
      r2: {
        head: () => {
          throw new Error('head failed')
        },
      },
    })
    const res = await handleNoteImages(upload(simpleWebp()), env, H, ctx)
    await settle()
    expect(res.status).toBe(200)
    expect(put).toHaveBeenCalledTimes(1)
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
    const { env } = harness({ anonKey: undefined })
    const res = await handleNoteImages(read(), env, H)
    expect(res.status).toBe(503)
    expect(JSON.parse(await res.text()).error).toBe('anon_key_missing')
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

  // An <img> cannot send an Authorization header, so unauthenticated is the normal case.
  // After 0030 the identity is not a parameter at all: no bearer means the anon key alone,
  // and auth.uid() is then NULL inside the function.
  it('sends only the publishable key when no credential is presented', async () => {
    const { env, calls, fetchMock } = harness({ rpc: authorized(), r2: { get: () => ({ body: 'X' }) } })
    await handleNoteImages(read(), env, H)
    expect(calls[0].body).toEqual({ p_image_id: IMAGE_ID })
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
    expect(init.headers.apikey).toBe('anon-key')
    expect(init.headers.Authorization).toBe('Bearer anon-key')
  })

  // The Worker cannot name a requester any more; it can only forward a token. So the
  // assertion is that the CALLER'S token is what travels, and nothing from the URL.
  it('forwards the caller’s own token, never anything from the URL', async () => {
    const { env, calls, fetchMock } = harness({ rpc: authorized(), r2: { get: () => ({ body: 'X' }) } })
    await handleNoteImages(
      new Request(`https://api.med-study-rpg.com/note-images/${IMAGE_ID}?requester=evil&token=evil`, {
        headers: { Authorization: 'Bearer real-user-token' },
      }),
      env,
      H,
    )
    expect(calls[0].body).toEqual({ p_image_id: IMAGE_ID })
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
    expect(init.headers.Authorization).toBe('Bearer real-user-token')
    expect(JSON.stringify(init.headers)).not.toContain('evil')
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

