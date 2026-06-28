/**
 * Deterministic (non-LLM) validator for per-option 簡答 entries
 * (neurons-simplified-explanations, spec "A deterministic validator SHALL gate
 * every generated 簡答"). Runs on 100% of entries — both inside the generation
 * pipeline (before promotion to the shipped sidecar) and in the content-pack
 * `verify:option-explanations` build gate, so the shipped data can never carry an
 * entry that fails these structural checks.
 */
import { charLen, sourceHash, type HashableQuestion } from './hash'

/** Per-option length window (CJK code points). Tuned from pilot data: a 12-char floor
 *  rejected legitimately terse correct-option lines (7–11 chars) → floor 8; a 60-char ceiling
 *  rejected inherently long answers (calculations, multi-mechanism pharmacology) → ceiling 80.
 *  Median shippable line is ~25 chars, so 80 is a generous outlier cap, not the norm. */
export const MIN_LEN = 8
export const MAX_LEN = 80

/** Sentinel emitted when the 詳解 does not justify why a wrong option is wrong. */
export const NO_REASON_SENTINEL = '詳解未明確說明此選項錯因'

export interface OptionExplanationEntry {
  sourceHash: string
  model?: string
  promptVersion?: string
  generatedAt?: string
  optionExplanations: Record<string, string>
  flags?: string[]
}

export type QuestionForValidation = HashableQuestion & {
  id: string
}

export interface ValidationResult {
  ok: boolean
  issues: string[]
}

// Markup that must never appear in a plain-text 簡答 line: table pipes, HTML tags,
// code fences, markdown table rules, or bullet/heading leaders.
const MARKUP = /[|<>]|```|---|^\s*[#*\-•]\s/

/**
 * Validate one entry against its question. `recomputedHash` may be passed to avoid
 * recomputing; otherwise it is derived from `q`.
 */
export function validateEntry(
  entry: OptionExplanationEntry,
  q: QuestionForValidation,
  recomputedHash: string = sourceHash(q),
): ValidationResult {
  const issues: string[] = []
  const optionKeys = Object.keys(q.options).sort()
  const entryKeys = Object.keys(entry.optionExplanations ?? {}).sort()

  // Key-set parity: exactly the question's option keys, no more, no fewer.
  if (entryKeys.join(',') !== optionKeys.join(',')) {
    issues.push(`option keys ${JSON.stringify(entryKeys)} !== question options ${JSON.stringify(optionKeys)}`)
  }

  // Correct-answer key present (skipped for disputed/送分 — `answer` is a placeholder).
  if (!q.disputed && !(q.answer in (entry.optionExplanations ?? {}))) {
    issues.push(`correct-answer key "${q.answer}" missing from entry`)
  }

  // Per-entry content checks.
  for (const [key, raw] of Object.entries(entry.optionExplanations ?? {})) {
    const text = (raw ?? '').trim()
    if (!text) {
      issues.push(`option ${key}: empty`)
      continue
    }
    if (text === NO_REASON_SENTINEL) continue // allowed verbatim, exempt from length/markup
    const n = charLen(text)
    if (n < MIN_LEN || n > MAX_LEN) issues.push(`option ${key}: length ${n} outside [${MIN_LEN},${MAX_LEN}]`)
    if (MARKUP.test(text)) issues.push(`option ${key}: contains markup/markdown/HTML`)
  }

  // sourceHash integrity.
  if (entry.sourceHash !== recomputedHash) {
    issues.push(`sourceHash mismatch (entry ${entry.sourceHash?.slice(0, 8)} vs recomputed ${recomputedHash.slice(0, 8)})`)
  }

  return { ok: issues.length === 0, issues }
}
