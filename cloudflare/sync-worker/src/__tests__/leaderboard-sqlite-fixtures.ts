// Real-SQLite D1 / KV fakes for the nickname-mask tests.
//
// The tables come from the migration files themselves, never retyped: the claims
// under test are about what the Worker's SQL returns against the schema that
// ships. Same approach as leaderboard-public-snapshot.test.ts; kept separate so
// that file stays exactly as its own change left it.
//
// Change: mask-moderated-leaderboard-nicknames (study-rpg-2nd).

import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "../index";
import { playerKeyer } from "../player-key";

// ⚠️ `createRequire`, not a static import: Vite 5.4 strips the `node:` scheme from
// `node:sqlite` (see leaderboard-upsert-throttle.test.ts).
export const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDb;
};

export interface SqliteDb {
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

export const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

/** Apply `files` (default: every migration) to `path` (default: in-memory). */
export function makeDb(opts: { path?: string; files?: string[] } = {}): SqliteDb {
  const db = new DatabaseSync(opts.path ?? ":memory:");
  for (const f of opts.files ?? migrationFiles()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  }
  return db;
}

type Stmt = {
  bind: (...params: unknown[]) => Stmt;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

/**
 * @param failWhen  SQL text for which every execution throws — to exercise a
 *                  query failing mid-run.
 */
export function d1(db: SqliteDb, failWhen?: (sql: string) => boolean) {
  const guard = (sql: string) => {
    if (failWhen?.(sql)) throw new Error("D1_ERROR: injected failure");
  };
  const stmt = (sql: string, params: unknown[] = []): Stmt => ({
    bind: (...next) => stmt(sql, next),
    first: async <T>() => {
      guard(sql);
      return ((db.prepare(sql).get(...params) as T | undefined) ?? null);
    },
    all: async <T>() => {
      guard(sql);
      return { results: db.prepare(sql).all(...params) as T[] };
    },
    run: async () => {
      guard(sql);
      const r = db.prepare(sql).run(...params);
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    // D1 runs a batch as one transaction; so does this.
    batch: async (stmts: Stmt[]) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

export function kv() {
  const store = new Map<string, string>();
  const puts: string[] = [];
  return {
    store,
    puts,
    get: async (key: string, opts?: { type?: string } | string) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      const type = typeof opts === "string" ? opts : opts?.type;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    put: async (key: string, value: string) => {
      puts.push(key);
      store.set(key, value);
    },
  };
}

export type FakeKv = ReturnType<typeof kv>;

/**
 * The player-key secret every fixture env carries (hash-leaderboard-user-ids).
 * Test-only; 48 characters so it clears PLAYER_KEY_MIN_SECRET_LENGTH.
 */
export const TEST_PLAYER_KEY_SECRET = "test-only-player-key-secret-0123456789abcdefghij";

export function makeEnv(
  db: SqliteDb,
  store: FakeKv,
  failWhen?: (sql: string) => boolean,
  extra: Partial<Pick<Env, "LEADERBOARD_PLAYER_KEY_SECRET" | "LEADERBOARD_RAW_ID_COMPAT">> = {},
): Env {
  return {
    LEADERBOARD_DB: d1(db, failWhen),
    LEADERBOARD_KV: store,
    LEADERBOARD_PLAYER_KEY_SECRET: TEST_PLAYER_KEY_SECRET,
    ...extra,
  } as unknown as Env;
}

/** The public key the Worker derives for `userId` in `app` under the fixture secret. */
export async function testPlayerKey(app: string, userId: string): Promise<string> {
  return (await playerKeyer({ LEADERBOARD_PLAYER_KEY_SECRET: TEST_PLAYER_KEY_SECRET }, app))(userId);
}

export const M2_FILTERS = ["composite", "reputation", "doctor", "study", "correct"] as const;
export const m2Key = (filter: string) => `leaderboard:m2:top100:${filter}`;

export type SnapshotRow = Record<string, unknown>;
export type Snapshot = { rows: SnapshotRow[]; last_updated_at: number | null; total_count: number };

export function storedSnapshot(store: FakeKv, filter: string): Snapshot {
  const raw = store.store.get(m2Key(filter));
  if (raw === undefined) throw new Error(`no snapshot written for ${filter}`);
  return JSON.parse(raw) as Snapshot;
}

/** A 二階 leaderboard row, inserted directly (not through the upsert). */
export function insertM2(
  db: SqliteDb,
  row: { user_id: string; nickname: string; tier?: number; reputation?: number; doctors?: number; updated_at?: number },
): void {
  db.prepare(
    `INSERT INTO leaderboard_m2
       (user_id, nickname, nickname_lower, hospital_tier, reputation, doctor_count,
        total_study_min, is_public, updated_at, badges_csv, subject_mastery_count, total_correct)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, '', 0, ?)`,
  ).run(
    row.user_id,
    row.nickname,
    row.nickname.normalize("NFKC").toLowerCase(),
    row.tier ?? 2,
    row.reputation ?? 1000,
    row.doctors ?? 5,
    100,
    row.updated_at ?? 1_700_000_000_000,
    row.reputation ?? 1000,
  );
}

/**
 * Mask a player the way the owner script does: the name is copied inside the
 * database from the player's own row. Mirrors the script's INSERT.
 */
export function maskInDb(db: SqliteDb, userId: string, at = 1_700_000_500_000): void {
  db.prepare(
    `INSERT INTO leaderboard_nickname_masks (app_id, user_id, nickname_lower, masked_at, reason)
       SELECT 'm2', user_id, nickname_lower, ?, NULL FROM leaderboard_m2 WHERE user_id = ?
       ON CONFLICT(app_id, user_id) DO UPDATE SET
         nickname_lower = excluded.nickname_lower, masked_at = excluded.masked_at, reason = excluded.reason`,
  ).run(at, userId);
}
