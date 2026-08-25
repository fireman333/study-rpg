// The leaderboard upsert's throttle predicate, driven against a real SQLite.
//
// Why this is not a mock test: the whole claim of the throttle is that a
// suppressed upsert writes ZERO rows — table and index alike — so D1 meters
// nothing for it. That is a property of SQLite's UPSERT semantics, not of our
// JavaScript, and a mock that returns `{changes: 0}` because we told it to
// proves only that we can write a mock.
//
// Measured motivation (2026-08-21): 10,310 rows written in 24h across ~10
// active players (10.3% of the free daily allowance), at 7.19 written rows per
// write query because `leaderboard_m2` carries 7 indexes, while the visible
// ranking is recomputed from KV only every 30 minutes.
//
// Change: throttle-leaderboard-upsert-and-cache-assets (study-rpg-2nd).

import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

// ⚠️ Loaded through `createRequire` rather than imported. Vite 5.4 predates
// `node:sqlite` and is not aware it is a builtin, so a static import gets its
// scheme stripped and fails to resolve as a package named "sqlite". A runtime
// require is not analysed, so it reaches Node untouched. Adding the module to
// the Vitest config's externals was tried first and does nothing.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number | bigint };
      get(): unknown;
    };
  };
};
import { LEADERBOARD_THROTTLE_MS, LEADERBOARD_UPSERT_SQL } from "../leaderboard";

// ⚠️ Read from the Worker rather than retyped. A local literal here would have
// made every case below prove only that the predicate honours whatever gap it
// is handed — change the Worker constant to 60 minutes and the whole file would
// have stayed green. Caught in review; the assertion just below is what keeps
// this honest.
const WINDOW_MS = LEADERBOARD_THROTTLE_MS;
const T0 = 1_700_000_000_000;

/**
 * The live table, copied from production `sqlite_master` on 2026-08-21 in
 * shape: 12 columns and the indexes that make one logical upsert cost ~7 rows.
 *
 * ⚠️ Index count is the reason the throttle exists at all, so the test carries
 * them even though nothing here asserts on them directly — a suppressed write
 * must skip these too, and it does so only because SQLite treats a false
 * `DO UPDATE ... WHERE` as a no-op rather than as a write of unchanged values.
 */
const SCHEMA = `
CREATE TABLE leaderboard_m2 (
  user_id               TEXT PRIMARY KEY,
  nickname              TEXT NOT NULL,
  nickname_lower        TEXT NOT NULL UNIQUE,
  hospital_tier         INTEGER NOT NULL CHECK (hospital_tier BETWEEN 1 AND 4),
  reputation            INTEGER NOT NULL,
  doctor_count          INTEGER NOT NULL CHECK (doctor_count >= 0),
  total_study_min       INTEGER NOT NULL,
  is_public             INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  badges_csv            TEXT,
  subject_mastery_count INTEGER,
  total_correct         INTEGER CHECK (total_correct >= 0)
);
CREATE INDEX idx_leaderboard_m2_composite     ON leaderboard_m2(is_public, hospital_tier, reputation);
CREATE INDEX idx_leaderboard_m2_reputation    ON leaderboard_m2(reputation);
CREATE INDEX idx_leaderboard_m2_doctor_count  ON leaderboard_m2(doctor_count);
CREATE INDEX idx_leaderboard_m2_study_min     ON leaderboard_m2(total_study_min);
CREATE INDEX idx_leaderboard_m2_total_correct ON leaderboard_m2(total_correct);
`;

let db: InstanceType<typeof DatabaseSync>;

/** One upsert, with the same parameter order the Worker binds. */
function upsert(opts: {
  updatedAt: number;
  reputation?: number;
  minGapMs?: number | null;
  nickname?: string;
}): number {
  const stmt = db.prepare(LEADERBOARD_UPSERT_SQL);
  const r = stmt.run(
    "u-1",
    opts.nickname ?? "tester",
    (opts.nickname ?? "tester").toLowerCase(),
    3,
    opts.reputation ?? 1000,
    10,
    100,
    1,
    opts.updatedAt,
    "study:P1",
    4,
    500,
    opts.minGapMs === undefined ? WINDOW_MS : opts.minGapMs,
  );
  return Number(r.changes);
}

