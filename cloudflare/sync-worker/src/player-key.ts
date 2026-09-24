/**
 * The public key that stands for a player on every login-free surface.
 *
 * Change: hash-leaderboard-user-ids. Until this change the public leaderboard
 * snapshots (`GET /leaderboard/:filter`, `GET /leaderboard/neurons/:filter`) and
 * the 留言 board (`GET /shoutouts/:app`) published each player's Supabase
 * `user_id` — the stable identifier of their login. Nothing a public reader
 * does needs it: a public row only has to be told apart from the others, and a
 * signed-in player only has to find their own. A keyed hash does both without
 * publishing the account identifier.
 *
 *   player_key = "pk1_" + base64url( HMAC-SHA256(secret, "<app_id>:<user_id>") )[0..128 bits]
 *
 * - Keyed, not a plain hash: a UUID is not secret input — anyone holding a
 *   candidate `user_id` could hash it and confirm a match. Only the Worker (and
 *   the owner's local copy, see scripts/mask-leaderboard-nickname.sh) holds the
 *   secret.
 * - `app_id` inside the message: the same player on the 二階 board and the
 *   neurons board gets two unrelated keys, so the two public boards cannot be
 *   joined against each other. Within one app the leaderboard and the 留言 board
 *   use the same key — the 留言 halo is computed by matching them.
 * - 128 bits: collision-free at any population this project will reach, and
 *   short enough to be a React key.
 * - `pk1_`: names the format, so a report endpoint can tell a key from anything
 *   else it is handed. Rotating the secret does NOT change the prefix: clients
 *   never store keys. What a rotation does need to be told apart is a KV snapshot
 *   keyed under the old secret — that is the `epoch` each snapshot records (see
 *   PlayerKeyer and design D5).
 * - Two secrets, one at a time: during the rollout compat window the keys come
 *   from LEADERBOARD_PLAYER_KEY_WINDOW_SECRET, after it from
 *   LEADERBOARD_PLAYER_KEY_SECRET — see compatWindow(). The keys published next
 *   to raw ids therefore die with the window.
 *
 * ⚠️ Fails CLOSED. With the secret missing or too short, the derivation throws
 * PlayerKeyUnavailableError and the caller refuses the request (5xx) or writes
 * nothing (cron). There is deliberately no fallback to the raw `user_id`: a
 * fallback here would republish the identifier on exactly the day the secret
 * is misconfigured, and nothing would turn red.
 *
 * D1 is unchanged: every internal join (masks, bans, reports, the 留言 author)
 * still uses the raw `user_id`. The key exists only at the public boundary.
 */

import type { Env } from "./index";

export const PLAYER_KEY_PREFIX = "pk1_";

/** 16 bytes → 22 base64url characters, no padding. */
const PLAYER_KEY_BYTES = 16;

export const PLAYER_KEY_PATTERN = /^pk1_[A-Za-z0-9_-]{22}$/;

/**
 * Shortest secret accepted. `openssl rand -base64 48` (the documented command)
 * yields 64 characters; 32 is the floor below which the secret is refused rather
 * than used.
 */
export const PLAYER_KEY_MIN_SECRET_LENGTH = 32;

export class PlayerKeyUnavailableError extends Error {
  constructor(reason: string) {
    super(`player_key_unavailable: ${reason}`);
    this.name = "PlayerKeyUnavailableError";
  }
}

/**
 * A key derivation bound to one app and one secret. `epoch` fingerprints the
 * secret (not the app): a stored snapshot records the epoch it was keyed under,
 * so a reader can tell whether its stored keys are the ones the current secret
 * gives — see public-snapshot.ts and the close of the compat window below.
 */
export interface PlayerKeyer {
  (userId: string): Promise<string>;
  readonly epoch: string;
}

/** Prefix of a secret fingerprint; 6 bytes → 8 base64url characters. */
export const KEY_EPOCH_PREFIX = "ke1_";
const KEY_EPOCH_BYTES = 6;
/** The fixed message whose MAC fingerprints a secret. Mirrored by the owner script. */
export const KEY_EPOCH_MESSAGE = "player-key-epoch";

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type SecretName = "LEADERBOARD_PLAYER_KEY_SECRET" | "LEADERBOARD_PLAYER_KEY_WINDOW_SECRET";

