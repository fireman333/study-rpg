/**
 * Mentor backlog DAO — singleton {key: 'mentorBacklog'} in Dexie.
 * Spec: openspec/specs/persistence/spec.md (Mentor backlog singleton)
 */

import { getDB, type MentorBacklog } from '@study-rpg/core'

const KEY = 'mentorBacklog' as const

export async function getBacklog(): Promise<MentorBacklog | null> {
  const row = await getDB().mentorBacklog.get(KEY)
  if (!row) return null
  const { key: _key, ...state } = row
  return state
}

export async function saveBacklog(state: MentorBacklog): Promise<void> {
  await getDB().mentorBacklog.put({ ...state, key: KEY })
}

export async function clearBacklog(): Promise<void> {
  await getDB().mentorBacklog.delete(KEY)
}
