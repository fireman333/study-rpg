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

export async function loadConceptTags(baseUrl = '/content/neurons-tw'): Promise<ConceptTagMap> {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch(`${baseUrl}/concept-tags.json`)
      .then((r) => (r.ok ? (r.json() as Promise<ConceptTagMap>) : {}))
      .then((m) => (cache = m))
      .catch(() => (cache = {})) // concept tags are enhancement-only — never block the bank on a fetch miss
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
export function useConceptTags(baseUrl = '/content/neurons-tw'): ConceptTagMap {
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
