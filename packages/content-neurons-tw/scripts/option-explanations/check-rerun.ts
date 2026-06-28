import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { sourceHash, type HashableQuestion } from './hash'
import { validateEntry, NO_REASON_SENTINEL, type QuestionForValidation } from './validate'

const [pilotPath, rerunOut] = process.argv.slice(2)
const items: (HashableQuestion & { id: string; sourceHash: string })[] = JSON.parse(readFileSync(pilotPath, 'utf-8'))
const byId = new Map(items.map((q) => [q.id, q]))
const oe: Record<string, Record<string, string>> = {}
for (const f of readdirSync(rerunOut).filter((n) => n.startsWith('gen-') && n.endsWith('.json'))) {
  Object.assign(oe, JSON.parse(readFileSync(resolve(rerunOut, f), 'utf-8')))
}
let pass = 0
for (const [id, map] of Object.entries(oe)) {
  const q = byId.get(id)!
  const qv: QuestionForValidation = { id, stem: q.stem, options: q.options, answer: q.answer, acceptedAnswers: q.acceptedAnswers, disputed: q.disputed, explanation: q.explanation }
  const res = validateEntry({ sourceHash: q.sourceHash, optionExplanations: map }, qv, sourceHash(qv))
  const sentinels = Object.values(map).filter((t) => t === NO_REASON_SENTINEL).length
  if (res.ok) pass += 1
  console.log(`${res.ok ? '✓' : '✗'} ${id} (ans=${q.answer}${q.disputed ? ',送分' : ''}) sentinels=${sentinels}${res.ok ? '' : ' :: ' + res.issues.join('; ')}`)
  for (const k of Object.keys(q.options)) console.log(`     (${k}${k === q.answer ? '✓' : ' '}) ${map[k] ?? '«missing»'}`)
}
console.log(`\nrerun: ${pass}/${Object.keys(oe).length} deterministic-pass`)
