/**
 * Mock attempt DAO — thin wrapper over Dexie mockAttempts + mockInProgress stores.
 * Spec: openspec/specs/persistence/spec.md (mock attempts + in-progress)
 */

import { getDB, type MockAttempt, type MockInProgress } from '@study-rpg/core'

export async function saveAttempt(attempt: MockAttempt): Promise<void> {
  await getDB().mockAttempts.put(attempt)
}

export async function listAttemptsByPaper(paperId: string): Promise<MockAttempt[]> {
  return await getDB().mockAttempts.where('paperId').equals(paperId).toArray()
}

export async function getLatestAttempt(paperId: string): Promise<MockAttempt | null> {
  const all = await listAttemptsByPaper(paperId)
  if (all.length === 0) return null
  return all.reduce((latest, a) => (a.finishedAt > latest.finishedAt ? a : latest), all[0])
}

export async function getAttemptById(id: string): Promise<MockAttempt | null> {
  return (await getDB().mockAttempts.get(id)) ?? null
}

/** Group all latest-attempts per paperId. Used by picker overlay. */
export async function listLatestAttemptByPaperMap(): Promise<Map<string, MockAttempt>> {
  const all = await getDB().mockAttempts.toArray()
  const m = new Map<string, MockAttempt>()
  for (const a of all) {
    const cur = m.get(a.paperId)
    if (!cur || a.finishedAt > cur.finishedAt) m.set(a.paperId, a)
  }
  return m
}

// ─── In-progress singleton ────────────────────────────────────────────────────

const IN_PROGRESS_KEY = 'mockInProgress' as const

export async function getInProgress(): Promise<MockInProgress | null> {
  const row = await getDB().mockInProgress.get(IN_PROGRESS_KEY)
  if (!row) return null
  const { key: _key, ...state } = row
  return state
}

export async function saveInProgress(state: MockInProgress): Promise<void> {
  await getDB().mockInProgress.put({ ...state, key: IN_PROGRESS_KEY })
}

export async function clearInProgress(): Promise<void> {
  await getDB().mockInProgress.delete(IN_PROGRESS_KEY)
}
