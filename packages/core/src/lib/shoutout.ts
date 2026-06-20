/**
 * Shoutout board — content-agnostic shared contract (engine surface).
 *
 * The data layer (message + structured avatar types, client-side text
 * normalization / validation, content hash) lives in core so any app/theme can
 * reuse it against the shared `/shoutouts/*` Worker backend. Rendering (the
 * bouncing sprite + halo) stays per-app/theme.
 *
 * CONTENT-AGNOSTIC (engine rule): no domain vocabulary here. A sprite is
 * referenced only by an opaque `assetId` string the consuming app resolves to
 * its own art. `displayName` is supplied by the backend (joined from the app's
 * leaderboard profile), never composed here.
 *
 * The Worker (`cloudflare/sync-worker/src/shoutout.ts`) holds the AUTHORITATIVE
 * copy of normalization + blocklist enforcement; the functions here are the
 * client-side mirror for pre-submit UX feedback (and shared with forks). Keep
 * the two in sync — the Worker is the source of truth for what is accepted.
 *
 * Spec: openspec/specs/core-npm-package (ADDED: Shoutout message contract export)
 */

/** Structured avatar payload — validated shape, NOT an opaque blob (design D2). */
export interface ShoutoutAvatar {
  avatarType: string;
  assetId: string;
  cosmeticId?: string;
}

/** One board message as returned by `GET /shoutouts/:app`. */
export interface ShoutoutMessage {
  id: string;
  /** Stable opaque author key (the app's user id); client matches its own for the own-halo. */
  authorKey: string;
  /** Server-joined display name (from the app's leaderboard profile). */
  nickname: string;
  /** True when the author is within the leaderboard composite Top-N (special halo). */
  isTopN: boolean;
  avatar: ShoutoutAvatar;
  message: string;
  createdAt: number;
  updatedAt: number;
}

export interface ShoutoutBoard {
  messages: ShoutoutMessage[];
  count: number;
}

export const MESSAGE_MAX_GRAPHEMES = 40;
export const MESSAGE_MAX_LINES = 2;
// Opaque sprite key charset. Unicode letters/numbers are allowed so apps whose
// canonical sprite ids are non-ASCII (e.g. the neurons content pack's CJK family
// ids like 「寄生蟲學」) can pass them through verbatim. Still excludes spaces,
// quotes, slashes, angle brackets, and control chars — the injection guard intact.
export const ASSET_ID_PATTERN = /^[\p{L}\p{N}._:-]{1,64}$/u;

// Zero-width: ZWSP/ZWNJ/ZWJ (U+200B-U+200D), BOM/ZWNBSP (U+FEFF), WORD JOINER (U+2060).
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060]/g;
// Bidi overrides/embeddings/isolates (U+202A-U+202E, U+2066-U+2069).
const BIDI_OVERRIDE = /[\u202A-\u202E\u2066-\u2069]/g;
// Control chars excluding \t (U+0009) \n (U+000A) \r (U+000D).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

/** NFKC + strip zero-width + strip bidi + collapse whitespace + lowercase. */
export function normalizeShoutoutText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(BIDI_OVERRIDE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Grapheme-cluster length (Intl.Segmenter where available; codepoint fallback). */
export function graphemeLen(s: string): number {
  try {
    const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
    if (Seg) {
      const seg = new Seg(undefined, { granularity: "grapheme" });
      let n = 0;
      for (const _ of seg.segment(s)) n += 1;
      return n;
    }
  } catch {
    /* fall through */
  }
  return [...s].length;
}

/** Seed keyword blocklist — minimal; the Worker holds the enforced/extended copy. */
export const SHOUTOUT_BLOCKLIST_SEED: readonly string[] = [
  "幹你", "去死", "智障", "白痴", "婊", "賤", "幹妳", "雜種",
  "fuck", "shit", "bitch",
];

export function isBlockedText(normalized: string): boolean {
  return SHOUTOUT_BLOCKLIST_SEED.some((term) => normalized.includes(term));
}

const PII_PATTERNS: readonly RegExp[] = [
  /09\d{8}/,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b[a-z][12]\d{8}\b/i,
];

export function hasPII(normalized: string): boolean {
  return PII_PATTERNS.some((re) => re.test(normalized));
}

/** Validate the structured avatar payload (shape + charset) — the security layer. */
export function isValidAvatar(a: unknown): a is ShoutoutAvatar {
  if (typeof a !== "object" || a === null) return false;
  const o = a as Record<string, unknown>;
  if (typeof o.avatarType !== "string" || o.avatarType.length === 0 || o.avatarType.length > 32) return false;
  if (typeof o.assetId !== "string" || !ASSET_ID_PATTERN.test(o.assetId)) return false;
  if (o.cosmeticId !== undefined && (typeof o.cosmeticId !== "string" || !ASSET_ID_PATTERN.test(o.cosmeticId))) {
    return false;
  }
  return true;
}

export interface MessageValidation {
  ok: boolean;
  reason?: "empty" | "invalid_chars" | "too_many_lines" | "too_long" | "blocked" | "pii";
}

/** Client-side pre-submit validation mirroring the Worker pipeline (for UX). */
export function validateShoutoutMessage(raw: string): MessageValidation {
  const original = raw.trim();
  if (original.length === 0) return { ok: false, reason: "empty" };
  if (CONTROL_CHARS.test(original) || BIDI_OVERRIDE.test(original)) return { ok: false, reason: "invalid_chars" };
  if (original.split("\n").length > MESSAGE_MAX_LINES) return { ok: false, reason: "too_many_lines" };
  if (graphemeLen(original.replace(/\n/g, "")) > MESSAGE_MAX_GRAPHEMES) return { ok: false, reason: "too_long" };
  const normalized = normalizeShoutoutText(original);
  if (isBlockedText(normalized)) return { ok: false, reason: "blocked" };
  if (hasPII(normalized)) return { ok: false, reason: "pii" };
  return { ok: true };
}

/** FNV-1a 32-bit hex content hash (mirrors the Worker's no-op-edit detection). */
export function shoutoutContentHash(avatar: ShoutoutAvatar, normalizedMessage: string): string {
  const parts = `${avatar.avatarType}|${avatar.assetId}|${avatar.cosmeticId ?? ""}|${normalizedMessage}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
