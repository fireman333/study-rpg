// The owner's mask command, run for real against a stand-in `wrangler`.
//
// Spec (study-rpg-2nd, hospital-leaderboard): 「Owner masks and unmasks a player with
// one command」. Change: mask-moderated-leaderboard-nicknames.
//
// The stand-in executes `d1 execute --command` against a real SQLite file built
// from the migrations, and `kv key get/put` against files. So the script's SQL
// runs for real, and the snapshots it rewrites were produced by the Worker's own
// cron. The one property that matters most — nothing the command prints contains
// a nickname — is asserted on its whole stdout + stderr for every subcommand,
// against data carrying a sentinel name.
//
// ⚠️ No real player's nickname appears here. `SENTINEL` is the name that must
// never be printed.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLeaderboardCron } from "../leaderboard";
import { NICKNAME_MASK } from "../nickname-mask";
import {
  M2_FILTERS,
  insertM2,
  m2Key,
  makeDb,
  makeEnv,
  openWindow,
  TEST_PLAYER_KEY_SECRET,
  testPlayerKey,
  type SqliteDb,
} from "./leaderboard-sqlite-fixtures";

const SCRIPT = join(__dirname, "..", "..", "scripts", "mask-leaderboard-nickname.sh");
const SENTINEL = "mmln-7f3a-zq";
const U_TARGET = "00000000-0000-4000-8000-00000000000a";
const U_OTHER = "00000000-0000-4000-8000-00000000000b";
const U_ABSENT = "00000000-0000-4000-8000-0000000000ff";

// A stand-in for the three wrangler invocations the script makes. Plain node,
// CommonJS, so it runs outside Vite.
const STUB = `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.MMLN_STUB_LOG, JSON.stringify(argv) + "\\n");
const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
const kvFile = (key) => path.join(process.env.MMLN_STUB_KV, encodeURIComponent(key));
if (argv[0] === "d1" && argv[1] === "execute") {
  const db = new DatabaseSync(process.env.MMLN_STUB_DB);
  const results = db.prepare(opt("--command")).all();
  process.stdout.write(JSON.stringify([{ results, success: true, meta: {} }]));
} else if (argv[0] === "kv" && argv[1] === "key" && argv[2] === "get") {
  if (process.env.MMLN_STUB_FAIL_KV_GET) { console.error("stub: kv get failed"); process.exit(1); }
  const f = kvFile(argv[3]);
  process.stdout.write(fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "Value not found\\n");
} else if (argv[0] === "kv" && argv[1] === "key" && argv[2] === "put") {
  fs.copyFileSync(opt("--path"), kvFile(argv[3]));
  console.log("Writing the value to the key " + argv[3]);
} else {
  console.error("stub: unexpected " + argv.join(" "));
  process.exit(9);
}
`;

let dir: string;
let dbPath: string;
let kvDir: string;
let logPath: string;
let db: SqliteDb;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "mmln-test-"));
  dbPath = join(dir, "d1.sqlite");
  kvDir = join(dir, "kv");
  logPath = join(dir, "calls.log");
  mkdirSync(kvDir);
  writeFileSync(logPath, "");
  writeFileSync(join(dir, "wrangler"), STUB);
  chmodSync(join(dir, "wrangler"), 0o755);

  db = makeDb({ path: dbPath });
  insertM2(db, { user_id: U_TARGET, nickname: SENTINEL, tier: 3, reputation: 5000 });
  insertM2(db, { user_id: U_OTHER, nickname: "Bravo", tier: 2, reputation: 3000 });
  // The snapshots the script rewrites are the ones the Worker's cron writes.
  const files = {
    put: async (key: string, value: string) => writeFileSync(join(kvDir, encodeURIComponent(key)), value),
    get: async () => null,
  };
  await runLeaderboardCron(makeEnv(db, files as never));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// The snapshots identify rows by player key (hash-leaderboard-user-ids); the script
// gets the same secret the fixture Worker used, and a nonexistent secret file so
// the owner's real one is never read.
let keys: Record<string, string>;
beforeAll(async () => {
  keys = {
    [U_TARGET]: await testPlayerKey("m2", U_TARGET),
    [U_OTHER]: await testPlayerKey("m2", U_OTHER),
  };
});

function run(...args: string[]) {
  return runWith({ LEADERBOARD_PLAYER_KEY_SECRET: TEST_PLAYER_KEY_SECRET }, ...args);
}

