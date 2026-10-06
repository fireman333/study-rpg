// Owner-masked leaderboard nicknames, driven through the Worker's real SQL.
//
// Spec (study-rpg-2nd, hospital-leaderboard, change mask-moderated-leaderboard-nicknames):
//   「Owner-maintained nickname mask list keyed by player identity」
//   「Public leaderboard surfaces display a fixed mask for masked players」
//   「Stored nicknames and the player's own reads are never masked」
//
// Why not mocks: every claim here is about what a JOIN returns — that a rename
// lifts the mask, that another player with the same name is untouched, that a
// failed read writes nothing. A mock D1 would return whatever we told it to. So
// the schema is the migration files, the SQL is the Worker's, and requests go
// through the real routers.
//
// ⚠️ No real player's nickname appears in this file. Names are sentinels.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

vi.mock("../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth")>();
  return { ...actual, verifyJWT: vi.fn() };
});
import { verifyJWT } from "../auth";
import type { Env } from "../index";
import worker from "../index";
import { handleLeaderboard, runLeaderboardCron } from "../leaderboard";
import { handleShoutout } from "../shoutout";
import { NICKNAME_MASK, nicknameMaskSql } from "../nickname-mask";
import {
  M2_FILTERS,
  insertM2,
  kv,
  m2Key,
  makeDb,
  makeEnv,
  maskInDb,
  migrationFiles,
  storedSnapshot,
  testPlayerKey,
  type FakeKv,
  type SnapshotRow,
  type SqliteDb,
} from "./leaderboard-sqlite-fixtures";

// 12 codepoints — the longest name the upsert accepts.
const SENTINEL = "mmln-7f3a-zq";
const U_MASKED = "00000000-0000-4000-8000-00000000000a";
const U_OTHER = "00000000-0000-4000-8000-00000000000b";
const U_THIRD = "00000000-0000-4000-8000-00000000000c";
const T = 1_700_000_000_000;

// Public rows and 留言 messages identify players by their player key, not the
// user_id (hash-leaderboard-user-ids). `key(u)` is what the Worker publishes for u.
const KEYS = new Map<string, string>();
beforeAll(async () => {
  for (const app of ["m2", "neurons"]) {
    for (const u of [U_MASKED, U_OTHER, U_THIRD]) KEYS.set(`${app}:${u}`, await testPlayerKey(app, u));
  }
});
const key = (u: string, app = "m2"): string => KEYS.get(`${app}:${u}`)!;

function signIn(sub: string): void {
  vi.mocked(verifyJWT).mockResolvedValue({ sub } as Awaited<ReturnType<typeof verifyJWT>>);
}

async function call(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer t");
  return handleLeaderboard(new Request(`https://api.example${path}`, { ...init, headers }), env, {});
}

async function upsert(env: Env, sub: string, nickname: string, updatedAt: number, reputation = 1000) {
  signIn(sub);
  return call(env, "/leaderboard/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nickname,
      hospital_tier: 2,
      reputation,
      doctor_count: 5,
      total_study_min: 100,
      is_public: 1,
      updated_at: updatedAt,
      force: true,
    }),
  });
}

function rowOf(store: FakeKv, filter: string, userId: string): SnapshotRow | undefined {
  return storedSnapshot(store, filter).rows.find((r) => r.player_key === key(userId));
}

let db: SqliteDb;
let store: FakeKv;
let env: Env;

