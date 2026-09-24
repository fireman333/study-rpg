/**
 * Projection applied to a leaderboard snapshot at the moment it is served.
 *
 * Shared by the 二階 and neurons public reads (`GET /leaderboard/:filter`,
 * `GET /leaderboard/neurons/:filter`), which need no login. Each module passes
 * its own allowlist; a row leaves the Worker carrying only those fields.
 *
 * Why an allowlist applied on READ, when the cron's SELECT already uses the same
 * list: KV holds whatever the last successful cron wrote. On the day a field is
 * withdrawn, the stored snapshot still carries it until the next refresh — and
 * indefinitely if the cron is failing. Projecting here makes the withdrawal take
 * effect on deploy. And an allowlist rather than `delete row.x`: a denylist only
 * stops the field someone already thought of, and the next column added to the
 * snapshot query would be published without anyone deciding to.
 *
 * A listed field absent from a stored row stays absent — older snapshots predate
 * some columns, and the clients coalesce absence (not `undefined`, not `null`).
 *
 * Change: drop-sync-time-from-public-leaderboard (study-rpg-2nd) — until
 * 2026-09-23 every public row carried the player's `updated_at`, i.e. when they
 * last had the app open.
 *
 * Change: hash-leaderboard-user-ids — rows carry `player_key` (a keyed hash)
 * where they carried `user_id`. A row stored with its `user_id` (before that
 * change, or during the compat window) is keyed here, on read, so the raw id
 * stops leaving the Worker on deploy — and the window's keys at its deadline —
 * rather than at the next cron.
 */

import type { PlayerKeyer } from "./player-key";

export interface StoredSnapshot {
  rows: Record<string, unknown>[];
  last_updated_at: number | null;
  total_count: number;
  /**
   * `PlayerKeyer.epoch` of the secret the rows' `player_key`s were derived under.
   * Absent on snapshots written before it existed. Stays in KV: the projection
   * below never copies it out.
   */
  key_epoch?: string;
}

/**
 * The public row's identity field. Every public snapshot row carries it instead
 * of the raw `user_id` (change hash-leaderboard-user-ids; see player-key.ts).
 */
export const PLAYER_KEY_FIELD = "player_key";

export interface SnapshotIdentity {
  /**
   * The derivation in force (publicIdentity(env, now).keyer). Called at most once
   * per projection, and only when a stored row still carries `user_id` — a
   * snapshot keyed with no raw id in it is served without touching the secret.
   * Throws PlayerKeyUnavailableError when the secret is missing.
   */
  keyer: () => Promise<PlayerKeyer>;
  /** publicIdentity(env, now).compat: also emit the stored `user_id` (rollout window only). */
  compat: boolean;
}

/**
 * Project a stored snapshot onto `fields` (which lists `player_key` and never
 * `user_id`), emitting `user_id` only in the compat window.
 *
 * Which key a row leaves with — the rule that makes the window's keys die with it:
 *   - a row that carries `user_id` (written before this change, or during the
 *     compat window) is keyed HERE, under the secret in force now, unless the
 *     snapshot records that it was keyed under that same secret (`key_epoch`).
 *     So the first read after the window closes serves permanent keys, not the
 *     window keys stored beside the raw ids — no waiting for the next cron.
 *   - a row with no `user_id` can only be served with the key it was stored with.
 *     After a later rotation of the permanent secret that key is stale until the
 *     next refresh (≤ 30 minutes; design D5) — nothing in KV can re-derive it.
 *
 * Secret missing: rows carrying `user_id` cannot be keyed → PlayerKeyUnavailableError
 * (the caller answers 503). ⚠️ No fallback to the stored keys of such rows: a row
 * that carries both `user_id` and `player_key` can only have been written during
 * the compat window, so its stored key IS a window key, and serving it after the
 * deadline is exactly what the window secret exists to prevent (review P4). A
 * snapshot with no `user_id` at all needs no secret and is served as stored.
 */
export async function projectPublicSnapshot(
  snapshot: StoredSnapshot,
  fields: readonly string[],
  identity: SnapshotIdentity,
): Promise<StoredSnapshot> {
  const keyOf: PlayerKeyer | null = snapshot.rows.some((row) => typeof row.user_id === "string")
    ? await identity.keyer()
    : null;
  const rekey = keyOf !== null && snapshot.key_epoch !== keyOf.epoch;
  const rows: Record<string, unknown>[] = [];
  for (const row of snapshot.rows) {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in row) out[field] = row[field];
    }
    const rawId = typeof row.user_id === "string" ? row.user_id : null;
    if (keyOf !== null && rawId !== null && (rekey || !(PLAYER_KEY_FIELD in out))) {
      out[PLAYER_KEY_FIELD] = await keyOf(rawId);
    }
    if (identity.compat && rawId !== null) out.user_id = rawId;
    rows.push(out);
  }
  return {
    rows,
    last_updated_at: snapshot.last_updated_at,
    total_count: snapshot.total_count,
  };
}

/**
 * What the cron stores for each row it SELECTed: the row with `user_id` replaced
 * by `player_key` — or, in the compat window, alongside it. The SELECT has to
 * read `user_id` to derive the key; this is where it stops travelling. The caller
 * stores `keyOf.epoch` as the snapshot's `key_epoch`.
 */
export async function keyStoredRows<R extends { user_id: string }>(
  rows: readonly R[],
  keyOf: PlayerKeyer,
  compat: boolean,
): Promise<(Omit<R, "user_id"> & { player_key: string; user_id?: string })[]> {
  return Promise.all(
    rows.map(async ({ user_id, ...rest }) => ({
      ...rest,
      player_key: await keyOf(user_id),
      ...(compat ? { user_id } : {}),
    })),
  );
}