function runWith(extraEnv: Record<string, string>, ...args: string[]) {
  const base = { ...process.env };
  delete base.LEADERBOARD_PLAYER_KEY_SECRET;
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...base,
      MMLN_PLAYER_KEY_ENV: join(dir, "no-such-secret-file.env"),
      ...extraEnv,
      WRANGLER: join(dir, "wrangler"),
      PATH: `${dir}:${process.env.PATH}`,
      MMLN_STUB_DB: dbPath,
      MMLN_STUB_KV: kvDir,
      MMLN_STUB_LOG: logPath,
      NODE_NO_WARNINGS: "1",
      TMPDIR: dir,
    },
  });
  const output = `${r.stdout}${r.stderr}`;
  // The one property every subcommand shares, whatever it returns.
  expect(output, `${args.join(" ")} printed the nickname`).not.toContain(SENTINEL);
  expect(output, `${args.join(" ")} printed the player-key secret`).not.toContain(TEST_PLAYER_KEY_SECRET);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, output };
}

function snapshotRow(filter: string, userId: string): Record<string, unknown> | undefined {
  const s = JSON.parse(readFileSync(join(kvDir, encodeURIComponent(m2Key(filter))), "utf8")) as {
    rows: Record<string, unknown>[];
  };
  return s.rows.find((r) => r.player_key === keys[userId]);
}

const entries = () => db.prepare("SELECT app_id, user_id, nickname_lower FROM leaderboard_nickname_masks").all();