beforeEach(() => {
  db = makeDb();
  store = kv();
  env = makeEnv(db, store);
  insertM2(db, { user_id: U_MASKED, nickname: SENTINEL, tier: 3, reputation: 5000, doctors: 12 });
  insertM2(db, { user_id: U_OTHER, nickname: "Bravo", tier: 2, reputation: 3000, doctors: 8 });
  insertM2(db, { user_id: U_THIRD, nickname: "Charlie", tier: 1, reputation: 100, doctors: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 5.1 snapshot ────────────────────────────────────────────────────────────

describe("the cron's snapshots", () => {
  it("show the mask for the masked player in all five, and the stored name with false for everyone else", async () => {
    maskInDb(db, U_MASKED);
    await runLeaderboardCron(env);
    for (const filter of M2_FILTERS) {
      const rows = storedSnapshot(store, filter).rows;
      expect(rows.length, filter).toBe(3);
      for (const row of rows) {
        if (row.player_key === key(U_MASKED)) {
          expect(row.nickname, filter).toBe(NICKNAME_MASK);
          expect(row.nickname_masked, filter).toBe(true);
        } else {
          expect(row.nickname_masked, filter).toBe(false);
          expect(row.nickname, filter).toBe(row.player_key === key(U_OTHER) ? "Bravo" : "Charlie");
        }
      }
    }
  });

  it("do not move the masked player: every snapshot's order equals the unmasked run", async () => {
    await runLeaderboardCron(env);
    const before = M2_FILTERS.map((f) => storedSnapshot(store, f).rows.map((r) => r.player_key));
    maskInDb(db, U_MASKED);
    await runLeaderboardCron(env);
    const after = M2_FILTERS.map((f) => storedSnapshot(store, f).rows.map((r) => r.player_key));
    expect(after).toEqual(before);
    // …and my-rank, which counts rows ahead, gives the same answer as well.
    signIn(U_MASKED);
    const res = await call(env, "/leaderboard/my-rank/composite");
    expect(await res.json()).toMatchObject({ in_leaderboard: true, rank: 1, total: 3 });
  });

  it("the public read serves the flag, and never the name, for the masked row", async () => {
    maskInDb(db, U_MASKED);
    await runLeaderboardCron(env);
    for (const filter of M2_FILTERS) {
      const res = await handleLeaderboard(new Request(`https://api.example/leaderboard/${filter}`), env, {});
      const text = await res.text();
      expect(text, filter).not.toContain(SENTINEL);
      const row = (JSON.parse(text) as { rows: SnapshotRow[] }).rows.find((r) => r.player_key === key(U_MASKED));
      expect(row, filter).toMatchObject({ nickname: NICKNAME_MASK, nickname_masked: true });
    }
  });
});

// ─── 5.2 / 5.3 the entry follows the name it was made against ────────────────

describe("an entry applies to the name it recorded, on the player it recorded", () => {
  it("rename lifts it; renaming back in another letter case re-applies it", async () => {
    maskInDb(db, U_MASKED);

    expect((await upsert(env, U_MASKED, "Delta", T + 10)).status).toBe(200);
    await runLeaderboardCron(env);
    expect(rowOf(store, "composite", U_MASKED)).toMatchObject({ nickname: "Delta", nickname_masked: false });
    // The entry itself stays in the list.
    expect(db.prepare("SELECT COUNT(*) AS c FROM leaderboard_nickname_masks").get()).toEqual({ c: 1 });

    expect((await upsert(env, U_MASKED, SENTINEL.toUpperCase(), T + 20)).status).toBe(200);
    await runLeaderboardCron(env);
    expect(rowOf(store, "composite", U_MASKED)).toMatchObject({ nickname: NICKNAME_MASK, nickname_masked: true });
  });

  it("another player holding the recorded name is not masked — identity is the key", async () => {
    maskInDb(db, U_MASKED);
    expect((await upsert(env, U_MASKED, "Delta", T + 10)).status).toBe(200);
    expect((await upsert(env, U_OTHER, SENTINEL, T + 11)).status).toBe(200);
    await runLeaderboardCron(env);
    expect(rowOf(store, "composite", U_OTHER)).toMatchObject({ nickname: SENTINEL, nickname_masked: false });
    expect(rowOf(store, "composite", U_MASKED)).toMatchObject({ nickname: "Delta", nickname_masked: false });
  });
});

// ─── 5.4 fixed length ────────────────────────────────────────────────────────

describe("the mask's length", () => {
  it("is the same for a 2- and a 12-codepoint name", async () => {
    const short = "m7";
    const long = "mmln-7f3a-12";
    expect([...short]).toHaveLength(2);
    expect([...long]).toHaveLength(12);
    expect((await upsert(env, U_OTHER, short, T + 10)).status).toBe(200);
    expect((await upsert(env, U_THIRD, long, T + 11)).status).toBe(200);
    maskInDb(db, U_OTHER);
    maskInDb(db, U_THIRD);
    await runLeaderboardCron(env);
    expect(rowOf(store, "composite", U_OTHER)?.nickname).toBe(NICKNAME_MASK);
    expect(rowOf(store, "composite", U_THIRD)?.nickname).toBe(NICKNAME_MASK);
    expect(NICKNAME_MASK).toBe("***");
  });
});

// ─── 5.5 storage ─────────────────────────────────────────────────────────────

describe("what is stored", () => {
  it("is the pushed name, and two masked players both keep upserting", async () => {
    maskInDb(db, U_MASKED);
    maskInDb(db, U_OTHER);
    const a = await upsert(env, U_MASKED, SENTINEL, T + 10, 6000);
    const b = await upsert(env, U_OTHER, "Bravo", T + 11, 4000);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.json()).toEqual({ ok: true });
    expect(await b.json()).toEqual({ ok: true });
    expect(db.prepare("SELECT nickname, nickname_lower, reputation FROM leaderboard_m2 WHERE user_id = ?").get(U_MASKED))
      .toEqual({ nickname: SENTINEL, nickname_lower: SENTINEL, reputation: 6000 });
    expect(db.prepare("SELECT nickname FROM leaderboard_m2 WHERE user_id = ?").get(U_OTHER)).toEqual({ nickname: "Bravo" });
  });

  it("keeps a masked name reserved: nickname-check still reports it taken", async () => {
    maskInDb(db, U_MASKED);
    signIn(U_OTHER);
    const res = await call(env, `/leaderboard/nickname-check?n=${encodeURIComponent(SENTINEL)}`);
    expect(await res.json()).toEqual({ available: false });
  });
});

// ─── 5.6 own reads ───────────────────────────────────────────────────────────

describe("the player's own reads", () => {
  it("/me returns the stored name with nickname_masked: true to a masked player", async () => {
    maskInDb(db, U_MASKED);
    signIn(U_MASKED);
    const { row } = (await (await call(env, "/leaderboard/me")).json()) as { row: SnapshotRow };
    expect(row.nickname).toBe(SENTINEL);
    expect(row.nickname_masked).toBe(true);
  });

  it("/me returns nickname_masked: false to a player with no applying entry", async () => {
    maskInDb(db, U_MASKED);
    signIn(U_OTHER);
    const { row } = (await (await call(env, "/leaderboard/me")).json()) as { row: SnapshotRow };
    expect(row.nickname).toBe("Bravo");
    expect(row.nickname_masked).toBe(false);
  });

  it("my-rank carries no nickname field at all, masked or not", async () => {
    maskInDb(db, U_MASKED);
    for (const sub of [U_MASKED, U_OTHER]) {
      signIn(sub);
      for (const filter of M2_FILTERS) {
        const body = await (await call(env, `/leaderboard/my-rank/${filter}`)).json();
        const keys = JSON.stringify(body).match(/"[a-z_]+":/g) ?? [];
        expect(keys.length, filter).toBeGreaterThan(0);
        expect(keys.filter((k) => k.includes("nickname")), `${sub} ${filter}`).toEqual([]);
      }
    }
  });
});

// ─── 5.7 account deletion ────────────────────────────────────────────────────

describe("account deletion", () => {
  it("removes the player's mask entry in the same request", async () => {
    maskInDb(db, U_MASKED);
    maskInDb(db, U_OTHER);
    signIn(U_MASKED);
    const res = await call(env, "/leaderboard/me", { method: "DELETE" });
    expect(await res.json()).toEqual({ ok: true, deleted: 1 });
    expect(db.prepare("SELECT user_id FROM leaderboard_nickname_masks ORDER BY user_id").all()).toEqual([
      { user_id: U_OTHER },
    ]);
  });
});

// ─── 5.8 the 留言 board ──────────────────────────────────────────────────────

describe("the 留言 board", () => {
  const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;

  beforeEach(() => {
    // The board read is edge-cached; a miss every time keeps each read a real query.
    vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => {} } });
    const post = db.prepare(
      `INSERT INTO shoutouts_m2
         (author_key, avatar_type, asset_id, message, message_normalized, content_hash,
          created_at, updated_at, last_write_at, writes_day, writes_today)
       VALUES (?, 'doctor', 'doc-1', ?, ?, 'h', ?, ?, ?, '', 0)`,
    );
    post.run(U_MASKED, "hello", "hello", T + 2, T + 2, T + 2);
    post.run(U_OTHER, "hi", "hi", T + 1, T + 1, T + 1);
  });

  async function board(app: string) {
    const res = await handleShoutout(new Request(`https://api.example/shoutouts/${app}`), env, {}, ctx);
    const text = await res.text();
    return { text, messages: (JSON.parse(text) as { messages: { playerKey: string; nickname: string }[] }).messages };
  }

  it("lists the masked author under the mask and everyone else under their name", async () => {
    maskInDb(db, U_MASKED);
    const { text, messages } = await board("m2");
    expect(text).not.toContain(SENTINEL);
    expect(messages.find((m) => m.playerKey === key(U_MASKED))?.nickname).toBe(NICKNAME_MASK);
    expect(messages.find((m) => m.playerKey === key(U_OTHER))?.nickname).toBe("Bravo");
  });

  it("lets a masked player post, and echoes the mask as their display name", async () => {
    maskInDb(db, U_MASKED);
    db.prepare("DELETE FROM shoutouts_m2 WHERE author_key = ?").run(U_MASKED);
    signIn(U_MASKED);
    const res = await handleShoutout(
      new Request("https://api.example/shoutouts/m2", {
        method: "PUT",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: { avatarType: "doctor", assetId: "doc-1" }, message: "posting" }),
      }),
      env,
      {},
      ctx,
    );
    const text = await res.text();
    expect(res.status, text).toBe(200);
    expect(text).not.toContain(SENTINEL);
    expect((JSON.parse(text) as { message: { nickname: string } }).message.nickname).toBe(NICKNAME_MASK);
  });

  it("still refuses a player with no leaderboard row (nickname_required depends only on the row)", async () => {
    signIn("00000000-0000-4000-8000-0000000000ff");
    const res = await handleShoutout(
      new Request("https://api.example/shoutouts/m2", {
        method: "PUT",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: { avatarType: "doctor", assetId: "doc-1" }, message: "x" }),
      }),
      env,
      {},
      ctx,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "nickname_required" });
  });

  it("leaves neurons untouched: an m2 entry does not mask the same user's neurons name", async () => {
    maskInDb(db, U_MASKED);
    db.prepare(
      `INSERT INTO leaderboard_neurons
         (user_id, nickname, nickname_lower, variant_count, family_complete, total_AP,
          synapse_strong, total_study_min, total_settles, badges_csv, is_public, updated_at)
       VALUES (?, ?, ?, 1, 0, 1, 0, 1, 0, '', 1, ?)`,
    ).run(U_MASKED, SENTINEL, SENTINEL, T);
    db.prepare(
      `INSERT INTO shoutouts_neurons
         (author_key, avatar_type, asset_id, message, message_normalized, content_hash,
          created_at, updated_at, last_write_at, writes_day, writes_today)
       VALUES (?, 'neuron', 'n-1', 'yo', 'yo', 'h', ?, ?, ?, '', 0)`,
    ).run(U_MASKED, T, T, T);
    const { messages } = await board("neurons");
    expect(messages.find((m) => m.playerKey === key(U_MASKED, "neurons"))?.nickname).toBe(SENTINEL);
  });
});

