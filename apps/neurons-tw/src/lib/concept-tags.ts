/**
 * Concept-tag lookup for the app (add-neurons-concept-tags §5).
 *
 * Loads the build-produced `concept-tags.json` ({ qid → leafId[] }) and resolves each
 * leafId to its canonical Chinese label via the content pack's exported CONCEPT_VOCAB.
 * Powers 題庫 concept search (label text folded into the haystack) and the per-card
 * concept labels. Purely additive over the corpus — reads a sidecar, never mutates questions.
 */
import { useEffect, useState } from 'react'
import { CONCEPT_VOCAB } from '@study-rpg/content-neurons-tw'
import type { Question } from '@study-rpg/core'

export type ConceptTagMap = Record<string, string[]>
export interface ConceptLabel {
  leafId: string
  zh: string
}

// (subjectId::leafId) → canonical zh label, built once from the closed vocab.
const zhByKey: Record<string, string> = {}
for (const [sid, tree] of Object.entries(CONCEPT_VOCAB)) {
  for (const l of tree.leaves) zhByKey[`${sid}::${l.id}`] = l.zh
}

let cache: ConceptTagMap | null = null
let inflight: Promise<ConceptTagMap> | null = null

// MUST include the Vite base (`/neurons/` in prod, `/` in dev) — same as App.tsx's
// getContentPack call. A bare `/content/...` path hits the SPA index.html fallback in
// prod (200 HTML), so JSON.parse fails and labels/search silently vanish.
const DEFAULT_BASE = `${import.meta.env.BASE_URL}content/neurons-tw`

export async function loadConceptTags(baseUrl = DEFAULT_BASE): Promise<ConceptTagMap> {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch(`${baseUrl}/concept-tags.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ConceptTagMap>
      })
      .then((m) => (cache = m))
      .catch((e) => {
        // enhancement-only: never block the bank — but surface the failure, don't swallow it.
        console.warn(
          `[concept-tags] load failed (${baseUrl}/concept-tags.json) — labels/search disabled this session:`,
          (e as Error)?.message ?? e,
        )
        return (cache = {})
      })
  }
  return inflight
}

/** Resolve a question's tags to display labels (unknown ids dropped, order preserved). */
export function conceptLabelsFor(q: Question, tags: ConceptTagMap): ConceptLabel[] {
  const ids = tags[q.id]
  if (!ids) return []
  return ids
    .map((id) => ({ leafId: id, zh: zhByKey[`${q.subject}::${id}`] ?? '' }))
    .filter((l) => l.zh)
}

/** React hook: returns the loaded tag map (empty until loaded). */
export function useConceptTags(baseUrl = DEFAULT_BASE): ConceptTagMap {
  const [tags, setTags] = useState<ConceptTagMap>(cache ?? {})
  useEffect(() => {
    let alive = true
    void loadConceptTags(baseUrl).then((m) => alive && setTags(m))
    return () => {
      alive = false
    }
  }, [baseUrl])
  return tags
}
