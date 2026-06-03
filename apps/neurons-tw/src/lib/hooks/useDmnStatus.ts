import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '../db'

export interface DmnStatus {
  drawsAvailable: number
  ownedCount: number
  catalogSize: number
}

const CATALOG_SIZE = 20

/**
 * Hook that returns current DMN draw availability + collection progress.
 * Uses Dexie liveQuery so it auto-updates when counters change.
 */
export function useDmnStatus(): DmnStatus {
  const [status, setStatus] = useState<DmnStatus>({
    drawsAvailable: 0,
    ownedCount: 0,
    catalogSize: CATALOG_SIZE,
  })

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [metaRow, ownedCount] = await Promise.all([
        db.meta.get('dmnDrawsAvailable'),
        db.dmnCards.count(),
      ])
      const drawsAvailable = parseInt(metaRow?.value ?? '0', 10) || 0
      return { drawsAvailable, ownedCount, catalogSize: CATALOG_SIZE }
    }).subscribe({
      next: (val) => setStatus(val),
      error: (err) => console.error('[useDmnStatus] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  return status
}
