import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Guards two things the runtime never checks (openspec `sync-worker-cpu-budget`,
// `hospital-leaderboard` "Cron dispatch handler matches wrangler trigger expression"):
//
//  1. The CRON_* constants in src/index.ts and `triggers.crons` in wrangler.jsonc are the SAME
//     set, asserted in both directions. One direction alone is not enough: a constant without a
//     trigger is a dead `case` (green forever), a trigger without a constant is a `default`-branch
//     console.error on every run.
//  2. No `case` in `scheduled()` sequences more than one `run*Cron` job. The Free plan's CPU limit
//     is per invocation; two ~9 ms jobs in one case measured 17–20 ms and would be terminated.
//
// Source-text guards, so comments are stripped first — both files carry prose that names crons.

const root = resolve(__dirname, '..', '..')
const indexSrc = readFileSync(resolve(root, 'src/index.ts'), 'utf8')
const wranglerSrc = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8')

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1')
}

function cronConstants(src: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /const\s+(CRON_[A-Z0-9_]+)\s*=\s*"([^"]+)"\s*as const;/g
  for (const m of stripComments(src).matchAll(re)) out.set(m[1], m[2])
  return out
}

function wranglerCrons(src: string): string[] {
  const cfg = JSON.parse(stripComments(src)) as { triggers?: { crons?: string[] } }
  return cfg.triggers?.crons ?? []
}

function scheduledCases(src: string): Array<{ label: string; body: string }> {
  const code = stripComments(src)
  const start = code.indexOf('async scheduled(')
  expect(start, 'scheduled() handler present').toBeGreaterThan(-1)
  const sw = code.indexOf('switch (event.cron)', start)
  expect(sw, 'switch (event.cron) present').toBeGreaterThan(-1)
  const end = code.indexOf('default:', sw)
  expect(end, 'default branch present').toBeGreaterThan(sw)
  const region = code.slice(sw, end)
  const parts = region.split(/\bcase\s+/).slice(1)
  return parts.map((p) => {
    const label = p.slice(0, p.indexOf(':')).trim()
    return { label, body: p.slice(p.indexOf(':') + 1) }
  })
}

describe('scheduled() cron dispatch', () => {
  const constants = cronConstants(indexSrc)
  const triggers = wranglerCrons(wranglerSrc)

  it('reads a non-empty set from each side (coverage — an empty set would pass any equality)', () => {
    expect(constants.size).toBeGreaterThanOrEqual(3)
    expect(triggers.length).toBeGreaterThanOrEqual(3)
  })

  it('every CRON_* constant has a trigger in wrangler.jsonc', () => {
    for (const [name, expr] of constants) {
      expect(triggers, `${name} = "${expr}" is not in wrangler.jsonc triggers.crons`).toContain(expr)
    }
  })

  it('every wrangler trigger has a CRON_* constant', () => {
    const exprs = new Set(constants.values())
    for (const t of triggers) {
      expect(exprs.has(t), `trigger "${t}" has no CRON_* constant in src/index.ts (would hit the default branch every run)`).toBe(true)
    }
  })

  it('every constant is a `case` in the switch, and every case is a constant', () => {
    const cases = scheduledCases(indexSrc).map((c) => c.label)
    expect(new Set(cases)).toEqual(new Set(constants.keys()))
  })

  it('no case sequences more than one run*Cron job (one job per invocation)', () => {
    for (const { label, body } of scheduledCases(indexSrc)) {
      const jobs = [...new Set(body.match(/\brun[A-Z]\w*Cron\b/g) ?? [])]
      expect(jobs.length, `case ${label} references ${jobs.join(', ') || 'no job'}`).toBe(1)
    }
  })
})
