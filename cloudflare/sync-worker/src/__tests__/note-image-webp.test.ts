import { describe, it, expect } from 'vitest'
import { validateSimpleWebp, MAX_PIXEL_DIMENSION } from '../note-image-webp'
import { buildWebp, chunk, jpegBytes, simpleWebp, vp8Chunk, vp8KeyframePayload } from './note-image-fixtures'

// Task 4.12: every refusal tested with a CRAFTED payload rather than a cooperating
// client. The client's re-encode is not the boundary — a caller that simply posts an
// unmodified phone photograph is the case the metadata rule exists for, and it carries
// GPS.

describe('validateSimpleWebp — the one-entry allowlist', () => {
  it('accepts a single VP8 chunk and reads its dimensions from the keyframe header', () => {
    expect(validateSimpleWebp(simpleWebp(1200, 800))).toEqual({ ok: true, width: 1200, height: 800 })
  })

  it('accepts the dimension bound exactly, and refuses one pixel over', () => {
    const at = validateSimpleWebp(simpleWebp(MAX_PIXEL_DIMENSION, MAX_PIXEL_DIMENSION))
    expect(at).toEqual({ ok: true, width: 2400, height: 2400 })
    expect(validateSimpleWebp(simpleWebp(MAX_PIXEL_DIMENSION + 1, 100)).ok).toBe(false)
    expect(validateSimpleWebp(simpleWebp(100, MAX_PIXEL_DIMENSION + 1))).toMatchObject({
      ok: false,
      reason: 'dimensions-too-large',
    })
  })

  it('refuses a JPEG however it is posted', () => {
    expect(validateSimpleWebp(jpegBytes())).toMatchObject({ ok: false, reason: 'not-riff' })
  })

  it('refuses RIFF that is not WEBP', () => {
    const wav = buildWebp([vp8Chunk(10, 10)], { formType: 'WAVE' })
    expect(validateSimpleWebp(wav)).toMatchObject({ ok: false, reason: 'not-webp' })
  })

  // VP8X is the whole allowlist argument: metadata, colour profile, alpha and animation
  // are reachable ONLY through the extended header, so refusing it refuses all of them
  // structurally — including chunks defined after this was written.
  it('refuses VP8X, and therefore EXIF / XMP / ICCP / ALPH / ANIM / ANMF with it', () => {
    for (const trailer of ['EXIF', 'XMP ', 'ICCP', 'ALPH', 'ANIM', 'ANMF']) {
      const bytes = buildWebp([
        chunk('VP8X', [0x10, 0, 0, 0, 0x0f, 0, 0, 0x0f, 0, 0]),
        chunk(trailer, [0x01, 0x02, 0x03, 0x04]),
        vp8Chunk(100, 100),
      ])
      expect(validateSimpleWebp(bytes)).toMatchObject({ ok: false, reason: 'forbidden-chunk', detail: 'VP8X' })
    }
  })

  it('refuses a metadata chunk even when VP8X is absent', () => {
    const bytes = buildWebp([vp8Chunk(100, 100), chunk('EXIF', [0x01, 0x02])])
    expect(validateSimpleWebp(bytes)).toMatchObject({ ok: false, reason: 'forbidden-chunk', detail: 'EXIF' })
  })

  it('refuses a chunk nobody has heard of — the case a denylist would admit', () => {
    const bytes = buildWebp([vp8Chunk(100, 100), chunk('QQ99', [0x01, 0x02])])
    expect(validateSimpleWebp(bytes)).toMatchObject({ ok: false, reason: 'forbidden-chunk', detail: 'QQ99' })
  })

  it('refuses lossless VP8L, which is a different container shape entirely', () => {
    const bytes = buildWebp([chunk('VP8L', [0x2f, 0, 0, 0, 0])])
    expect(validateSimpleWebp(bytes)).toMatchObject({ ok: false, reason: 'forbidden-chunk', detail: 'VP8L' })
  })

  it('refuses a second VP8 chunk', () => {
    const bytes = buildWebp([vp8Chunk(100, 100), vp8Chunk(120, 120)])
    expect(validateSimpleWebp(bytes)).toMatchObject({ ok: false, reason: 'forbidden-chunk' })
  })
})

