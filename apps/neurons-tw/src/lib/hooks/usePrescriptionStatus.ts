import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import { db } from '../db'
import {
  getOrCreateTodayPlan,
  getPrescriptionStatus,
  type PrescriptionStatus,
} from '../services/prescription'

/**
 * Reactive「今日處方箋」status hook (mirrors useDmnStatus). Ensures today's frozen
 * plan exists once, then liveQuery-subscribes over `db.meta` so line progress,
 * whole-day completion, and the derived NG-0717 stage recompute automatically as
 * the shared answer path writes `prescription:v1:*` keys.
 *
 * The plan is generated from the LIVE content pack + question history at first
 * access of the day; `getOrCreateTodayPlan` is a no-op on subsequent calls (the
 * plan key is frozen), so the ensure-effect is guarded to run at most once.
 */
export function usePrescriptionStatus(pack: ContentPack): PrescriptionStatus | null {
  const [status, setStatus] = useState<PrescriptionStatus | null>(null)
  // Guard the plan-ensure so it fires once (StrictMode double-mount safe; the
  // service also freezes the plan key, this just avoids redundant reads).
  const ensuredRef = useRef(false)

  useEffect(() => {
    if (ensuredRef.current) return
    ensuredRef.current = true
    // Plan is built from the authoritative Dexie history inside the service, so
    // the async liveQuery load of question history can't freeze an empty plan.
    getOrCreateTodayPlan(pack).catch((err) =>
      console.error('[usePrescriptionStatus] plan ensure failed:', err),
    )
  }, [pack])

  useEffect(() => {
    const sub = liveQuery(async () => {
      // Touch the meta table so the query re-runs whenever any prescription key
      // is written; getPrescriptionStatus re-reads the specific keys it needs.
      await db.meta.get('prescription:v1:localSeed')
      return getPrescriptionStatus()
    }).subscribe({
      next: (val) => setStatus(val),
      error: (err) => console.error('[usePrescriptionStatus] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  return status
}
