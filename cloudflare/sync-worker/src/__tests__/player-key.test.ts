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
  RAW_ID_COMPAT_MAX_MS,
  compatWindow,
  parseCompatUntil,
  playerKeyer,
  publicIdentity,
  warnIfCompatRefused,
} from "../player-key";
import {
  M2_FILTERS,
  TEST_PLAYER_KEY_SECRET,
  TEST_WINDOW_SECRET,
  insertM2,
  kv,
  m2Key,
  makeDb,
  makeEnv,
  openWindow,
  testPlayerKey,
  testWindowKey,
  type FakeKv,
  type SqliteDb,
} from "./leaderboard-sqlite-fixtures";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./strip-comments";

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
  vi.useRealTimers();
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

const DAY = 24 * 60 * 60 * 1000;

describe("the compat window's deadline fails closed", () => {
  const NOW = Date.parse("2026-09-24T12:00:00Z");
  const secrets = {
    LEADERBOARD_PLAYER_KEY_SECRET: TEST_PLAYER_KEY_SECRET,
    LEADERBOARD_PLAYER_KEY_WINDOW_SECRET: TEST_WINDOW_SECRET,
  };
  const state = (until: string | undefined, extra: Record<string, string | undefined> = {}) =>
    compatWindow({ ...secrets, LEADERBOARD_RAW_ID_COMPAT_UNTIL: until, ...extra }, NOW);

  it("is open only before a real, near deadline, with two distinct usable secrets", () => {
    expect(state("2026-09-27T23:59:59+08:00")).toBe("open");
    expect(state("2026-09-27")).toBe("open");
    expect(publicIdentity({ ...secrets, LEADERBOARD_RAW_ID_COMPAT_UNTIL: "2026-09-27" }, NOW).compat).toBe(true);
  });

  it("is closed once the deadline has passed — at the deadline itself too", () => {
    expect(state("2026-09-24T12:00:00Z")).toBe("expired");
    expect(state("2026-09-01")).toBe("expired");
  });

  it("is closed when the value is missing, empty, or not a real date", () => {
    expect(state(undefined)).toBe("unset");
    expect(state("")).toBe("unset");
    for (const junk of ["1", "true", "yes", "2026-02-30", "2026-13-01", "2026-09-27T23:59", " 2026-09-27", "tomorrow"]) {
      expect(state(junk), junk).toBe("unparseable");
      expect(parseCompatUntil(junk), junk).toBeNull();
    }
  });

  it("is closed when the deadline is further out than the maximum — no value holds it open for good", () => {
    expect(state(new Date(NOW + RAW_ID_COMPAT_MAX_MS + 1000).toISOString())).toBe("beyond-max");
    expect(state("2099-01-01")).toBe("beyond-max");
    expect(state(new Date(NOW + RAW_ID_COMPAT_MAX_MS - 1000).toISOString())).toBe("open");
  });

  it("is closed without a usable window secret, without the permanent one, or when they are equal", () => {
    const until = "2026-09-27";
    expect(state(until, { LEADERBOARD_PLAYER_KEY_WINDOW_SECRET: undefined })).toBe("window-secret-unusable");
    expect(state(until, { LEADERBOARD_PLAYER_KEY_WINDOW_SECRET: "short" })).toBe("window-secret-unusable");
    expect(state(until, { LEADERBOARD_PLAYER_KEY_SECRET: undefined })).toBe("window-secret-unusable");
    expect(state(until, { LEADERBOARD_PLAYER_KEY_WINDOW_SECRET: TEST_PLAYER_KEY_SECRET })).toBe(
      "window-secret-reused",
    );
  });

  it("a refused window says so once per cron; the normal states (unset, expired) stay quiet", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const until of [undefined, "", "2026-09-01"]) {
      warnIfCompatRefused({ ...secrets, LEADERBOARD_RAW_ID_COMPAT_UNTIL: until }, NOW, "t");
    }
    expect(warn).not.toHaveBeenCalled();
    warnIfCompatRefused({ ...secrets, LEADERBOARD_RAW_ID_COMPAT_UNTIL: "2026-09-27", LEADERBOARD_PLAYER_KEY_WINDOW_SECRET: undefined }, NOW, "t");
    warnIfCompatRefused({ ...secrets, LEADERBOARD_RAW_ID_COMPAT_UNTIL: "tomorrow" }, NOW, "t");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("the pre-deadline flag `LEADERBOARD_RAW_ID_COMPAT = \"1\"` no longer opens anything", () => {
    const env = { ...secrets, LEADERBOARD_RAW_ID_COMPAT: "1" } as Parameters<typeof compatWindow>[0];
    expect(compatWindow(env, NOW)).toBe("unset");
  });
});

