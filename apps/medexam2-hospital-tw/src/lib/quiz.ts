import type { Question, SubjectId } from '@study-rpg/core'
import { getContentPack } from '@study-rpg/content-medexam2-tw'

let _packPromise: Promise<{ questions: Question[]; bySubject: Map<string, Question[]> }> | undefined

async function loadPack(): Promise<{ questions: Question[]; bySubject: Map<string, Question[]> }> {
  if (!_packPromise) {
    _packPromise = (async () => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const pack = await getContentPack(`${base}/content/medexam2-tw`)
      const bySubject = new Map<string, Question[]>()
      for (const q of pack.questions) {
        const arr = bySubject.get(q.subject) ?? []
        arr.push(q)
        bySubject.set(q.subject, arr)
      }
      return { questions: pack.questions, bySubject }
    })()
  }
  return _packPromise
}

/**
 * Pick a random question from the given subject's pool. Re-rolls up to 3 times
 * if the candidate id is in `seenIds`; accepts on the 3rd repeat to prevent
 * infinite loops on small subject pools.
 *
 * Returns `null` if the subject has no questions (corpus fetch failed or
 * subject filter empty).
 */
export async function pickRandomQuestion(
  subjectId: SubjectId,
  seenIds: Set<string>,
): Promise<Question | null> {
  const { bySubject } = await loadPack()
  const pool = bySubject.get(subjectId)
  if (!pool || pool.length === 0) return null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = pool[Math.floor(Math.random() * pool.length)]
    if (!seenIds.has(candidate.id)) return candidate
  }
  // 3 re-rolls all hit seen; accept the latest random pick anyway
  return pool[Math.floor(Math.random() * pool.length)]
}
