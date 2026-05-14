/**
 * Content pack: Taiwan Stage-1 medical board exam (一階醫師國考).
 *
 * Data is loaded lazily from `./dist/questions.json` + `./dist/subjects.json`,
 * which are produced by `pnpm --filter @study-rpg/content-medexam-tw build`.
 *
 * If you forked this repo to make your own content pack, replace the build
 * script + dist/ files; the public `getContentPack()` API stays the same.
 */

import type { ContentPack, Question, Subject } from '@study-rpg/core'

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
 * Browser-friendly loader: fetches the prebuilt JSON over HTTP from the
 * configured base. In a Vite app, copy the dist/*.json into the host app's
 * public/ folder (or import this package and let the bundler resolve it).
 */
export async function getContentPack(baseUrl = '/content/medexam-tw'): Promise<ContentPack> {
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
}