describe("with the compat window open (rollout step 1)", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv(db, store, undefined, openWindow());
  });

  it("public rows carry both the WINDOW key and the old user_id, so a pre-change client still finds itself", async () => {
    await runLeaderboardCron(env);
    const res = await handleLeaderboard(new Request("https://api.example/leaderboard/composite"), env, {});
    const rows = ((await res.json()) as { rows: { user_id: string; player_key: string }[] }).rows;
    expect(rows.map((r) => r.user_id)).toEqual([U_A, U_B, U_C]);
    for (const r of rows) {
      expect(r.player_key).toBe(await testWindowKey("m2", r.user_id));
      expect(r.player_key).not.toBe(await testPlayerKey("m2", r.user_id));
    }
  });

  it("board messages keep the raw id in id / authorKey and add the window playerKey", async () => {
    const res = await handleShoutout(new Request("https://api.example/shoutouts/m2"), env, {}, ctx);
    const { messages } = (await res.json()) as { messages: { id: string; authorKey: string; playerKey: string }[] };
    expect(messages.map((m) => m.authorKey)).toEqual([U_A, U_B]);
    for (const m of messages) {
      expect(m.id).toBe(m.authorKey);
      expect(m.playerKey).toBe(await testWindowKey("m2", m.authorKey));
    }
    expect(cacheKeys).toEqual(["https://shoutout.cache/board/m2/v2-compat"]);
  });

  it("/me hands out the window key while the window is open", async () => {
    signIn(U_D);
    const res = await handleLeaderboard(
      new Request("https://api.example/leaderboard/me", { headers: { Authorization: "Bearer t" } }),
      env,
      {},
    );
    expect(await res.json()).toEqual({ row: null, player_key: await testWindowKey("m2", U_D) });
  });
});