// ─── 5.9 a failed read publishes nothing ─────────────────────────────────────

describe("a failed snapshot query", () => {
  const PREVIOUS = JSON.stringify({ rows: [], last_updated_at: T, total_count: 0 });

  function seedPrevious(s: FakeKv): void {
    for (const f of M2_FILTERS) s.store.set(m2Key(f), PREVIOUS);
  }

  it("without the masks table: nothing is written and every previous snapshot stays", async () => {
    const without = makeDb({ files: migrationFiles().filter((f) => !f.startsWith("0011_")) });
    insertM2(without, { user_id: U_MASKED, nickname: SENTINEL });
    const s = kv();
    seedPrevious(s);
    await expect(runLeaderboardCron(makeEnv(without, s))).rejects.toThrow(/leaderboard_nickname_masks/);
    expect(s.puts).toEqual([]);
    for (const f of M2_FILTERS) expect(s.store.get(m2Key(f))).toBe(PREVIOUS);
  });

  it("when only the last filter's query fails, none of the five is written", async () => {
    const s = kv();
    seedPrevious(s);
    const failing = makeEnv(db, s, (sql) => /ORDER BY total_correct DESC/.test(sql));
    await expect(runLeaderboardCron(failing)).rejects.toThrow(/injected/);
    expect(s.puts).toEqual([]);
  });

  it("the scheduled trigger logs the failure", async () => {
    const without = makeDb({ files: migrationFiles().filter((f) => !f.startsWith("0011_")) });
    const s = kv();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending: Promise<unknown>[] = [];
    await worker.scheduled(
      { cron: "0,30 * * * *" } as ScheduledEvent,
      makeEnv(without, s),
      { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext,
    );
    await Promise.all(pending);
    expect(errors).toHaveBeenCalledWith("[scheduled] runLeaderboardCron failed", expect.anything());
    expect(s.puts).toEqual([]);
  });
});

// ─── the fragment itself ─────────────────────────────────────────────────────

describe("nicknameMaskSql", () => {
  it("joins on app, user and recorded name, and binds the mask rather than splicing it", () => {
    const sql = nicknameMaskSql("m2", "l");
    expect(sql.join).toMatch(/\.app_id = 'm2'/);
    expect(sql.join).toMatch(/\.user_id = l\.user_id/);
    expect(sql.join).toMatch(/\.nickname_lower = l\.nickname_lower/);
    expect(sql.displayName.split("?")).toHaveLength(2);
    expect(`${sql.displayName}${sql.masked}${sql.join}`).not.toContain(NICKNAME_MASK);
  });

  it("refuses an app id or alias that is not a plain identifier", () => {
    expect(() => nicknameMaskSql("m2'; DROP TABLE x; --", "l")).toThrow();
    expect(() => nicknameMaskSql("m2", "l.x")).toThrow();
  });
});
