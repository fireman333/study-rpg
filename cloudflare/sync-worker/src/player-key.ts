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
 *   else it is handed. Rotating the secret does NOT change the prefix (see
 *   design D5 — keys are never stored by clients, so a rotation needs no marker).
 *
 * ⚠️ Fails CLOSED. With the secret missing or too short, `playerKeyer` throws
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

export type PlayerKeyer = (userId: string) => Promise<string>;

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A key derivation bound to one app, with the imported HMAC key and a per-call
 * memo so a snapshot that lists one player in five rankings signs once.
 *
 * @throws PlayerKeyUnavailableError when the secret is absent or shorter than
 *         PLAYER_KEY_MIN_SECRET_LENGTH.
 */
export async function playerKeyer(env: Pick<Env, "LEADERBOARD_PLAYER_KEY_SECRET">, appId: string): Promise<PlayerKeyer> {
  const secret = env.LEADERBOARD_PLAYER_KEY_SECRET;
  if (typeof secret !== "string" || secret.length === 0) {
    throw new PlayerKeyUnavailableError("LEADERBOARD_PLAYER_KEY_SECRET is not set");
  }
  if (secret.length < PLAYER_KEY_MIN_SECRET_LENGTH) {
    throw new PlayerKeyUnavailableError(
      `LEADERBOARD_PLAYER_KEY_SECRET is shorter than ${PLAYER_KEY_MIN_SECRET_LENGTH} characters`,
    );
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const memo = new Map<string, Promise<string>>();
  return (userId: string) => {
    let hit = memo.get(userId);
    if (!hit) {
      hit = crypto.subtle
        .sign("HMAC", key, enc.encode(`${appId}:${userId}`))
        .then((mac) => PLAYER_KEY_PREFIX + base64url(new Uint8Array(mac).slice(0, PLAYER_KEY_BYTES)));
      memo.set(userId, hit);
    }
    return hit;
  };
}

/**
 * Transition switch for the Worker-first rollout (design D6). While `"1"`, the
 * public surfaces ALSO carry the raw identifier in its old field (`user_id` on
 * a snapshot row, `authorKey` / `id` on a 留言 message) so a client bundle that
 * predates this change keeps finding its own row. Absent — the default and the
 * end state — no public surface carries it.
 *
 * ⚠️ Set only between the Worker deploy and the last client deploy; removing it
 * is step 3 of the rollout. Every surface reads it through this one function.
 */
export function rawIdCompat(env: Pick<Env, "LEADERBOARD_RAW_ID_COMPAT">): boolean {
  return env.LEADERBOARD_RAW_ID_COMPAT === "1";
}

/** JSON body for a request refused because no key could be derived. */
export const PLAYER_KEY_UNAVAILABLE_BODY = { error: "player_key_unavailable" } as const;