describe("the deadline retires every key published during the window", () => {
  // Rows written during the window, read after it: what production KV holds in the
  // minutes after the deadline, before the next refresh.
  const T0 = Date.parse("2026-09-24T12:00:00Z");
  let env: Env;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    env = makeEnv(db, store, undefined, openWindow(T0, 3));
    await runLeaderboardCron(env);
    await runNeuronsLeaderboardCron(env);
    vi.setSystemTime(T0 + 3 * DAY + 1);
  });

  it("the window snapshot is re-keyed under the permanent secret on the first read — no raw id, no window key", async () => {
    for (const f of M2_FILTERS) {
      const res = await handleLeaderboard(new Request(`https://api.example/leaderboard/${f}`), env, {});
      const text = await res.text();
      expect(res.status, f).toBe(200);
      expect(text, f).not.toMatch(UUID);
      const rows = (JSON.parse(text) as { rows: { player_key: string }[] }).rows;
      expect(rows.length, f).toBe(3);
      const permanent = await Promise.all([U_A, U_B, U_C].map((u) => testPlayerKey("m2", u)));
      const window = await Promise.all([U_A, U_B, U_C].map((u) => testWindowKey("m2", u)));
      for (const r of rows) {
        expect(permanent, f).toContain(r.player_key);
        expect(window, f).not.toContain(r.player_key);
      }
    }
    const neurons = await handleNeuronsLeaderboard(
      new Request("https://api.example/leaderboard/neurons/composite"),
      env,
      {},
    );
    const nrows = ((await neurons.json()) as { rows: { player_key: string }[] }).rows;
    expect(nrows.map((r) => r.player_key)).toEqual([
      await testPlayerKey("neurons", U_A),
      await testPlayerKey("neurons", U_B),
    ]);
  });

  it("/me now hands out the permanent key, which is the one the rows carry", async () => {
    signIn(U_A);
    const me = await handleLeaderboard(
      new Request("https://api.example/leaderboard/me", { headers: { Authorization: "Bearer t" } }),
      env,
      {},
    );
    const { player_key } = (await me.json()) as { player_key: string };
    expect(player_key).toBe(await testPlayerKey("m2", U_A));
    const snap = await handleLeaderboard(new Request("https://api.example/leaderboard/composite"), env, {});
    const rows = ((await snap.json()) as { rows: { player_key: string }[] }).rows;
    expect(rows[0].player_key).toBe(player_key);
  });

  it("the 留言 halo still matches: authors keyed permanently against the re-keyed window snapshot", async () => {
    const res = await handleShoutout(new Request("https://api.example/shoutouts/m2"), env, {}, ctx);
    const text = await res.text();
    expect(text).not.toMatch(UUID);
    const { messages } = JSON.parse(text) as { messages: { playerKey: string; isTopN: boolean }[] };
    expect(messages.map((m) => m.playerKey)).toEqual([await testPlayerKey("m2", U_A), await testPlayerKey("m2", U_B)]);
    expect(messages.every((m) => m.isTopN)).toBe(true);
    expect(cacheKeys).toEqual(["https://shoutout.cache/board/m2/v2-keyed"]);
  });

  it("a report naming a window key is refused once the window has closed", async () => {
    const res = await report(env, "m2", U_B, await testWindowKey("m2", U_A));
    expect(res.status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS c FROM shoutout_reports").get()).toEqual({ c: 0 });
  });

  it("the next refresh stores permanent keys and no raw id", async () => {
    store.puts.length = 0;
    await runLeaderboardCron(env);
    expect(store.puts.length).toBe(5);
    for (const f of M2_FILTERS) {
      const raw = store.store.get(m2Key(f)) ?? "";
      expect(raw, f).not.toMatch(UUID);
    }
  });
});

describe("after a later rotation of the permanent secret (design D5)", () => {
  it("a keyed snapshot with no raw id is served with its stored keys until the next refresh", async () => {
    await runLeaderboardCron(makeEnv(db, store));
    const rotated = makeEnv(db, store, undefined, { LEADERBOARD_PLAYER_KEY_SECRET: "r".repeat(48) });
    const res = await handleLeaderboard(new Request("https://api.example/leaderboard/composite"), rotated, {});
    const rows = ((await res.json()) as { rows: { player_key: string }[] }).rows;
    // Stale by design: nothing in KV can re-derive them. The next refresh replaces them.
    expect(rows[0].player_key).toBe(await testPlayerKey("m2", U_A));
    await runLeaderboardCron(rotated);
    const fresh = await handleLeaderboard(new Request("https://api.example/leaderboard/composite"), rotated, {});
    const after = ((await fresh.json()) as { rows: { player_key: string }[] }).rows;
    expect(after[0].player_key).not.toBe(await testPlayerKey("m2", U_A));
    expect(after[0].player_key).toMatch(PLAYER_KEY_PATTERN);
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

  it("a report naming an author whose message is already hidden answers as before the key existed", async () => {
    const target = await testPlayerKey("m2", U_A);
    for (const reporter of [U_B, U_C, U_D]) await report(env, "m2", reporter, target);
    // A fourth reader still holding a cached board (≤ 90 s) reports the same message.
    const res = await report(env, "m2", "00000000-0000-4000-8000-0000000000e5", target);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, hidden: true });
  });

  it("refuses a raw id outside the compat window, and an unknown key, without recording a report", async () => {
    expect((await report(env, "m2", U_B, U_A)).status).toBe(400);
    expect((await report(env, "m2", U_B, await testPlayerKey("m2", U_D))).status).toBe(400);
    expect((await report(env, "m2", U_B, await testPlayerKey("neurons", U_A))).status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS c FROM shoutout_reports").get()).toEqual({ c: 0 });
  });

  it("accepts a raw id inside the compat window — what a pre-change client sends", async () => {
    const compat = makeEnv(db, store, undefined, openWindow());
    expect((await report(compat, "m2", U_B, U_A)).status).toBe(200);
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM shoutout_reports WHERE target_author_key = ?").get(U_A),
    ).toEqual({ c: 1 });
  });
});

