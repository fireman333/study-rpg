// Self-check for agent-mode replies (see pick.mjs header). Usage:
//   node packages/content-neurons-tw/scripts/cloze-wip/agent-pick-check.mjs <batch-list.txt> [dir, default agent-pick]
// For every draft name in the list: the reply file exists, is a JSON array covering every 【n】,
// and every span occurs verbatim in its sentence exactly once (outside its hide phrases). pick-v4
// `hide`: an array of ≤3 phrases, each ≤20 characters, occurring exactly once in the sentence and not
// overlapping the span (`admit-lib.mjs` `resolveHides`, the same reading admit uses). One line per problem.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveHides } from './admit-lib.mjs'
const DIR = process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), 'agent-pick')
const names = readFileSync(process.argv[2], 'utf-8').split('\n').filter(Boolean)
let bad = 0
let hides = 0
for (const name of names) {
  const prompt = readFileSync(join(DIR, name + '.prompt.txt'), 'utf-8')
  const sentences = new Map([...prompt.matchAll(/^【(\d+)】(.*)$/gm)].map((m) => [Number(m[1]), m[2]]))
  const rp = join(DIR, name + '.reply.txt')
  if (!existsSync(rp)) { console.log(`${name}: MISSING reply`); bad++; continue }
  let arr
  try { const t = readFileSync(rp, 'utf-8'); arr = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1)) } catch (e) { console.log(`${name}: unparseable (${e.message})`); bad++; continue }
  const seen = new Set()
  for (const o of arr) {
    seen.add(o.n)
    const s = sentences.get(o.n)
    if (s === undefined) { console.log(`${name}: n=${o.n} not in prompt`); bad++; continue }
    if (o.skip) continue
    const r = resolveHides(s, o.span, o.hide ?? [])
    if (r.error) { console.log(`${name}: n=${o.n} span 「${o.span}」: ${r.error}`); bad++; continue }
    hides += r.hides.length
  }
  for (const n of sentences.keys()) if (!seen.has(n)) { console.log(`${name}: n=${n} not answered`); bad++ }
}
console.log(`checked ${names.length} replies, ${hides} hide phrase(s), ${bad} problem(s)`)
process.exitCode = bad ? 1 : 0
