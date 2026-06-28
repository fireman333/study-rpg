/**
 * Content hashing for the per-option 簡答 pipeline (neurons-simplified-explanations).
 *
 * The `sourceHash` is the cache key: a question whose hash is unchanged AND whose
 * entry passed QA is skipped on re-run; a hash change (edited 詳解, options, answer…)
 * forces regeneration. `PROMPT_VERSION` is folded in by the orchestrator separately so
 * a prompt change can invalidate every entry without touching question content.
 */
import { createHash } from 'node:crypto'

/** The question fields a 簡答 is derived from — the only inputs that should bust the cache. */
export interface HashableQuestion {
  stem: string
  options: Record<string, string>
  answer: string
  acceptedAnswers?: string[]
  disputed?: boolean
  explanation: string
}

/**
 * Safe-subset normalization of an explanation for hashing: collapse whitespace noise
 * that PDF→text extraction injects so cosmetic churn doesn't bust the cache, while keeping
 * the 簡解：sentinel (it changes meaning). NOT the display normalizer — hash-only.
 */
export function normalizeExplanationForHash(explanation: string): string {
  return explanation
    .replace(/\r\n?/g, '\n') // normalize newlines
    .replace(/[ \t]+/g, ' ') // collapse intra-line runs of spaces/tabs
    .replace(/ *\n */g, '\n') // trim spaces around newlines
    .replace(/\n{3,}/g, '\n\n') // collapse blank-line runs
    .trim()
}

/** Stable JSON: object keys sorted recursively so key order never changes the hash. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/** sha256 over the normalized, hash-relevant fields of a question. */
export function sourceHash(q: HashableQuestion): string {
  const payload = stableStringify({
    stem: q.stem,
    options: q.options,
    answer: q.answer,
    acceptedAnswers: q.acceptedAnswers ?? [],
    disputed: q.disputed ?? false,
    explanationNormalized: normalizeExplanationForHash(q.explanation),
  })
  return createHash('sha256').update(payload).digest('hex')
}

/** Count CJK/code-point length the way the 12–60 cap is specified (surrogate-pair safe). */
export function charLen(s: string): number {
  return Array.from(s.trim()).length
}