function usableSecret(secret: unknown): secret is string {
  return typeof secret === "string" && secret.length >= PLAYER_KEY_MIN_SECRET_LENGTH;
}

async function keyerFor(secret: string | undefined, name: SecretName, appId: string): Promise<PlayerKeyer> {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new PlayerKeyUnavailableError(`${name} is not set`);
  }
  if (!usableSecret(secret)) {
    throw new PlayerKeyUnavailableError(`${name} is shorter than ${PLAYER_KEY_MIN_SECRET_LENGTH} characters`);
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const epochMac = await crypto.subtle.sign("HMAC", key, enc.encode(KEY_EPOCH_MESSAGE));
  const epoch = KEY_EPOCH_PREFIX + base64url(new Uint8Array(epochMac).slice(0, KEY_EPOCH_BYTES));
  // ⚠️ The memo is load-bearing, not a nicety: one refresh lists a player in up to
  // five rankings and the CPU budget counts each signature (design D8). Pinned by
  // "signs each distinct player once per refresh" in __tests__/player-key.test.ts.
  const memo = new Map<string, Promise<string>>();
  const keyOf = (userId: string) => {
    let hit = memo.get(userId);
    if (!hit) {
      hit = crypto.subtle
        .sign("HMAC", key, enc.encode(`${appId}:${userId}`))
        .then((mac) => PLAYER_KEY_PREFIX + base64url(new Uint8Array(mac).slice(0, PLAYER_KEY_BYTES)));
      memo.set(userId, hit);
    }
    return hit;
  };
  return Object.assign(keyOf, { epoch });
}

/**
 * The derivation under the permanent secret — the one every public surface uses
 * once the compat window has closed.
 *
 * ⚠️ Production code does NOT call this: it calls `publicIdentity(env, now)`,
 * which picks the window secret while the window is open. This stays exported for
 * the tests and fixtures, which need "the key a player has in the end state".
 * A guard in __tests__/player-key.test.ts fails when a production file calls it.
 *
 * @throws PlayerKeyUnavailableError when the secret is absent or shorter than
 *         PLAYER_KEY_MIN_SECRET_LENGTH.
 */
export function playerKeyer(
  env: Pick<Env, "LEADERBOARD_PLAYER_KEY_SECRET">,
  appId: string,
): Promise<PlayerKeyer> {
  return keyerFor(env.LEADERBOARD_PLAYER_KEY_SECRET, "LEADERBOARD_PLAYER_KEY_SECRET", appId);
}

// ─── the rollout compat window ──────────────────────────────────────────────

/**
 * Longest a compat window may still have to run. A deadline further out than
 * this is treated as a misconfiguration and the window stays CLOSED — so no value
 * of the var can hold the raw id on the public surfaces indefinitely.
 */
export const RAW_ID_COMPAT_MAX_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * `YYYY-MM-DD` (00:00 UTC of that day) or a full timestamp WITH an offset
 * (`2026-09-27T23:59:59+08:00`, `…Z`). A timestamp without an offset is refused:
 * it would mean local time, and the Worker and the owner's shell disagree on what
 * that is.
 */
const COMPAT_UNTIL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/;

