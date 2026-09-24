// The public player key: what replaces the Supabase user_id on every login-free surface.
//
// Change: hash-leaderboard-user-ids. Until it, `GET /leaderboard/:filter`,
// `GET /leaderboard/neurons/:filter` and `GET /shoutouts/:app` published each
// player's account identifier. The claims below are about what actually leaves
// the Worker, so they run the real cron and the real routers against SQLite built
// from the migration files, and the "no raw id" checks scan the WHOLE serialized
// output for anything shaped like a UUID — not a list of field names. A field
// added next month that carried a user_id under a new name would turn this red.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth")>();
  return { ...actual, verifyJWT: vi.fn() };
});
import { verifyJWT } from "../auth";
import type { Env } from "../index";
import { handleLeaderboard, runLeaderboardCron } from "../leaderboard";
import { handleNeuronsLeaderboard, runNeuronsLeaderboardCron } from "../neurons-leaderboard";
import { handleShoutout } from "../shoutout";
import {
  PLAYER_KEY_MIN_SECRET_LENGTH,
  PLAYER_KEY_PATTERN,
  PlayerKeyUnavailableError,
  playerKeyer,
} from "../player-key";
import {
  M2_FILTERS,
  TEST_PLAYER_KEY_SECRET,
  insertM2,
  kv,
  m2Key,
  makeDb,
  makeEnv,
  testPlayerKey,
  type FakeKv,
  type SqliteDb,
} from "./leaderboard-sqlite-fixtures";

const U_A = "00000000-0000-4000-8000-0000000000a1";
const U_B = "00000000-0000-4000-8000-0000000000b2";
const U_C = "00000000-0000-4000-8000-0000000000c3";
const U_D = "00000000-0000-4000-8000-0000000000d4";
const T = 1_700_000_000_000;
const NEURONS_FILTERS = ["composite", "variants", "ap", "study", "settles"] as const;
const neuronsKey = (f: string) => `leaderboard:neurons:top100:${f}`;

