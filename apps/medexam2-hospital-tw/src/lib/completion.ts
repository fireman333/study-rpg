import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useMemo } from 'react'
import type { SubjectId } from '@study-rpg/core'
import { getHospitalDB } from '../db/schema'
import { loadPoolSizeMap } from './quiz'

export interface SubjectCompletion {
  answered: number
  total: number
}

/**
 * Reactive hook providing a map of subjectId -> { answered, total } completion status.
 * Returns `undefined` until both IndexedDB and the content pack are loaded.
 */
export function useCompletionMap(): Map<SubjectId, SubjectCompletion> | undefined {
  const [poolSizeMap, setPoolSizeMap] = useState<Map<SubjectId, number> | undefined>()

  useEffect(() => {
    loadPoolSizeMap().then(setPoolSizeMap)
  }, [])

  // Reactive query against questionHistory to find unique answered questions per subject
  const history = useLiveQuery(() => getHospitalDB().questionHistory.toArray())

  return useMemo(() => {
    if (!poolSizeMap || !history) return undefined

    const completionMap = new Map<SubjectId, SubjectCompletion>()

    // Initialize with total counts from poolSizeMap
    for (const [subjectId, total] of poolSizeMap.entries()) {
      completionMap.set(subjectId, { answered: 0, total })
    }

    // Group history by subject and count unique questionIds
    // (questionHistory table is already keyed by questionId, so we can just sum them up)
    for (const row of history) {
      const stats = completionMap.get(row.subjectId as SubjectId)
      if (stats) {
        stats.answered += 1
      }
    }

    return completionMap
  }, [poolSizeMap, history])
}
