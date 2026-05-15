/**
 * Content pack: Taiwan Stage-2 medical board exam (二階醫師國考).
 *
 * Scaffold placeholder — ingestion of ~12,160 Q across 14 subjects is pending,
 * tracked under `openspec/changes/ingest-medexam2-tw-corpus`.
 *
 * Data location once ingested: `~/Desktop/國考/二階國考/二階國考_拆分/` →
 * parser → `dist/{questions,subjects,meta}.json` (same shape as content-medexam-tw).
 *
 * Public API (`getContentPack`) matches the `content-pack-contract` capability;
 * once ingestion lands, only the build script changes — the loader stays put.
 */

import type { ContentPack, Question, Subject } from '@study-rpg/core'

export * from './recruitment'
export * from './rooms'

interface BuiltMeta {
  id: string
  displayName: string
  locale: string
  builtAt: string
  sourceCredit: string
  sourceUrl: string
  license: string
  stats: { totalQuestions: number; parsedFiles: number; totalFiles: number; subjects: number }
}

/**
 * Browser-friendly loader: fetches the prebuilt JSON over HTTP.
 *
 * During scaffold (pre-ingest), returns an empty ContentPack with placeholder meta
 * so apps can wire the dependency without crashing. Real data arrives via
 * `ingest-medexam2-tw-corpus` change.
 */
export async function getContentPack(baseUrl = '/content/medexam2-tw'): Promise<ContentPack> {
  // Pre-ingest scaffold: try to fetch JSON, fall back to empty placeholder.
  try {
    const [meta, subjects, questions] = await Promise.all([
      fetch(`${baseUrl}/meta.json`).then((r) => r.json() as Promise<BuiltMeta>),
      fetch(`${baseUrl}/subjects.json`).then((r) => r.json() as Promise<Subject[]>),
      fetch(`${baseUrl}/questions.json`).then((r) => r.json() as Promise<Question[]>),
    ])

    return {
      meta: {
        id: meta.id,
        displayName: meta.displayName,
        locale: meta.locale,
        examMeta: { builtAt: meta.builtAt, stats: meta.stats },
        credits: [{ name: meta.sourceCredit, url: meta.sourceUrl, license: meta.license }],
      },
      subjects,
      questions,
    }
  } catch {
    // Scaffold placeholder — no dist yet
    return EMPTY_CONTENT_PACK
  }
}

export const EMPTY_CONTENT_PACK: ContentPack = {
  meta: {
    id: 'medexam2-tw',
    displayName: '台灣二階醫師國考',
    locale: 'zh-TW',
    examMeta: { builtAt: '', stats: { totalQuestions: 0, parsedFiles: 0, totalFiles: 0, subjects: 0 } },
    credits: [{ name: 'TBD (LLM-generated explanations; license TBD-after-ingest)', license: 'TBD' }],
  },
  subjects: [],
  questions: [],
}
