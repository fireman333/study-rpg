/**
 * Public leaderboard rows and 留言 messages are matched on the player key, never on the account id.
 *
 * Change: hash-leaderboard-user-ids. The Worker stopped publishing the Supabase `user_id` on the
 * neurons snapshot and board; rows carry `player_key`, messages `playerKey`, and the player's own
 * key comes from the authenticated `GET /leaderboard/neurons/me`. A page that still compared a
 * public row against the auth user id would find nothing — no own-row highlight, no own-halo, no
 * edit of one's own 留言 — and nothing would error. Hence a guard rather than a comment.
 *
 * The population is DERIVED: every non-test source under `src/` is walked (recursively), and the
 * files that hold public rows or messages are picked by the types / fetchers that produce them.
 * Comments are stripped before matching so an explanatory comment cannot satisfy or trip a rule.
 * Limit, stated: this reads source text; a comparison routed through an alias
 * (`const id = user.id; … m.authorKey === id`) would pass.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..')

function productionFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
    (p) =>
      (p.endsWith('.ts') || p.endsWith('.tsx')) &&
      !p.split('/').includes('__tests__') &&
      !/\.test\.tsx?$/.test(p),
  )
}

/** Block and line comments out; line comments only when not preceded by `:` (URLs). */
function code(rel: string): string {
  return readFileSync(join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const SURFACE = /\b(?:LeaderboardSnapshot|fetchLeaderboardSnapshot|ShoutoutMessage|fetchShoutoutBoard)\b/
// Any read of `user_id` in such a file — deliberately not tied to a variable name, because a
// cast (`(row as …).user_id`) or a renamed binding would slip past a named one (probe N2).
const READS_USER_ID_ON_ROW = /\.user_id\b|\[\s*['"`]user_id['"`]\s*\]/
const AUTH_ID = String.raw`(?:userId|currentUserId|myUserId|user\??\.id|profile\??\.user_id)`
const AUTHOR_KEY_VS_AUTH = new RegExp(
  String.raw`authorKey\s*[!=]==?\s*${AUTH_ID}|\b${AUTH_ID}\s*[!=]==?\s*[\w.?]*authorKey\b`,
)

describe('neurons public identity', () => {
  const files = productionFiles()
  const population = files.filter((f) => SURFACE.test(code(f)))

  it('the derivation reaches the surfaces it was built from', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(population).toEqual(
      expect.arrayContaining([
        'lib/services/neurons-leaderboard.ts',
        'routes/LeaderboardPage.tsx',
        'routes/ShoutoutBoardPage.tsx',
      ]),
    )
  })

  it('no file holding public rows or messages reads a user_id off one', () => {
    expect(population.filter((f) => READS_USER_ID_ON_ROW.test(code(f)))).toEqual([])
  })

  it('no production file compares a message authorKey against the signed-in user', () => {
    expect(files.filter((f) => AUTHOR_KEY_VS_AUTH.test(code(f)))).toEqual([])
  })

  it('both pages match on the own key from useOwnPlayerKey (so deleting the match is not compliance)', () => {
    const lb = code('routes/LeaderboardPage.tsx')
    const board = code('routes/ShoutoutBoardPage.tsx')
    for (const src of [lb, board]) expect(src).toMatch(/useOwnPlayerKey\(userId, accessToken\)/)
    expect(lb).toMatch(/row\.player_key === ownPlayerKey/)
    expect(lb).toMatch(/r\.player_key === ownPlayerKey/)
    expect(board).toMatch(/m\.playerKey === ownPlayerKey/)
  })

  it('the own key is fetched per account, not per token — a token refresh does not blank it', () => {
    const hook = code('lib/hooks/useOwnPlayerKey.ts')
    const deps = [...hook.matchAll(/\}, \[([^\]]*)\]\)/g)].map((m) => m[1])
    expect(deps).toEqual(['userId, hasToken'])
    for (const d of deps) expect(d).not.toMatch(/accessToken/)
  })

  it('the post echo replaces the own message only when it carries a key (an older Worker sends none)', () => {
    const board = code('routes/ShoutoutBoardPage.tsx')
    const body = board.slice(board.indexOf('const applyMine'), board.indexOf('const handleReport'))
    expect(body).toMatch(/msg\.playerKey\s*\?\s*prev\.filter\(\(m\) => m\.playerKey !== msg\.playerKey\)\s*:\s*prev/)
  })

  it('the own key comes only from the Worker — no fallback to the account id', () => {
    const svc = code('lib/services/neurons-leaderboard.ts')
    const body = svc.slice(svc.indexOf('export async function fetchMyPlayerKey'))
    const fn = body.slice(0, body.indexOf('\n}\n') + 2)
    expect(fn).toMatch(/data\.player_key/)
    expect(fn).not.toMatch(/user\??\.id|\.sub\b|user_id/)
  })
})
