import type { Question } from '../types'

/**
 * 承上題 (continuation question) detection + preceding-chain resolution.
 *
 * Content-agnostic pure helpers: plain `Question` data + a by-id map in, plain
 * array out — no React / Dexie / fetch. Lifted unchanged from the original
 * 二階-local implementation so every app/fork shares one source of truth.
 */

const CONTINUATION_PREFIX = '承上題'

/**
 * Hard cap on backward walk steps. A real paper never chains this deep; the cap
 * only guards against malformed data producing a runaway loop.
 */
const MAX_CHAIN_STEPS = 20

/** Question id shape: `<year>-<sitting>-<book>-<subject>-Q<n>`. */
const ID_PATTERN = /^(.*)-Q(\d+)$/

/**
 * True iff the question's stem begins with the literal `承上題` — the only
 * signal the corpus carries for continuation questions (no explicit flag yet).
 */
export function isContinuationQuestion(question: Question): boolean {
  return (question.stem ?? '').startsWith(CONTINUATION_PREFIX)
}

/**
 * Resolve the ordered preceding chain for a continuation question, walking back
 * through the same paper until the scenario root.
 *
 * Walk: parse the paper prefix + number `n` from the id, then repeatedly look up
 * `<prefix>-Q<n-1>` in `byId`, decrementing. Stop when the predecessor is NOT a
 * continuation question (scenario root — included, then stop), the predecessor
 * id is absent from `byId` (best-effort), `n` reaches 1, or the step cap is hit.
 * Because each lookup id reuses the SAME prefix, the walk can never cross into
 * another paper.
 *
 * @returns preceding questions ordered root-first … nearest-last, excluding the
 *   current question. Empty array if `question` isn't a continuation question or
 *   no predecessor can be resolved.
 */
export function resolvePrecedingChain(
  question: Question,
  byId: ReadonlyMap<string, Question>,
): Question[] {
  if (!isContinuationQuestion(question)) return []

  const match = ID_PATTERN.exec(question.id)
  if (!match) return []
  const prefix = match[1]
  let n = Number(match[2])

  const chain: Question[] = []
  for (let step = 0; step < MAX_CHAIN_STEPS; step += 1) {
    n -= 1
    if (n < 1) break
    const prev = byId.get(`${prefix}-Q${n}`)
    if (!prev) break // predecessor missing from pool — stop, keep what we have
    chain.push(prev)
    if (!isContinuationQuestion(prev)) break // reached scenario root, included
  }

  chain.reverse() // walked nearest-first; present root-first
  return chain
}