function storedUpdatedAt(): number | undefined {
  const row = db.prepare("SELECT updated_at FROM leaderboard_m2 WHERE user_id = 'u-1'").get() as
    | { updated_at: number }
    | undefined;
  return row?.updated_at;
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
});

describe("the window constant", () => {
  it("is the 15 minutes the client repo mirrors", () => {
    // The client declares its own copy in
    // `apps/medexam2-hospital-tw/src/lib/leaderboard/throttle.ts` (study-rpg-2nd)
    // — separate repos, no shared module, so nothing can import across. This
    // pins the value on this side; the response now echoes `window_ms` so a
    // drift is also detectable at runtime rather than only in prose.
    expect(LEADERBOARD_THROTTLE_MS).toBe(15 * 60_000);
  });
});

describe("the throttle window", () => {
  it("inserts a first-ever row regardless of the window", () => {
    // A newly opted-in player has no prior write to measure a window against,
    // and must appear rather than wait. The predicate hangs off DO UPDATE, so
    // the INSERT branch never consults it — attaching it to the INSERT instead
    // would silence exactly this player.
    expect(upsert({ updatedAt: T0 })).toBe(1);
  });

  it("writes nothing for a second upsert inside the window", () => {
    upsert({ updatedAt: T0 });
    expect(upsert({ updatedAt: T0 + 60_000, reputation: 9999 })).toBe(0);
    // And the row genuinely did not move — `changes: 0` is not a report about
    // some other row.
    expect(storedUpdatedAt()).toBe(T0);
  });

  it("writes once the window has elapsed", () => {
    upsert({ updatedAt: T0 });
    expect(upsert({ updatedAt: T0 + WINDOW_MS + 1000, reputation: 9999 })).toBe(1);
    expect(storedUpdatedAt()).toBe(T0 + WINDOW_MS + 1000);
  });

  it("treats the boundary as exclusive on both sides of one millisecond", () => {
    // Not decoration: an off-by-one here is a silent doubling or halving of the
    // write rate, and nothing else in the system would report it.
    upsert({ updatedAt: T0 });
    expect(upsert({ updatedAt: T0 + WINDOW_MS })).toBe(0);
    expect(upsert({ updatedAt: T0 + WINDOW_MS + 1 })).toBe(1);
  });
});

describe("a forced push", () => {
  it("writes inside the window", () => {
    // The client's manual and lifecycle paths. Without this the server silently
    // overrides the exemption the client honours, and the row-staleness
    // notice's repair button cannot fix the row it complains about.
    upsert({ updatedAt: T0 });
    expect(upsert({ updatedAt: T0 + 1000, reputation: 9999, minGapMs: 0 })).toBe(1);
  });

  it("is still subject to last-write-wins", () => {
    // The marker exempts a payload from the WINDOW, never from ordering. A
    // forced push carrying an older timestamp must not overwrite a newer row.
    upsert({ updatedAt: T0 + WINDOW_MS + 1000 });
    expect(upsert({ updatedAt: T0, reputation: 1, minGapMs: 0 })).toBe(0);
    expect(storedUpdatedAt()).toBe(T0 + WINDOW_MS + 1000);
  });

  it("is still subject to the schema's own bounds", () => {
    upsert({ updatedAt: T0 });
    expect(() =>
      db
        .prepare(LEADERBOARD_UPSERT_SQL)
        .run("u-1", "t", "t", 3, 1000, -5, 100, 1, T0 + 1000, "", 0, 0, 0),
    ).toThrow(/CHECK/);
  });
});

describe("the unbound-parameter failure mode", () => {
  it("suppresses every update forever when the gap is NULL", () => {
    // Pinned deliberately. `x + NULL < y` is NULL, not true, so a missing 13th
    // binding does not fall back to "no throttle" — it freezes the row
    // permanently, which is the same visible outcome as the 2026 leaderboard
    // freeze this project already spent weeks diagnosing.
    //
    // The Worker computes this value from a ternary over a constant, so it
    // cannot be undefined there. This test exists so that if someone later
    // makes it optional, the consequence is already written down.
    upsert({ updatedAt: T0 });
    expect(upsert({ updatedAt: T0 + WINDOW_MS * 100, minGapMs: null })).toBe(0);
    expect(storedUpdatedAt()).toBe(T0);
  });
});
