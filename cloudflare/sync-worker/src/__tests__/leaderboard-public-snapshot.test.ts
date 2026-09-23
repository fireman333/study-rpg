// The public leaderboard snapshots carry only fields a leaderboard page uses.
//
// Why this exists: `GET /leaderboard/:filter` and `GET /leaderboard/neurons/:filter`
// need no login, and until 2026-09-23 every row carried the player's
// `updated_at` — the moment their client last pushed. Pushes only happen while
// the app is open, and the snapshot is re-fetchable every 30 minutes, so the
// field published each nickname's daily activity pattern. No client read it.
// Measured on production that day: 52/52 二階 rows and 24/24 neurons rows.
//
// Why this is not a mock test: the cron's projection is a SQL column list, and
// the claim is about what that SQL returns and what the read path then sends.
// A mock D1 that returns rows we hand-built would prove only that we can build
// rows. So the tables come from the real migration files, the cron runs its
// real query against SQLite, and the snapshot is read back through the real
// router with a real Request.
//
// Change: drop-sync-time-from-public-leaderboard (study-rpg-2nd).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ⚠️ Loaded through `createRequire` for the reason documented in
// leaderboard-upsert-throttle.test.ts: Vite 5.4 does not know `node:sqlite` is a
// builtin and strips the scheme from a static import.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): unknown;
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
  };
};

// Mock ONLY verifyJWT (the JWKS fetch) so the JWT-gated `/me` reads can run;
// the real extractBearer still parses the Authorization header. Same pattern
// as r2-read.test.ts.
vi.mock("../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth")>();
  return { ...actual, verifyJWT: vi.fn() };
});
import { verifyJWT } from "../auth";
import type { Env } from "../index";
import {
  PUBLIC_SNAPSHOT_FIELDS,
  handleLeaderboard,
  runLeaderboardCron,
} from "../leaderboard";
import {
  PUBLIC_SNAPSHOT_FIELDS as NEURONS_PUBLIC_SNAPSHOT_FIELDS,
  handleNeuronsLeaderboard,
  runNeuronsLeaderboardCron,
} from "../neurons-leaderboard";

// The contract, copied from the requirement `Public snapshot rows SHALL NOT
// disclose when a player last synced` (study-rpg-2nd hospital-leaderboard).
// ⚠️ Deliberately a literal, not imported from the Worker: the point of these
// two sets is to fail when the Worker's list moves without the spec moving.
// `nickname_masked` joins the list with the requirement「Public leaderboard
// surfaces display a fixed mask for masked players」(change
// mask-moderated-leaderboard-nicknames), which requires every snapshot row to
// carry it. ⚠️ The sync-time requirement's own enumerated list predates that
// change; whichever of the two is archived second reconciles the list.
const M2_SPEC_FIELDS = [
  "user_id",
  "nickname",
  "nickname_masked",
  "hospital_tier",
  "reputation",
  "doctor_count",
  "total_study_min",
  "badges_csv",
  "subject_mastery_count",
  "total_correct",
];
// Neurons has no spec requirement of its own yet (sibling repo follow-up);
// this is the set its page renders or matches on, minus the sync time.
const NEURONS_SPEC_FIELDS = [
  "user_id",
  "nickname",
  "variant_count",
  "total_AP",
  "total_study_min",
  "total_settles",
  "badges_csv",
];

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

// --- Minimal D1 / KV over real SQLite --------------------------------------

function makeDb() {
  const db = new DatabaseSync(":memory:");
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  // Coverage floor: a directory move that finds nothing would otherwise make
  // every query below fail for a reason unrelated to this test's claim.
  expect(files.length).toBeGreaterThanOrEqual(10);
  for (const f of files) db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  return db;
}

type Db = ReturnType<typeof makeDb>;

function d1(db: Db) {
  const stmt = (sql: string, params: unknown[] = []) => ({
    bind: (...next: unknown[]) => stmt(sql, next),
    first: async () => (db.prepare(sql).get(...params) as unknown) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => db.prepare(sql).run(...params),
  });
  return { prepare: (sql: string) => stmt(sql) };
}

function kv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string, opts?: { type?: string }) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return opts?.type === "json" ? JSON.parse(raw) : raw;
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function makeEnv(db: Db, store: ReturnType<typeof kv>): Env {
  return { LEADERBOARD_DB: d1(db), LEADERBOARD_KV: store } as unknown as Env;
}

type Row = Record<string, unknown>;
type Payload = { rows: Row[]; last_updated_at: number | null; total_count: number };