describe('validateSimpleWebp — container arithmetic', () => {
  it('refuses a declared RIFF length that disagrees with the payload', () => {
    const short = buildWebp([vp8Chunk(100, 100)], { declaredLength: 4 })
    expect(validateSimpleWebp(short)).toMatchObject({ ok: false, reason: 'riff-length-mismatch' })
    const long = buildWebp([vp8Chunk(100, 100)], { declaredLength: 999_999 })
    expect(validateSimpleWebp(long)).toMatchObject({ ok: false, reason: 'riff-length-mismatch' })
  })

  // Two shapes of the same attack. When the header EXCLUDES the extra bytes the
  // arithmetic catches it; when the header is complicit and counts them, the chunk walk
  // does. Either way nothing gets smuggled past the last chunk.
  it('refuses bytes appended after the final chunk, header complicit or not', () => {
    const honestHeader = buildWebp([vp8Chunk(100, 100)], {
      trailing: [0xde, 0xad, 0xbe, 0xef],
      declaredLength: 12 - 8 + 8 + vp8KeyframePayload(100, 100).length,
    })
    expect(validateSimpleWebp(honestHeader)).toMatchObject({ ok: false, reason: 'riff-length-mismatch' })

    const complicitShort = buildWebp([vp8Chunk(100, 100)], { trailing: [0xde, 0xad, 0xbe, 0xef] })
    expect(validateSimpleWebp(complicitShort)).toMatchObject({ ok: false, reason: 'truncated-chunk' })

    const complicitLong = buildWebp([vp8Chunk(100, 100)], {
      trailing: [0x41, 0x41, 0x41, 0x41, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00],
    })
    expect(validateSimpleWebp(complicitLong)).toMatchObject({ ok: false, reason: 'forbidden-chunk' })
  })

  it('refuses a chunk whose declared size runs past the buffer', () => {
    const bytes = buildWebp([vp8Chunk(100, 100)])
    // Overwrite the VP8 chunk's size field (offset 16) with something enormous.
    bytes[16] = 0xff
    bytes[17] = 0xff
    expect(validateSimpleWebp(bytes)).toMatchObject({ ok: false, reason: 'truncated-chunk' })
  })

  it('refuses a buffer too short to hold a container at all', () => {
    expect(validateSimpleWebp(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toMatchObject({
      ok: false,
      reason: 'too-short',
    })
  })

  it('refuses a VP8 payload too short to carry a keyframe header', () => {
    const bytes = buildWebp([chunk('VP8 ', [0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a])])
    expect(validateSimpleWebp(bytes)).toMatchObject({ ok: false, reason: 'truncated-chunk' })
  })
})

describe('validateSimpleWebp — the frame itself', () => {
  it('refuses a non-keyframe, which has no dimensions to bound', () => {
    const payload = vp8KeyframePayload(100, 100)
    payload[0] = 0x01 // frame tag bit 0 set === interframe
    expect(validateSimpleWebp(buildWebp([chunk('VP8 ', payload)]))).toMatchObject({
      ok: false,
      reason: 'not-a-keyframe',
    })
  })

  it('refuses a bad start code', () => {
    const payload = vp8KeyframePayload(100, 100)
    payload[3] = 0x00
    expect(validateSimpleWebp(buildWebp([chunk('VP8 ', payload)]))).toMatchObject({
      ok: false,
      reason: 'bad-vp8-start-code',
    })
  })

  // The decompression bound, which the length limit says nothing about: the reader's
  // browser is what would exhaust, and the reader did not choose to upload it.
  it('refuses an over-large bitmap on its dimensions while it is tiny on disk', () => {
    const bomb = simpleWebp(20000, 20000)
    expect(bomb.byteLength).toBeLessThan(40)
    const result = validateSimpleWebp(bomb)
    expect(result).toMatchObject({ ok: false, reason: 'dimensions-too-large' })
    // 14-bit fields, so "20000" is stored as 3616 — still over the bound, which is the
    // property under test rather than the number the fixture asked for.
    expect(result.ok === false && result.detail).toBe('3616x3616')
  })

  it('refuses over-length bytes independently of what produced them', () => {
    const fat = buildWebp([vp8Chunk(800, 600, 3 * 1024 * 1024)])
    expect(fat.byteLength).toBeGreaterThan(2 * 1024 * 1024)
    expect(validateSimpleWebp(fat)).toMatchObject({ ok: false, reason: 'too-large' })
  })
})
