import type { Question, SubjectId } from '@study-rpg/core'
import { getContentPack } from '@study-rpg/content-medexam2-tw'
import {
  getEnabledQuestionYears,
  getQuestionYear,
  questionMatchesEnabledYears,
} from './question-year-filter'

interface RawQuestionPack {
  questions: Question[]
  playable: Question[]
  byId: Map<string, Question>
  availableYears: number[]
}

interface ActiveQuestionPack {
  questions: Question[]
  bySubject: Map<string, Question[]>
  byId: Map<string, Question>
  availableYears: number[]
  enabledYears: number[]
}

let _rawPackPromise: Promise<RawQuestionPack> | undefined

async function loadRawPack(): Promise<RawQuestionPack> {
  if (!_rawPackPromise) {
    _rawPackPromise = (async () => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const pack = await getContentPack(`${base}/content/medexam2-tw`)
      // Exclude option-image questions from the playable pool (random picker
      // + per-subject buckets). They remain in `byId` so historical
      // questionHistory / bookmark rows for those IDs still hydrate to a
      // Question object — the SRS scheduler suppresses them at the due-queue
      // surface (see srs-scheduler.ts).
      const playable = pack.questions.filter((q) => q.hasOptionImages !== true)
      const byId = new Map<string, Question>()
      for (const q of pack.questions) {
        byId.set(q.id, q)
      }
      const availableYears = Array.from(
        new Set(playable.map(getQuestionYear).filter((year): year is number => year !== null)),
      ).sort((a, b) => a - b)
      return { questions: pack.questions, playable, byId, availableYears }
    })()
  }
  return _rawPackPromise
}

async function loadPack(): Promise<ActiveQuestionPack> {
  const raw = await loadRawPack()
  const enabledYears = getEnabledQuestionYears(raw.availableYears)
  const enabledYearSet = new Set(enabledYears)
  const playable = raw.playable.filter((q) => questionMatchesEnabledYears(q, enabledYearSet))
  const bySubject = new Map<string, Question[]>()
  for (const q of playable) {
    const arr = bySubject.get(q.subject) ?? []
    arr.push(q)
    bySubject.set(q.subject, arr)
  }
  return {
    questions: playable,
    bySubject,
    byId: raw.byId,
    availableYears: raw.availableYears,
    enabledYears,
  }
}

/**
 * Load available years from the playable corpus. Used by settings UI.
 */
export async function loadAvailableQuestionYears(): Promise<number[]> {
  const { availableYears } = await loadRawPack()
  return availableYears
}

/**
 * Look up a question by id. Used by the SRS due-first picker to materialize
 * a `Question` from a stored `questionHistory` row. Returns null when the
 * question id doesn't exist in the current content pack (e.g. an orphan
 * row left over from an older corpus build).
 */
export async function pickQuestionById(questionId: string): Promise<Question | null> {
  const { byId } = await loadPack()
  return byId.get(questionId) ?? null
}

/**
 * Expose the `byId` map for callers that need bulk lookups (e.g. BookmarksPage
 * hydrates N bookmarks against the full corpus in one render).
 */
export async function loadQuestionsByIdMap(): Promise<ReadonlyMap<string, Question>> {
  const { byId } = await loadPack()
  return byId
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

/**
 * Return the list of playable question IDs for a subject. Used by ER consult
 * picker (services/er-consultation) to feed `pickERConsultQuestion`.
 */
export async function loadSubjectQuestionIds(subjectId: SubjectId): Promise<string[]> {
  const { bySubject } = await loadPack()
  const pool = bySubject.get(subjectId)
  return pool ? pool.map((q) => q.id) : []
}

/**
 * Load a map of subjectId -> total playable question count.
 * Used by the completion tracker to show "X / Y" progress.
 */
export async function loadPoolSizeMap(): Promise<Map<SubjectId, number>> {
  const { bySubject } = await loadPack()
  const map = new Map<SubjectId, number>()
  for (const [subjectId, questions] of bySubject.entries()) {
    map.set(subjectId as SubjectId, questions.length)
  }
  return map
}