function filtersWritten(store: ReturnType<typeof kv>, prefix: string): string[] {
  const filters = [...store.store.keys()]
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
  // Both crons write five snapshots. Deriving the list from what the cron
  // wrote keeps a sixth filter covered without editing this file; the floor
  // keeps a cron that wrote nothing from passing every loop below vacuously.
  expect(filters.length).toBeGreaterThanOrEqual(5);
  return filters;
}

const T = 1_700_000_000_000;

// --- 二階 ------------------------------------------------------------------

describe("二階 public snapshot", () => {
  let db: Db;
  let store: ReturnType<typeof kv>;
  let env: Env;

  beforeEach(() => {
    db = makeDb();
    store = kv();
    env = makeEnv(db, store);
    const insert = db.prepare(
      `INSERT INTO leaderboard_m2
         (user_id, nickname, nickname_lower, hospital_tier, reputation, doctor_count,
          total_study_min, is_public, updated_at, badges_csv, subject_mastery_count, total_correct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run("u-a", "Alpha", "alpha", 3, 5000, 12, 900, 1, T + 1, "study:P2", 4, 1200);
    insert.run("u-b", "Bravo", "bravo", 2, 3000, 8, 400, 1, T + 2, "", 0, 300);
    insert.run("u-hidden", "Hidden", "hidden", 4, 99999, 50, 9999, 0, T + 3, "", 0, 9999);
  });

  async function read(filter: string): Promise<Payload> {
    const res = await handleLeaderboard(
      new Request(`https://api.example/leaderboard/${filter}`),
      env,
      {},
    );
    expect(res.status).toBe(200);
    return (await res.json()) as Payload;
  }

  it("the public field list is the spec's list and does not include the sync time", () => {
    expect([...PUBLIC_SNAPSHOT_FIELDS].sort()).toEqual([...M2_SPEC_FIELDS].sort());
    expect(PUBLIC_SNAPSHOT_FIELDS).not.toContain("updated_at");
  });

  it("the cron writes no sync time into any snapshot", async () => {
    await runLeaderboardCron(env);
    for (const filter of filtersWritten(store, "leaderboard:m2:top100:")) {
      const payload = JSON.parse(store.store.get(`leaderboard:m2:top100:${filter}`)!) as Payload;
      expect(payload.rows.length, filter).toBe(2);
      for (const row of payload.rows) expect(row, filter).not.toHaveProperty("updated_at");
    }
  });

  it("every row the public read returns carries exactly the listed fields", async () => {
    await runLeaderboardCron(env);
    for (const filter of filtersWritten(store, "leaderboard:m2:top100:")) {
      const payload = await read(filter);
      expect(payload.rows.length, filter).toBe(2);
      expect(payload.total_count).toBe(2);
      for (const row of payload.rows) {
        expect(Object.keys(row).sort(), filter).toEqual([...M2_SPEC_FIELDS].sort());
      }
    }
  });

  it("a snapshot stored before the change is served without the sync time or unlisted fields", async () => {
    // What production KV holds at the moment the fixed Worker is deployed, plus
    // one field that was never meant to be public, plus a pre-0005 row that
    // lacks total_correct (which the client coalesces to 0 — it must stay
    // absent, not become `undefined` / `null`).
    const legacy = {
      rows: [
        {
          user_id: "u-a", nickname: "Alpha", hospital_tier: 3, reputation: 5000,
          doctor_count: 12, total_study_min: 900, updated_at: T + 1,
          badges_csv: "study:P2", subject_mastery_count: 4, total_correct: 1200,
          nickname_lower: "alpha",
        },
        {
          user_id: "u-old", nickname: "Old", hospital_tier: 1, reputation: 10,
          doctor_count: 1, total_study_min: 5, updated_at: T + 9,
        },
      ],
      last_updated_at: T + 100,
      total_count: 2,
    };
    await store.put("leaderboard:m2:top100:composite", JSON.stringify(legacy));

    const payload = await read("composite");
    expect(payload.last_updated_at).toBe(T + 100);
    expect(payload.total_count).toBe(2);
    for (const row of payload.rows) {
      expect(row).not.toHaveProperty("updated_at");
      expect(row).not.toHaveProperty("nickname_lower");
    }
    const [a, old] = payload.rows;
    const { updated_at: _u, nickname_lower: _n, ...expectedA } = legacy.rows[0];
    expect(a).toEqual(expectedA);
    expect(Object.keys(old).sort()).toEqual(
      ["user_id", "nickname", "hospital_tier", "reputation", "doctor_count", "total_study_min"].sort(),
    );
  });

  it("the player's own row, read with their token, still carries its write time", async () => {
    // The row-staleness notice states when the player's own row was last
    // written, from this read. Withholding the field from the PUBLIC snapshot
    // must not reach it.
    vi.mocked(verifyJWT).mockResolvedValue({ sub: "u-a" } as Awaited<ReturnType<typeof verifyJWT>>);
    const res = await handleLeaderboard(
      new Request("https://api.example/leaderboard/me", { headers: { Authorization: "Bearer t" } }),
      env,
      {},
    );
    expect(res.status).toBe(200);
    const { row } = (await res.json()) as { row: Row };
    expect(row.user_id).toBe("u-a");
    expect(row.updated_at).toBe(T + 1);
  });

  it("an empty snapshot still reads as the cold-start payload", async () => {
    expect(await read("composite")).toEqual({ rows: [], last_updated_at: null, total_count: 0 });
  });
});

// --- neurons ---------------------------------------------------------------

describe("neurons public snapshot", () => {
  let db: Db;
  let store: ReturnType<typeof kv>;
  let env: Env;

  beforeEach(() => {
    db = makeDb();
    store = kv();
    env = makeEnv(db, store);
    const insert = db.prepare(
      `INSERT INTO leaderboard_neurons
         (user_id, nickname, nickname_lower, variant_count, family_complete, total_AP,
          synapse_strong, total_study_min, total_settles, badges_csv, is_public, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run("n-a", "Alpha", "alpha", 40, 2, 800, 3, 600, 12, "ap:P2", 1, T + 1);
    insert.run("n-b", "Bravo", "bravo", 10, 0, 100, 0, 60, 1, "", 1, T + 2);
    insert.run("n-hidden", "Hidden", "hidden", 200, 9, 9999, 9, 9999, 99, "", 0, T + 3);
  });

  async function read(filter: string): Promise<Payload> {
    const res = await handleNeuronsLeaderboard(
      new Request(`https://api.example/leaderboard/neurons/${filter}`),
      env,
      {},
    );
    expect(res.status).toBe(200);
    return (await res.json()) as Payload;
  }

  it("the public field list does not include the sync time", () => {
    expect([...NEURONS_PUBLIC_SNAPSHOT_FIELDS].sort()).toEqual([...NEURONS_SPEC_FIELDS].sort());
    expect(NEURONS_PUBLIC_SNAPSHOT_FIELDS).not.toContain("updated_at");
  });

  it("the cron writes no sync time, and every public row carries exactly the listed fields", async () => {
    await runNeuronsLeaderboardCron(env);
    for (const filter of filtersWritten(store, "leaderboard:neurons:top100:")) {
      const stored = JSON.parse(store.store.get(`leaderboard:neurons:top100:${filter}`)!) as Payload;
      for (const row of stored.rows) expect(row, filter).not.toHaveProperty("updated_at");

      const payload = await read(filter);
      expect(payload.rows.length, filter).toBe(2);
      for (const row of payload.rows) {
        expect(Object.keys(row).sort(), filter).toEqual([...NEURONS_SPEC_FIELDS].sort());
      }
    }
  });

  it("the player's own row, read with their token, still carries its write time", async () => {
    vi.mocked(verifyJWT).mockResolvedValue({ sub: "n-a" } as Awaited<ReturnType<typeof verifyJWT>>);
    const res = await handleNeuronsLeaderboard(
      new Request("https://api.example/leaderboard/neurons/me", { headers: { Authorization: "Bearer t" } }),
      env,
      {},
    );
    expect(res.status).toBe(200);
    const { row } = (await res.json()) as { row: Row };
    expect(row.user_id).toBe("n-a");
    expect(row.updated_at).toBe(T + 1);
  });

  it("a snapshot stored before the change is served without the sync time or unlisted fields", async () => {
    const legacy = {
      rows: [
        {
          user_id: "n-a", nickname: "Alpha", variant_count: 40, total_AP: 800,
          total_study_min: 600, total_settles: 12, badges_csv: "ap:P2", updated_at: T + 1,
          synapse_strong: 3,
        },
      ],
      last_updated_at: T + 100,
      total_count: 1,
    };
    await store.put("leaderboard:neurons:top100:composite", JSON.stringify(legacy));

    const payload = await read("composite");
    expect(payload.last_updated_at).toBe(T + 100);
    const { updated_at: _u, synapse_strong: _s, ...expected } = legacy.rows[0];
    expect(payload.rows).toEqual([expected]);
  });
});
