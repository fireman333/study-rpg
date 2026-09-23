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
 */

export interface StoredSnapshot {
  rows: Record<string, unknown>[];
  last_updated_at: number | null;
  total_count: number;
}

export function projectPublicSnapshot(
  snapshot: StoredSnapshot,
  fields: readonly string[],
): StoredSnapshot {
  return {
    rows: snapshot.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const field of fields) {
        if (field in row) out[field] = row[field];
      }
      return out;
    }),
    last_updated_at: snapshot.last_updated_at,
    total_count: snapshot.total_count,
  };
}