// Each subcommand spawns bash + node several times; synchronous, so allow for it.
describe("mask-leaderboard-nickname.sh", { timeout: 60_000 }, () => {
  it("find: rank → user_id, tier, reputation; never the name", () => {
    const r = run("find", "composite", "1");
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(`rank=1 user_id=${U_TARGET} tier=3 reputation=5000`);
  });

  it("find: a rank past the end fails", () => {
    expect(run("find", "composite", "9").status).not.toBe(0);
  });

  it("mask: writes the entry inside D1, rewrites all five snapshots, reports booleans and the delays", () => {
    const r = run("mask", U_TARGET, "owner patrol 2026-09");
    expect(r.status, r.output).toBe(0);
    expect(entries()).toEqual([{ app_id: "m2", user_id: U_TARGET, nickname_lower: SENTINEL }]);
    for (const f of M2_FILTERS) {
      expect(snapshotRow(f, U_TARGET), f).toMatchObject({ nickname: NICKNAME_MASK, nickname_masked: true });
      expect(snapshotRow(f, U_OTHER), f).toMatchObject({ nickname: "Bravo" });
      expect(r.stdout).toContain(`${f}: masked=true`);
    }
    expect(r.stdout).toMatch(/60 秒/);
    expect(r.stdout).toMatch(/90 秒/);
    expect(r.stdout).toMatch(/30 分鐘/);
    // The mask the script wrote is the Worker's constant, read from its source.
    expect(NICKNAME_MASK).toBe("***");
  });

  it("mask: the name went D1 → D1, never through a command line", () => {
    run("mask", U_TARGET);
    for (const line of readFileSync(logPath, "utf8").trim().split("\n")) {
      expect(line).not.toContain(SENTINEL);
    }
  });

  it("mask: an unknown user_id exits non-zero and writes nothing", () => {
    const r = run("mask", U_ABSENT);
    expect(r.status).not.toBe(0);
    expect(entries()).toEqual([]);
    expect(readFileSync(logPath, "utf8")).not.toMatch(/INSERT INTO leaderboard_nickname_masks/);
  });

  it("mask: a reason that contains the name (any case) is refused and nothing is written", () => {
    // The check runs inside D1 against the stored name, so the name is never read out.
    const r = run("mask", U_TARGET, `name ${SENTINEL.toUpperCase()}`);
    expect(r.status).not.toBe(0);
    expect(entries()).toEqual([]);
    expect(run("mask", U_TARGET, "a clean reason").status).toBe(0);
  });

  it("unmask: deletes the entry and restores the stored name in all five snapshots", () => {
    expect(run("mask", U_TARGET).status).toBe(0);
    const r = run("unmask", U_TARGET);
    expect(r.status, r.output).toBe(0);
    expect(entries()).toEqual([]);
    for (const f of M2_FILTERS) {
      expect(snapshotRow(f, U_TARGET), f).toMatchObject({ nickname: SENTINEL, nickname_masked: false });
      expect(r.stdout).toContain(`${f}: masked=false`);
    }
  });

  it("list: user_id, time, whether it applies, reason — never the recorded name", () => {
    expect(run("mask", U_TARGET, "patrol").status).toBe(0);
    let r = run("list");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(new RegExp(`user_id=${U_TARGET} masked_at=\\S+ applies=yes reason=patrol`));
    db.prepare("UPDATE leaderboard_m2 SET nickname = 'Delta', nickname_lower = 'delta' WHERE user_id = ?").run(U_TARGET);
    r = run("list");
    expect(r.stdout).toContain("applies=no");
  });

  it("refuses any app but m2, and a user_id that is not a UUID", () => {
    expect(run("--app", "neurons", "list").status).not.toBe(0);
    expect(run("--app", "neurons", "mask", U_TARGET).status).not.toBe(0);
    expect(entries()).toEqual([]);
    expect(run("mask", "x' OR 1=1 --").status).not.toBe(0);
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it("find / mask / unmask refuse without the player-key secret, before writing anything", () => {
    for (const args of [["find", "composite", "1"], ["mask", U_TARGET], ["unmask", U_TARGET]]) {
      const r = runWith({}, ...args);
      expect(r.status, args.join(" ")).not.toBe(0);
      expect(r.stderr, args.join(" ")).toMatch(/LEADERBOARD_PLAYER_KEY_SECRET/);
    }
    expect(entries()).toEqual([]);
    expect(readFileSync(logPath, "utf8")).toBe("");
    // `list` reads only D1 and needs no key.
    expect(runWith({}, "list").status).toBe(0);
  });

  it("find / mask / unmask refuse, before writing, when the local secret is not the Worker's (a rotation not copied)", () => {
    const stale = { LEADERBOARD_PLAYER_KEY_SECRET: "stale-local-copy-of-a-rotated-secret-000000000000" };
    for (const args of [["find", "composite", "1"], ["mask", U_TARGET], ["unmask", U_TARGET]]) {
      const r = runWith(stale, ...args);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr, args.join(" ")).toMatch(/輪替過 secret/);
    }
    expect(entries()).toEqual([]);
    expect(readFileSync(logPath, "utf8")).not.toMatch(/d1/);
  });

  it("find / mask / unmask refuse, before writing, when the snapshot cannot be read to check the secret", () => {
    const failing = { LEADERBOARD_PLAYER_KEY_SECRET: TEST_PLAYER_KEY_SECRET, MMLN_STUB_FAIL_KV_GET: "1" };
    for (const args of [["find", "composite", "1"], ["mask", U_TARGET], ["unmask", U_TARGET]]) {
      const r = runWith(failing, ...args);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr, args.join(" ")).toMatch(/讀不到 composite 快照/);
    }
    expect(entries()).toEqual([]);
    expect(readFileSync(logPath, "utf8")).not.toMatch(/d1/);
  });

  it("during the compat window the rows carry user_id, so the permanent local secret still works", async () => {
    const files = {
      put: async (key: string, value: string) => writeFileSync(join(kvDir, encodeURIComponent(key)), value),
      get: async () => null,
    };
    await runLeaderboardCron(makeEnv(db, files as never, undefined, openWindow()));
    const r = run("mask", U_TARGET);
    expect(r.status, r.output).toBe(0);
    for (const f of M2_FILTERS) expect(r.stdout).toContain(`${f}: masked=true`);
  });

  it("find resolves a keyed row whose snapshot carries no user_id at all", () => {
    for (const f of M2_FILTERS) {
      const raw = readFileSync(join(kvDir, encodeURIComponent(m2Key(f))), "utf8");
      expect(raw, f).not.toContain(U_TARGET);
    }
    expect(run("find", "composite", "2").stdout.trim()).toBe(`rank=2 user_id=${U_OTHER} tier=2 reputation=3000`);
  });

  it("leaves no temp files behind", () => {
    run("mask", U_TARGET);
    const left = spawnSync("bash", ["-c", `ls -d "${dir}"/mmln-* 2>/dev/null | wc -l`], { encoding: "utf8" });
    expect(left.stdout.trim()).toBe("0");
  });
});