/** Epoch ms of the deadline, or null when the value is absent, empty, or not a real date. */
export function parseCompatUntil(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = COMPAT_UNTIL_PATTERN.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Date.parse rolls 2026-02-30 over to March; a calendar date must round-trip.
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export type CompatWindowState =
  | "open"
  | "unset"
  | "unparseable"
  | "expired"
  | "beyond-max"
  | "window-secret-unusable"
  | "window-secret-reused";

/**
 * Whether the rollout compat window is open at `now` (design D6).
 *
 * While open, the public surfaces ALSO carry the raw identifier in its old field
 * (`user_id` on a snapshot row, `authorKey` / `id` on a 留言 message) so a client
 * bundle that predates this change keeps finding its own row — and every key is
 * derived from LEADERBOARD_PLAYER_KEY_WINDOW_SECRET, not the permanent secret.
 *
 * Why a separate secret: while open, anyone can record (raw id, key) pairs. If the
 * keys survived the window, that record would resolve every key published after it
 * back to an account id — for good, and across both apps. Keying the window with a
 * secret that is retired at the deadline makes every pair recorded during it
 * useless the moment it closes, with nobody having to remember to rotate.
 *
 * Fails CLOSED — every doubt keeps the raw id off the public surfaces:
 *   - LEADERBOARD_RAW_ID_COMPAT_UNTIL absent, empty, or not a real date;
 *   - the deadline has passed, or is more than RAW_ID_COMPAT_MAX_MS away;
 *   - either secret unusable (window keys need the window secret, and the moment
 *     after the window needs the permanent one);
 *   - the two secrets equal (the window keys would then be the permanent keys).
 */
export function compatWindow(
  env: Pick<
    Env,
    "LEADERBOARD_RAW_ID_COMPAT_UNTIL" | "LEADERBOARD_PLAYER_KEY_SECRET" | "LEADERBOARD_PLAYER_KEY_WINDOW_SECRET"
  >,
  now: number,
): CompatWindowState {
  const raw = env.LEADERBOARD_RAW_ID_COMPAT_UNTIL;
  if (raw === undefined || raw === "") return "unset";
  const until = parseCompatUntil(raw);
  if (until === null) return "unparseable";
  if (now >= until) return "expired";
  if (until - now > RAW_ID_COMPAT_MAX_MS) return "beyond-max";
  const windowSecret = env.LEADERBOARD_PLAYER_KEY_WINDOW_SECRET;
  if (!usableSecret(windowSecret) || !usableSecret(env.LEADERBOARD_PLAYER_KEY_SECRET)) {
    return "window-secret-unusable";
  }
  if (windowSecret === env.LEADERBOARD_PLAYER_KEY_SECRET) return "window-secret-reused";
  return "open";
}

/**
 * One log line from a cron when the window was configured but refused — a
 * deadline that cannot be read, is too far out, or lacks a distinct window secret.
 * Closed is the safe state, so nothing fails; but an owner who meant to open the
 * window would otherwise find out only from players whose rows stopped
 * highlighting. `unset` and `expired` are the normal states and stay quiet.
 */
export function warnIfCompatRefused(
  env: Parameters<typeof compatWindow>[0],
  now: number,
  where: string,
): void {
  const state = compatWindow(env, now);
  if (state !== "open" && state !== "unset" && state !== "expired") {
    console.warn(`[${where}] LEADERBOARD_RAW_ID_COMPAT_UNTIL is set but the window stays closed`, { state });
  }
}

/**
 * The public identity in force at `now`: whether the raw id also goes out, and
 * the key derivation to use. Every surface goes through this one function, with
 * one `now` per request, so the flag and the keys can never disagree.
 */
export interface PublicIdentityMode {
  compat: boolean;
  keyer: (appId: string) => Promise<PlayerKeyer>;
}

export function publicIdentity(
  env: Pick<
    Env,
    "LEADERBOARD_RAW_ID_COMPAT_UNTIL" | "LEADERBOARD_PLAYER_KEY_SECRET" | "LEADERBOARD_PLAYER_KEY_WINDOW_SECRET"
  >,
  now: number,
): PublicIdentityMode {
  const compat = compatWindow(env, now) === "open";
  return compat
    ? {
        compat,
        keyer: (appId) =>
          keyerFor(env.LEADERBOARD_PLAYER_KEY_WINDOW_SECRET, "LEADERBOARD_PLAYER_KEY_WINDOW_SECRET", appId),
      }
    : { compat, keyer: (appId) => playerKeyer(env, appId) };
}

/** JSON body for a request refused because no key could be derived. */
export const PLAYER_KEY_UNAVAILABLE_BODY = { error: "player_key_unavailable" } as const;
