/**
 * Byte-level WebP fixtures for the write-path validator.
 *
 * Hand-built rather than produced by an encoder, because the cases that matter are the
 * malformed ones — a `VP8X` header, an `EXIF` chunk, trailing bytes, a lying RIFF length
 * — and no encoder will emit those on request. A cooperating client is not what this
 * validator exists to survive.
 *
 * Ported from the app's `community-note-images/__tests__/webp-fixtures.ts`, whose header
 * anticipated exactly this reuse. The two builders must stay equivalent: if a payload
 * one side accepts is refused by the other, that disagreement is the bug.
 */

function uint32LE(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
}

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

/**
 * A minimal valid VP8 keyframe payload declaring `width` × `height`.
 *
 * Note the 14-bit fields: a fixture asking for 20000 px cannot express it and lands at
 * 3616, which is still over the 2400 bound — so the bound is what the test observes,
 * not the number it asked for.
 */
export function vp8KeyframePayload(width: number, height: number, extraBytes = 0): number[] {
  const payload = [
    0x00, 0x00, 0x00, // frame tag; bit 0 clear === keyframe
    0x9d, 0x01, 0x2a, // start code
    width & 0xff, (width >> 8) & 0x3f,
    height & 0xff, (height >> 8) & 0x3f,
  ];
  for (let i = 0; i < extraBytes; i += 1) payload.push(0x00);
  return payload;
}

export interface Chunk {
  id: string;
  payload: number[];
}

export function chunk(id: string, payload: number[]): Chunk {
  return { id, payload };
}

export function vp8Chunk(width: number, height: number, extraBytes = 0): Chunk {
  return chunk("VP8 ", vp8KeyframePayload(width, height, extraBytes));
}

export interface RiffOptions {
  /** Override the declared RIFF payload length, to test a header that lies. */
  declaredLength?: number;
  /** Bytes appended after the final chunk. */
  trailing?: number[];
  /** Replace the `WEBP` form type. */
  formType?: string;
  /** Replace the `RIFF` magic. */
  magic?: string;
}

/**
 * Assemble chunks into a RIFF/WEBP container. Appends rather than spreads: a padded
 * payload here reaches megabytes, and `push(...payload)` at that size overflows the
 * argument limit with a `RangeError` that reads like a bug in the code under test.
 */
export function buildWebp(chunks: Chunk[], options: RiffOptions = {}): Uint8Array {
  const body: number[] = [];
  const append = (values: number[]): void => {
    for (const value of values) body.push(value);
  };

  for (const { id, payload } of chunks) {
    append(ascii(id));
    append(uint32LE(payload.length));
    append(payload);
    if (payload.length % 2 === 1) body.push(0x00); // RIFF pads chunks to even length
  }

  const trailing = options.trailing ?? [];
  const formType = ascii(options.formType ?? "WEBP");
  const declared = options.declaredLength ?? formType.length + body.length + trailing.length;

  const out: number[] = [];
  for (const value of ascii(options.magic ?? "RIFF")) out.push(value);
  for (const value of uint32LE(declared)) out.push(value);
  for (const value of formType) out.push(value);
  for (const value of body) out.push(value);
  for (const value of trailing) out.push(value);

  return new Uint8Array(out);
}

/** The happy path: a single `VP8 ` chunk and nothing else. */
export function simpleWebp(width = 1200, height = 800): Uint8Array {
  return buildWebp([vp8Chunk(width, height)]);
}

/** A JPEG head — the "posted as WebP whatever it declares" case. */
export function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}