// ─── the CPU budget: one signature per player per refresh ───────────────────

describe("the refresh stays inside its CPU budget (design D8)", () => {
  it("signs each distinct player once per refresh, however many rankings list them", async () => {
    const sign = vi.spyOn(crypto.subtle, "sign");
    await runLeaderboardCron(makeEnv(db, store));
    // Three public players, each in all five rankings — plus the one secret fingerprint.
    const rowsListed = M2_FILTERS.reduce(
      (n, f) => n + (JSON.parse(store.store.get(m2Key(f)) ?? "{}") as { rows: unknown[] }).rows.length,
      0,
    );
    expect(rowsListed).toBe(15);
    expect(sign).toHaveBeenCalledTimes(3 + 1);
  });
});

// ─── source guards ──────────────────────────────────────────────────────────

describe("every surface reads the identity through publicIdentity()", () => {
  // Derived: every non-test source file of the Worker.
  const SRC = join(__dirname, "..");
  const sources = readdirSync(SRC)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ f, code: stripComments(readFileSync(join(SRC, f), "latin1")) }));

  it("the population is derived and reaches the surfaces", () => {
    expect(sources.map((s) => s.f)).toEqual(
      expect.arrayContaining(["leaderboard.ts", "neurons-leaderboard.ts", "shoutout.ts", "player-key.ts"]),
    );
  });

  it("no production file but player-key.ts derives keys with the permanent secret directly", () => {
    // playerKeyer() ignores the compat window: a surface calling it would publish
    // permanent keys next to raw ids — the pairs the window secret exists to void.
    const offenders = sources.filter((s) => s.f !== "player-key.ts" && /\bplayerKeyer\s*\(/.test(s.code));
    expect(offenders.map((s) => s.f)).toEqual([]);
    for (const f of ["leaderboard.ts", "neurons-leaderboard.ts", "shoutout.ts"]) {
      expect(sources.find((s) => s.f === f)?.code, f).toMatch(/\bpublicIdentity\s*\(/);
    }
  });

  it("nothing reads the retired open-ended flag LEADERBOARD_RAW_ID_COMPAT", () => {
    const offenders = sources.filter((s) => /LEADERBOARD_RAW_ID_COMPAT(?!_UNTIL)/.test(s.code));
    expect(offenders.map((s) => s.f)).toEqual([]);
  });

  it("the committed wrangler.jsonc cannot hold the window open: unset, or a real deadline within the maximum", () => {
    const text = stripComments(readFileSync(join(SRC, "..", "wrangler.jsonc"), "utf8"));
    expect(text).not.toMatch(/"LEADERBOARD_RAW_ID_COMPAT"/);
    const m = /"LEADERBOARD_RAW_ID_COMPAT_UNTIL"\s*:\s*"([^"]*)"/.exec(text);
    const value = m ? m[1] : undefined;
    if (value !== undefined && value !== "") {
      const until = parseCompatUntil(value);
      expect(until, `wrangler.jsonc LEADERBOARD_RAW_ID_COMPAT_UNTIL=${value} is not a real date`).not.toBeNull();
      expect((until as number) - Date.now()).toBeLessThanOrEqual(RAW_ID_COMPAT_MAX_MS);
    }
  });
});

// The fixture secret is only ever a test value.
it("the fixture secret clears the floor", () => {
  expect(TEST_PLAYER_KEY_SECRET.length).toBeGreaterThanOrEqual(PLAYER_KEY_MIN_SECRET_LENGTH);
});
