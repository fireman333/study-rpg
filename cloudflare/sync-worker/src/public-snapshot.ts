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
 * where they carried `user_id`. A row stored before that change is keyed here, on
 * read, so the raw id stops leaving the Worker on deploy rather than at the next
 * cron.
 */

import type { PlayerKeyer } from "./player-key";

export interface StoredSnapshot {
  rows: Record<string, unknown>[];
  last_updated_at: number | null;
  total_count: number;
}

/**
 * The public row's identity field. Every public snapshot row carries it instead
 * of the raw `user_id` (change hash-leaderboard-user-ids; see player-key.ts).
 */
export const PLAYER_KEY_FIELD = "player_key";

export interface PublicIdentity {
  /**
   * Derivation for rows stored before the change (they carry `user_id` and no
   * `player_key`). Called at most once per projection, and only when such a row
   * is present, so a fresh snapshot is served without touching the secret.
   * Throws PlayerKeyUnavailableError when the secret is missing — the caller
   * turns that into a refusal, never into a row carrying the raw id.
   */
  keyer: () => Promise<PlayerKeyer>;
  /** rawIdCompat(env): also emit the stored `user_id` (rollout window only). */
  compat: boolean;
}

/**
 * Project a stored snapshot onto `fields` (which lists `player_key` and never
 * `user_id`), deriving the key for pre-change rows and emitting `user_id` only in
 * the compat window.
 */
export async function projectPublicSnapshot(
  snapshot: StoredSnapshot,
  fields: readonly string[],
  identity: PublicIdentity,
): Promise<StoredSnapshot> {
  let keyOf: PlayerKeyer | null = null;
  const rows: Record<string, unknown>[] = [];
  for (const row of snapshot.rows) {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in row) out[field] = row[field];
    }
    const rawId = typeof row.user_id === "string" ? row.user_id : null;
    if (!(PLAYER_KEY_FIELD in out) && rawId !== null) {
      keyOf ??= await identity.keyer();
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
 * read `user_id` to derive the key; this is where it stops travelling.
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
