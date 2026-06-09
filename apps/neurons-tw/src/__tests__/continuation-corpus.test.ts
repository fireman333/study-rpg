import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Question } from '@study-rpg/core'
import { isContinuationQuestion, resolvePrecedingChain } from '@study-rpg/core'

// Reads the REAL built corpus so this self-reports drift rather than hard-pinning
// a count. Guards the 承上題 feature against corpus re-ingestion or core-logic
// regression. See add-neurons-continuation-context (Decision D5).
const here = dirname(fileURLToPath(import.meta.url))
const questions = JSON.parse(
  readFileSync(resolve(here, '../../public/content/neurons-tw/questions.json'), 'utf8'),
) as Question[]
const byId = new Map(questions.map((q) => [q.id, q]))

describe('承上題 corpus (neurons)', () => {
  const continuations = questions.filter(isContinuationQuestion)

  it('the corpus contains continuation questions', () => {
    expect(continuations.length).toBeGreaterThan(0)
  })

  it('at least 11 continuation questions resolve a non-empty preceding chain', () => {
    const resolved = continuations.filter((q) => resolvePrecedingChain(q, byId).length > 0)
    expect(resolved.length).toBeGreaterThanOrEqual(11)
  })

  it('resolved chains are root-first and within the same paper prefix', () => {
    for (const q of continuations) {
      const chain = resolvePrecedingChain(q, byId)
      if (chain.length === 0) continue
      const prefix = q.id.replace(/-Q\d+$/, '')
      // every link shares the current question's full subject prefix (no cross-paper)
      for (const prev of chain) expect(prev.id.startsWith(`${prefix}-Q`)).toBe(true)
      // root-first: the nearest predecessor (last in array) is Q(n-1)
      const n = Number(/-Q(\d+)$/.exec(q.id)![1])
      expect(chain[chain.length - 1].id).toBe(`${prefix}-Q${n - 1}`)
    }
  })

  it('the known orphan degrades to an empty chain (predecessor absent upstream)', () => {
    const orphan = byId.get('105-2-醫學二-病理學-Q75')
    if (orphan) {
      // Q74 is missing from the corpus, so the best-effort walk yields nothing.
      expect(resolvePrecedingChain(orphan, byId)).toEqual([])
    }
  })
})
