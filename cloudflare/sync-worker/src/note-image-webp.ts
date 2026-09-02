/**
 * The "simple lossy WebP" profile — enforced HERE, where the object is written.
 *
 * Change `add-community-note-images` (study-rpg-2nd), capability
 * `community-note-images`: *The stored object is a still, metadata-free,
 * single-format image, enforced where it is written*. Every condition below is
 * decided by parsing the object's own bytes, independently of the client that
 * produced it.
 *
 * An accepted object is RIFF/WEBP containing **exactly the `VP8 ` chunk and nothing
 * else**. That one-entry allowlist is the whole of the metadata, alpha and animation
 * answer: in WebP those are reachable only through the extended header, so `EXIF`,
 * `XMP `, `ICCP`, `ALPH`, `ANIM` and `ANMF` cannot appear without `VP8X`. Refusing
 * `VP8X` refuses all of them **structurally** — including chunks defined after this
 * was written, which a list of forbidden chunks would silently admit.
 *
 * ⚠️ **This is a deliberate duplicate.** The app carries a reference implementation
 * of the same profile at
 * `study-rpg-2nd/apps/medexam2-hospital-tw/src/lib/community-note-images/webp-profile.ts`,
 * and the two must stay in lockstep. They are separate on purpose: the client's copy
 * is a self-check that lets the composer report a problem before uploading, and this
 * one is the boundary. Design D5 is explicit that nothing about an accepted object may
 * rest on what the sender claims — a re-encode from pixels genuinely cannot carry EXIF
 * forward, but that is a property of a COOPERATING client, and a phone photograph
 * posted unmodified carries GPS. The rejection vocabulary is an identical enumerated
 * union in both files so the two can be compared exactly rather than approximately.
 *
 * It is **not a decoder**: dimensions come out of the keyframe header, so no pixel is
 * ever decoded. That is load-bearing rather than an optimisation — the dimension bound
 * exists because a small, valid, highly compressible file can decode to a bitmap large
 * enough to exhaust the reader's browser, and a validator that had to decode to find
 * out would have the same problem on the server.
 */

/** Bytes. Condition 4. Checked here as well as claimed by the client. */
export const STORED_OBJECT_MAX_BYTES = 2 * 1024 * 1024;
/** Neither pixel dimension may exceed this. Condition 3 — the decompression bound. */
export const MAX_PIXEL_DIMENSION = 2400;
/** The one accepted media type, named at the boundary rather than reflected. */
export const STORED_OBJECT_MIME = "image/webp";

export type WebpProfileRejection =
  | "too-short"
  | "not-riff"
  | "riff-length-mismatch"
  | "not-webp"
  | "truncated-chunk"
  | "trailing-bytes"
  | "no-vp8-chunk"
  | "forbidden-chunk"
  | "not-a-keyframe"
  | "bad-vp8-start-code"
  | "dimensions-too-large"
  | "too-large";

export type WebpProfileResult =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: WebpProfileRejection; detail?: string };

const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
/** `VP8 ` — note the trailing space; it is part of the FourCC. */
const VP8_FOURCC = "VP8 ";
/** A VP8 keyframe's start code, immediately after the 3-byte frame tag. */
const VP8_START_CODE = [0x9d, 0x01, 0x2a];

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function uint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

function uint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/**
 * Validate `bytes` against the profile. Pure and synchronous; the caller decides what
 * a rejection means (here, the write is refused).
 */
export function validateSimpleWebp(bytes: Uint8Array): WebpProfileResult {
  if (bytes.byteLength > STORED_OBJECT_MAX_BYTES) return { ok: false, reason: "too-large" };
  if (bytes.byteLength < RIFF_HEADER_BYTES + CHUNK_HEADER_BYTES) return { ok: false, reason: "too-short" };

  if (fourCC(bytes, 0) !== "RIFF") return { ok: false, reason: "not-riff" };
  if (fourCC(bytes, 8) !== "WEBP") return { ok: false, reason: "not-webp" };

  // The declared RIFF payload length must account for the whole buffer. A mismatch is
  // how bytes get smuggled past a parser that trusts the header and stops early.
  const declared = uint32LE(bytes, 4);
  if (declared !== bytes.byteLength - 8) {
    return {
      ok: false,
      reason: "riff-length-mismatch",
      detail: `declared ${declared}, actual ${bytes.byteLength - 8}`,
    };
  }

  let offset = RIFF_HEADER_BYTES;
  let vp8: { start: number; size: number } | null = null;

  while (offset < bytes.byteLength) {
    if (offset + CHUNK_HEADER_BYTES > bytes.byteLength) return { ok: false, reason: "truncated-chunk" };

    const id = fourCC(bytes, offset);
    const size = uint32LE(bytes, offset + 4);
    const payload = offset + CHUNK_HEADER_BYTES;
    if (payload + size > bytes.byteLength) return { ok: false, reason: "truncated-chunk" };

    if (id !== VP8_FOURCC) {
      // Everything that is not the one permitted chunk — VP8X and therefore every
      // metadata / alpha / animation chunk, plus anything unrecognised.
      return { ok: false, reason: "forbidden-chunk", detail: id };
    }
    if (vp8) return { ok: false, reason: "forbidden-chunk", detail: "second VP8 chunk" };
    vp8 = { start: payload, size };

    // RIFF chunks are padded to an even length; the pad byte is not part of `size`.
    offset = payload + size + (size % 2);
  }

  if (offset !== bytes.byteLength) return { ok: false, reason: "trailing-bytes" };
  if (!vp8) return { ok: false, reason: "no-vp8-chunk" };
  if (vp8.size < 10) {
    return { ok: false, reason: "truncated-chunk", detail: "VP8 payload too short for a keyframe header" };
  }

  // Frame tag bit 0 == 0 means keyframe. A non-keyframe has no dimensions to read,
  // so this is a precondition of the bound below rather than a taste preference.
  const frameTag = bytes[vp8.start] | (bytes[vp8.start + 1] << 8) | (bytes[vp8.start + 2] << 16);
  if ((frameTag & 0x1) !== 0) return { ok: false, reason: "not-a-keyframe" };

  for (let i = 0; i < VP8_START_CODE.length; i += 1) {
    if (bytes[vp8.start + 3 + i] !== VP8_START_CODE[i]) return { ok: false, reason: "bad-vp8-start-code" };
  }

  // 14-bit width and height; the top 2 bits of each 16-bit field are a scale hint.
  const width = uint16LE(bytes, vp8.start + 6) & 0x3fff;
  const height = uint16LE(bytes, vp8.start + 8) & 0x3fff;

  if (width > MAX_PIXEL_DIMENSION || height > MAX_PIXEL_DIMENSION) {
    return { ok: false, reason: "dimensions-too-large", detail: `${width}x${height}` };
  }

  return { ok: true, width, height };
}
