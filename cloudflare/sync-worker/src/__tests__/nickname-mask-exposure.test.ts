// Every SQL string that can read a leaderboard nickname either masks it or says why not.
//
// Spec (study-rpg-2nd, hospital-leaderboard): 「Public leaderboard surfaces display a
// fixed mask for masked players」— "Every surface that shows a leaderboard nickname
// to someone other than its owner". Change: mask-moderated-leaderboard-nicknames.
//
// ⚠️ The population is DERIVED from src/*.ts, not listed. The design found three
// public nickname paths by reading code; a fourth added next month would not be
// in any list written today. So: every string literal that SELECTs from a table
// holding 二階 nicknames (`leaderboard_m2`, or the shoutout registry's
// `leaderboardTable`) is classified, and one that may read a nickname must either
//   (a) use the mask fragment — interpolate `${<fragment>.join}` and select no bare
//       `nickname` column (the display name comes aliased `AS nickname`), or
//   (b) sit in a function listed in UNMASKED_BY_DESIGN, with the reason.
// "May read a nickname" = its SELECT list names `nickname` or interpolates anything
// (`${…}` could be a column list that includes it — the cron's is).
//
// Limits, stated: this reads SQL text. It does not prove the fragment's result is
// the one returned (nickname-mask.test.ts does that behaviourally), and a query
// assembled by string concatenation outside one literal would escape it — the
// coverage floors below make a scanner that stops matching go red rather than
// read as "zero violations".

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./strip-comments";

const SRC = join(__dirname, "..");

/** Functions that return a nickname unmasked on purpose. */
const UNMASKED_BY_DESIGN: Record<string, string> = {
  handleGetMe:
    "GET /leaderboard/me returns the requester's OWN stored nickname: the client seeds its local " +
    "profile from it and pushes it back, so a mask here would become the player's name (design D3).",
};

interface SqlLiteral {
  file: string;
  fn: string;
  text: string;
}

const NICKNAME_TABLE = /\bleaderboard_m2\b|\bleaderboardTable\b/;
const LITERAL = /`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g;
const FUNCTION = /\bfunction\s+(\w+)\s*\(/g;

function scan(sources: Record<string, string>): { files: number; literals: SqlLiteral[] } {
  const literals: SqlLiteral[] = [];
  for (const [file, raw] of Object.entries(sources)) {
    const code = stripComments(raw);
    const fns = [...code.matchAll(FUNCTION)].map((m) => ({ at: m.index ?? 0, name: m[1] }));
    for (const m of code.matchAll(LITERAL)) {
      const text = m[0];
      if (!NICKNAME_TABLE.test(text) || !/\bSELECT\b/i.test(text)) continue;
      const at = m.index ?? 0;
      const fn = fns.filter((f) => f.at < at).pop()?.name ?? "(module scope)";
      literals.push({ file, fn, text });
    }
  }
  return { files: Object.keys(sources).length, literals };
}

function selectList(sql: string): string {
  const m = sql.match(/\bSELECT\b([\s\S]*?)\bFROM\b/i);
  return m ? m[1] : "";
}

/** A bare `nickname` column — not the fragment's display name aliased `AS nickname`. */
function bareNickname(list: string): boolean {
  return [...list.matchAll(/\bnickname\b/g)].some((m) => !/\bAS\s+$/i.test(list.slice(0, m.index)));
}

function classify(lit: SqlLiteral): "no-nickname" | "masked" | "unmasked" {
  const list = selectList(lit.text);
  const mayRead = /\bnickname\b/.test(list) || list.includes("${");
  if (!mayRead) return "no-nickname";
  const usesFragment = /\$\{\s*[\w.]+\.join\s*\}/.test(lit.text);
  return usesFragment && !bareNickname(list) ? "masked" : "unmasked";
}

function workerSources(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of readdirSync(SRC).filter((n) => n.endsWith(".ts"))) {
    out[f] = readFileSync(join(SRC, f), "utf8");
  }
  return out;
}

describe("nickname read paths (derived from src/*.ts)", () => {
  const { files, literals } = scan(workerSources());

  it("scans enough to mean something (coverage floors)", () => {
    expect(files).toBeGreaterThanOrEqual(3);
    expect(literals.length, literals.map((l) => `${l.file}:${l.fn}`).join(", ")).toBeGreaterThanOrEqual(4);
    // Both kinds must be found, or the classifier has stopped seeing one of them.
    expect(literals.filter((l) => classify(l) === "masked").length).toBeGreaterThanOrEqual(3);
    expect(literals.filter((l) => classify(l) === "no-nickname").length).toBeGreaterThanOrEqual(1);
  });

  it("every literal that may read a nickname masks it or is registered as unmasked by design", () => {
    const leaks = literals
      .filter((l) => classify(l) === "unmasked" && !(l.fn in UNMASKED_BY_DESIGN))
      .map((l) => `${l.file} ${l.fn}(): ${l.text.slice(0, 120).replace(/\s+/g, " ")}`);
    expect(leaks, `nickname read without the mask fragment:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("every registered exception still exists and still reads the nickname unmasked", () => {
    for (const [fn, reason] of Object.entries(UNMASKED_BY_DESIGN)) {
      expect(reason.trim().length, fn).toBeGreaterThan(0);
      const hit = literals.some((l) => l.fn === fn && classify(l) === "unmasked");
      expect(hit, `${fn} is registered as unmasked by design but no longer reads a nickname — remove it`).toBe(true);
    }
  });
});

