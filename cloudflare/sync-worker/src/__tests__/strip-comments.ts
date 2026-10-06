/**
 * Comments out of TypeScript / JSONC source, for source-text guards.
 *
 * Block comments go whole; a line comment goes only when not preceded by `:` (a URL
 * inside a string) or a quote. Blunt on purpose — the guards that use it assert on
 * code, and a comment that names what they forbid (the prose explaining why) must
 * not turn them red.
 *
 * One copy for every guard in this directory: two identical private copies existed
 * before hash-leaderboard-user-ids needed a third.
 */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}
