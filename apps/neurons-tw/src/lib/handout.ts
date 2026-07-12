/**
 * Lazy loader for the 考前講義(beta) dataset (add-neurons-anatomy-handout).
 *
 * handout.json is a build product (packages/content-neurons-tw → copy-content → public/content)
 * that is NOT part of getContentPack's initial bundle — the /cram/handout scene fetches it on
 * demand so the homepage/quiz paths never pay its cost. Cached module-wide after the first load.
 * Mirrors lib/cram.ts.
 */
import { useEffect, useState } from 'react'
import { EXAM_PAPER_ORDER } from '@study-rpg/content-neurons-tw'
import type { HandoutData, HandoutSubject } from '@study-rpg/content-neurons-tw'

/**
 * Order handout subjects by exam-paper sequence — 醫學一 then 醫學二 (reorder-handout-subjects-by-exam-paper),
 * the SAME `EXAM_PAPER_ORDER` single source of truth FamilyPicker / CollectionPage sort by, NOT the
 * build-time SUBJECT_META order (which interleaves the two papers). Pure + stable; subjects absent from
 * `EXAM_PAPER_ORDER` sort after the listed ones (extras fallback) and are never dropped.
 */
export function orderSubjectsByExamPaper<T extends { subjectId: string }>(subjects: T[]): T[] {
  const order = [...EXAM_PAPER_ORDER.醫學一, ...EXAM_PAPER_ORDER.醫學二]
  const rank = (id: string): number => {
    const i = order.indexOf(id)
    return i === -1 ? order.length : i
  }
  return [...subjects].sort((a, b) => rank(a.subjectId) - rank(b.subjectId))
}

// MUST include the Vite base (`/neurons/` in prod, `/` in dev) — a bare `/content/...` path hits
// the SPA index.html fallback in prod (200 HTML → JSON.parse fails). Same rule as cram.ts.
const DEFAULT_URL = `${import.meta.env.BASE_URL}content/neurons-tw/handout.json`

let cache: HandoutData | null = null
let inflight: Promise<HandoutData | null> | null = null

export async function loadHandout(url = DEFAULT_URL): Promise<HandoutData | null> {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<HandoutData>
      })
      .then((d) => (cache = d))
      .catch((e) => {
        // Surface the failure, don't swallow it — the app stays usable without the handout.
        console.warn(`[handout] load failed (${url}):`, (e as Error)?.message ?? e)
        // Reset so a later call retries instead of returning this settled-null promise forever
        // (the rescue → handout deep-link surfaces a retry that would otherwise stick until reload).
        inflight = null
        return null
      })
  }
  return inflight
}

/** React hook: returns the handout dataset (null until loaded / on failure). */
export function useHandout(url = DEFAULT_URL): HandoutData | null {
  const [data, setData] = useState<HandoutData | null>(cache)
  useEffect(() => {
    let alive = true
    void loadHandout(url).then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [url])
  return data
}

export type { HandoutData, HandoutSubject }