// 「Entries SHALL be added … only by the owner's command」: the Worker may DELETE an
// entry (account deletion does, by requirement) but never creates or edits one.
// Derived the same way — any Worker source that writes the table is red.
describe("the Worker never creates or edits a mask entry", () => {
  it("no src/*.ts INSERTs into or UPDATEs the masks table", () => {
    const writers = Object.entries(workerSources())
      .filter(([, raw]) =>
        /\b(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE)\s+(leaderboard_nickname_masks|\$\{NICKNAME_MASKS_TABLE\})/i.test(stripComments(raw)),
      )
      .map(([f]) => f);
    expect(writers).toEqual([]);
  });
});

// The classifier is exercised on synthetic text too: the real sources hold only
// the shapes they hold today, so a broken rule could pass against them.
describe("the classifier", () => {
  const lit = (text: string, fn = "f"): SqlLiteral => ({ file: "x.ts", fn, text });

  it.each([
    ["SELECT nickname FROM leaderboard_m2 WHERE user_id = ?", "unmasked"],
    ["SELECT ${COLUMNS} FROM leaderboard_m2 WHERE is_public = 1", "unmasked"],
    ["SELECT l.nickname, ${m.masked} AS x FROM leaderboard_m2 l ${m.join}", "unmasked"],
    ["SELECT l.user_id, ${m.displayName} AS nickname FROM ${cfg.leaderboardTable} l ${m.join}", "masked"],
    ["SELECT ${SELECT_LIST} FROM leaderboard_m2 l ${M2_MASK.join} WHERE l.is_public = 1", "masked"],
    ["SELECT 1 FROM leaderboard_m2 WHERE nickname_lower = ?", "no-nickname"],
    ["SELECT COUNT(*) AS c FROM leaderboard_m2 WHERE is_public = 1 AND (${where})", "no-nickname"],
  ])("%s → %s", (text, expected) => {
    expect(classify(lit(`\`${text}\``))).toBe(expected);
  });

  it("attributes a literal to its enclosing function and skips comments", () => {
    const { literals } = scan({
      "a.ts": "// SELECT nickname FROM leaderboard_m2\nasync function leak() { return `SELECT nickname FROM leaderboard_m2`; }",
    });
    expect(literals).toEqual([{ file: "a.ts", fn: "leak", text: "`SELECT nickname FROM leaderboard_m2`" }]);
  });
});