/** Any UUID, in any field, under any name. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;

function signIn(sub: string): void {
  vi.mocked(verifyJWT).mockResolvedValue({ sub } as Awaited<ReturnType<typeof verifyJWT>>);
}

function seed(db: SqliteDb): void {
  insertM2(db, { user_id: U_A, nickname: "Alpha", tier: 4, reputation: 9000 });
  insertM2(db, { user_id: U_B, nickname: "Bravo", tier: 3, reputation: 5000 });
  insertM2(db, { user_id: U_C, nickname: "Charlie", tier: 2, reputation: 100 });
  const neurons = db.prepare(
    `INSERT INTO leaderboard_neurons
       (user_id, nickname, nickname_lower, variant_count, family_complete, total_AP,
        synapse_strong, total_study_min, total_settles, badges_csv, is_public, updated_at)
     VALUES (?, ?, ?, ?, 0, 10, 0, 10, 1, '', 1, ?)`,
  );
  neurons.run(U_A, "Alpha", "alpha", 30, T);
  neurons.run(U_B, "Bravo", "bravo", 20, T);
  for (const [table, avatar, asset] of [
    ["shoutouts_m2", "doctor", "doc-1"],
    ["shoutouts_neurons", "neuron", "n-1"],
  ] as const) {
    const post = db.prepare(
      `INSERT INTO ${table}
         (author_key, avatar_type, asset_id, message, message_normalized, content_hash,
          created_at, updated_at, last_write_at, writes_day, writes_today)
       VALUES (?, '${avatar}', '${asset}', ?, ?, 'h', ?, ?, ?, '', 0)`,
    );
    post.run(U_A, "hello", "hello", T + 2, T + 2, T + 2);
    post.run(U_B, "hi", "hi", T + 1, T + 1, T + 1);
  }
}

async function publicReads(env: Env): Promise<Record<string, { status: number; text: string }>> {
  const out: Record<string, { status: number; text: string }> = {};
  for (const f of M2_FILTERS) {
    const res = await handleLeaderboard(new Request(`https://api.example/leaderboard/${f}`), env, {});
    out[`m2:${f}`] = { status: res.status, text: await res.text() };
  }
  for (const f of NEURONS_FILTERS) {
    const res = await handleNeuronsLeaderboard(
      new Request(`https://api.example/leaderboard/neurons/${f}`),
      env,
      {},
    );
    out[`neurons:${f}`] = { status: res.status, text: await res.text() };
  }
  for (const app of ["m2", "neurons"]) {
    const res = await handleShoutout(new Request(`https://api.example/shoutouts/${app}`), env, {}, ctx);
    out[`board:${app}`] = { status: res.status, text: await res.text() };
  }
  return out;
}

async function post(env: Env, app: string, sub: string, message: string): Promise<Response> {
  signIn(sub);
  const avatar = app === "m2" ? { avatarType: "doctor", assetId: "doc-1" } : { avatarType: "neuron", assetId: "n-1" };
  return handleShoutout(
    new Request(`https://api.example/shoutouts/${app}`, {
      method: "PUT",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ avatar, message }),
    }),
    env,
    {},
    ctx,
  );
}

async function report(env: Env, app: string, reporter: string, target: string): Promise<Response> {
  signIn(reporter);
  return handleShoutout(
    new Request(`https://api.example/shoutouts/${app}/report`, {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ targetAuthorKey: target }),
    }),
    env,
    {},
    ctx,
  );
}

let db: SqliteDb;
let store: FakeKv;
let cacheKeys: string[];

beforeEach(() => {
  db = makeDb();
  store = kv();
  seed(db);
  cacheKeys = [];
  vi.stubGlobal("caches", {
    default: {
      match: async (req: Request) => {
        cacheKeys.push(req.url);
        return undefined;
      },
      put: async () => {},
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── the derivation ─────────────────────────────────────────────────────────

describe("the derivation", () => {
  it("is stable per player, distinct across players, and shaped pk1_ + 22 base64url chars", async () => {
    const a1 = await testPlayerKey("m2", U_A);
    const a2 = await testPlayerKey("m2", U_A);
    const b = await testPlayerKey("m2", U_B);
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    for (const k of [a1, b]) {
      expect(k).toMatch(PLAYER_KEY_PATTERN);
      expect(k).not.toMatch(UUID);
    }
  });

  it("binds the app: one player's 二階 and neurons keys are unrelated", async () => {
    expect(await testPlayerKey("m2", U_A)).not.toBe(await testPlayerKey("neurons", U_A));
  });

  it("depends on the secret: another secret gives another key", async () => {
    const other = await playerKeyer({ LEADERBOARD_PLAYER_KEY_SECRET: "x".repeat(PLAYER_KEY_MIN_SECRET_LENGTH) }, "m2");
    expect(await other(U_A)).not.toBe(await testPlayerKey("m2", U_A));
  });

  it("fails closed on a missing or short secret — it never returns the input", async () => {
    await expect(playerKeyer({}, "m2")).rejects.toBeInstanceOf(PlayerKeyUnavailableError);
    await expect(playerKeyer({ LEADERBOARD_PLAYER_KEY_SECRET: "" }, "m2")).rejects.toBeInstanceOf(
      PlayerKeyUnavailableError,
    );
    await expect(
      playerKeyer({ LEADERBOARD_PLAYER_KEY_SECRET: "x".repeat(PLAYER_KEY_MIN_SECRET_LENGTH - 1) }, "m2"),
    ).rejects.toBeInstanceOf(PlayerKeyUnavailableError);
  });
});

// ─── nothing public carries a raw id ────────────────────────────────────────

describe("with the compat window closed (the end state)", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv(db, store);
  });

  it("no KV snapshot the crons write contains a user_id", async () => {
    await runLeaderboardCron(env);
    await runNeuronsLeaderboardCron(env);
    const written = [...store.store.entries()];
    // Both crons, five snapshots each — a cron that wrote nothing must not pass vacuously.
    expect(written.length).toBe(10);
    for (const [k, v] of written) {
      expect(v, k).not.toMatch(UUID);
      const rows = (JSON.parse(v) as { rows: Record<string, unknown>[] }).rows;
      expect(rows.length, k).toBeGreaterThan(0);
      for (const row of rows) expect(row.player_key, k).toMatch(PLAYER_KEY_PATTERN);
    }
  });

  it("no public read — either leaderboard, either 留言 board — contains a user_id", async () => {
    await runLeaderboardCron(env);
    await runNeuronsLeaderboardCron(env);
    const reads = await publicReads(env);
    expect(Object.keys(reads).length).toBe(12);
    for (const [name, { status, text }] of Object.entries(reads)) {
      expect(status, name).toBe(200);
      expect(text, name).not.toMatch(UUID);
    }
    const board = JSON.parse(reads["board:m2"].text) as {
      messages: { id: string; authorKey: string; playerKey: string }[];
    };
    expect(board.messages.length).toBe(2);
    for (const m of board.messages) {
      expect(m.playerKey).toMatch(PLAYER_KEY_PATTERN);
      expect(m.authorKey).toBe(m.playerKey);
      expect(m.id).toBe(m.playerKey);
    }
  });

  it("a snapshot stored before the change is keyed on read, not served with its user_ids", async () => {
    // What production KV holds at the moment the Worker is deployed.
    const legacy = JSON.stringify({
      rows: [{ user_id: U_A, nickname: "Alpha", hospital_tier: 4, reputation: 9000, doctor_count: 5, total_study_min: 1 }],
      last_updated_at: T,
      total_count: 1,
    });
    for (const f of M2_FILTERS) store.store.set(m2Key(f), legacy);
    for (const f of M2_FILTERS) {
      const res = await handleLeaderboard(new Request(`https://api.example/leaderboard/${f}`), env, {});
      const text = await res.text();
      expect(text, f).not.toMatch(UUID);
      expect((JSON.parse(text) as { rows: { player_key: string }[] }).rows[0].player_key).toBe(
        await testPlayerKey("m2", U_A),
      );
    }
  });

  it("the post echo carries the author's key, not their id", async () => {
    const res = await post(env, "m2", U_C, "new here");
    const text = await res.text();
    expect(res.status, text).toBe(200);
    expect(text).not.toMatch(UUID);
    expect((JSON.parse(text) as { message: { playerKey: string } }).message.playerKey).toBe(
      await testPlayerKey("m2", U_C),
    );
  });

  it("/me hands the signed-in player their own key, even with no leaderboard row", async () => {
    signIn(U_D);
    const res = await handleLeaderboard(
      new Request("https://api.example/leaderboard/me", { headers: { Authorization: "Bearer t" } }),
      env,
      {},
    );
    expect(await res.json()).toEqual({ row: null, player_key: await testPlayerKey("m2", U_D) });
  });

  it("the board's key cache names the keyed shape (not the v1 raw-id bodies)", async () => {
    await handleShoutout(new Request("https://api.example/shoutouts/m2"), env, {}, ctx);
    expect(cacheKeys).toEqual(["https://shoutout.cache/board/m2/v2-keyed"]);
  });
});

// ─── the rollout compat window ──────────────────────────────────────────────

describe("with the compat window open (rollout step 1)", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv(db, store, undefined, { LEADERBOARD_RAW_ID_COMPAT: "1" });
  });

  it("public rows carry both the key and the old user_id, so a pre-change client still finds itself", async () => {
    await runLeaderboardCron(env);
    const res = await handleLeaderboard(new Request("https://api.example/leaderboard/composite"), env, {});
    const rows = ((await res.json()) as { rows: { user_id: string; player_key: string }[] }).rows;
    expect(rows.map((r) => r.user_id)).toEqual([U_A, U_B, U_C]);
    for (const r of rows) expect(r.player_key).toBe(await testPlayerKey("m2", r.user_id));
  });

  it("board messages keep the raw id in id / authorKey and add playerKey", async () => {
    const res = await handleShoutout(new Request("https://api.example/shoutouts/m2"), env, {}, ctx);
    const { messages } = (await res.json()) as { messages: { id: string; authorKey: string; playerKey: string }[] };
    expect(messages.map((m) => m.authorKey)).toEqual([U_A, U_B]);
    for (const m of messages) {
      expect(m.id).toBe(m.authorKey);
      expect(m.playerKey).toBe(await testPlayerKey("m2", m.authorKey));
    }
    expect(cacheKeys).toEqual(["https://shoutout.cache/board/m2/v2-compat"]);
  });

  it("closing the window removes the raw id from what the same KV snapshot serves", async () => {
    await runLeaderboardCron(env);
    const closed = makeEnv(db, store);
    const res = await handleLeaderboard(new Request("https://api.example/leaderboard/composite"), closed, {});
    expect(await res.text()).not.toMatch(UUID);
  });
});

// ─── fails closed ───────────────────────────────────────────────────────────

describe("with the secret missing", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv(db, store, undefined, { LEADERBOARD_PLAYER_KEY_SECRET: undefined });
  });

  it("neither cron writes anything, and the previous snapshots stay", async () => {
    const PREVIOUS = JSON.stringify({ rows: [], last_updated_at: T, total_count: 0 });
    for (const f of M2_FILTERS) store.store.set(m2Key(f), PREVIOUS);
    for (const f of NEURONS_FILTERS) store.store.set(neuronsKey(f), PREVIOUS);
    await expect(runLeaderboardCron(env)).rejects.toBeInstanceOf(PlayerKeyUnavailableError);
    await expect(runNeuronsLeaderboardCron(env)).rejects.toBeInstanceOf(PlayerKeyUnavailableError);
    expect(store.puts).toEqual([]);
    for (const v of store.store.values()) expect(v).toBe(PREVIOUS);
  });

  it("every read that would have to key a row is refused with 503 — never answered with the raw id", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const legacy = JSON.stringify({ rows: [{ user_id: U_A, nickname: "Alpha" }], last_updated_at: T, total_count: 1 });
    for (const f of M2_FILTERS) store.store.set(m2Key(f), legacy);
    for (const f of NEURONS_FILTERS) store.store.set(neuronsKey(f), legacy);
    const reads = await publicReads(env);
    for (const [name, { status, text }] of Object.entries(reads)) {
      expect(status, name).toBe(503);
      expect(JSON.parse(text), name).toEqual({ error: "player_key_unavailable" });
    }
  });

  it("an already-keyed snapshot is still served: reading it needs no secret", async () => {
    await runLeaderboardCron(makeEnv(db, store)); // written while the secret was present
    const res = await handleLeaderboard(new Request("https://api.example/leaderboard/composite"), env, {});
    expect(res.status).toBe(200);
    expect(await res.text()).not.toMatch(UUID);
  });

  it("/me, a post and a report are refused, and the post writes nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signIn(U_A);
    const me = await handleLeaderboard(
      new Request("https://api.example/leaderboard/me", { headers: { Authorization: "Bearer t" } }),
      env,
      {},
    );
    expect(me.status).toBe(503);
    const before = db.prepare("SELECT COUNT(*) AS c FROM shoutouts_m2").get();
    expect((await post(env, "m2", U_C, "blocked")).status).toBe(503);
    expect(db.prepare("SELECT COUNT(*) AS c FROM shoutouts_m2").get()).toEqual(before);
    expect((await report(env, "m2", U_C, await testPlayerKey("m2", U_A))).status).toBe(503);
  });
});

// ─── the halo and the report, which have to map keys back ───────────────────

describe("top-N halo and reports under keys", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv(db, store);
  });

  async function board(): Promise<{ playerKey: string; isTopN: boolean }[]> {
    const res = await handleShoutout(new Request("https://api.example/shoutouts/m2"), env, {}, ctx);
    return ((await res.json()) as { messages: { playerKey: string; isTopN: boolean }[] }).messages;
  }

  it("flags a top-N author by matching keys, from a keyed snapshot", async () => {
    await runLeaderboardCron(env);
    const messages = await board();
    expect(messages.length).toBe(2);
    expect(messages.every((m) => m.isTopN)).toBe(true);
  });

  it("still flags them from a pre-change snapshot that carries only user_id", async () => {
    store.store.set(
      m2Key("composite"),
      JSON.stringify({ rows: [{ user_id: U_B }], last_updated_at: T, total_count: 1 }),
    );
    const byKey = new Map((await board()).map((m) => [m.playerKey, m.isTopN]));
    expect(byKey.get(await testPlayerKey("m2", U_B))).toBe(true);
    expect(byKey.get(await testPlayerKey("m2", U_A))).toBe(false);
  });

  it("a report naming the published key reaches the author, and three reporters hide the message", async () => {
    const target = await testPlayerKey("m2", U_A);
    for (const reporter of [U_B, U_C, U_D]) {
      const res = await report(env, "m2", reporter, target);
      expect(res.status).toBe(200);
    }
    expect(db.prepare("SELECT hidden FROM shoutouts_m2 WHERE author_key = ?").get(U_A)).toEqual({ hidden: 1 });
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM shoutout_reports WHERE target_author_key = ?").get(U_A),
    ).toEqual({ c: 3 });
  });

  it("refuses a raw id outside the compat window, and an unknown key, without recording a report", async () => {
    expect((await report(env, "m2", U_B, U_A)).status).toBe(400);
    expect((await report(env, "m2", U_B, await testPlayerKey("m2", U_D))).status).toBe(400);
    expect((await report(env, "m2", U_B, await testPlayerKey("neurons", U_A))).status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS c FROM shoutout_reports").get()).toEqual({ c: 0 });
  });

  it("accepts a raw id inside the compat window — what a pre-change client sends", async () => {
    const compat = makeEnv(db, store, undefined, { LEADERBOARD_RAW_ID_COMPAT: "1" });
    expect((await report(compat, "m2", U_B, U_A)).status).toBe(200);
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM shoutout_reports WHERE target_author_key = ?").get(U_A),
    ).toEqual({ c: 1 });
  });
});

// The fixture secret is only ever a test value.
it("the fixture secret clears the floor", () => {
  expect(TEST_PLAYER_KEY_SECRET.length).toBeGreaterThanOrEqual(PLAYER_KEY_MIN_SECRET_LENGTH);
});
