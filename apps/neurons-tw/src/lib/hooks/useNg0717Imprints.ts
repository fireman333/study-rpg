import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '../db'
import { getImprints, type Ng0717Imprint } from '../services/prescription'

/**
 * Reactive list of grown NG-0717 lineage imprints (dendritic buds). liveQuery-
 * subscribes over `db.meta` so a bud appears/warms the instant a day's prescription
 * completes and writes its `prescription:v1:ng0717:imprint:*` key. Returns ONLY
 * grown families (never a gap/placeholder for un-grown subjects), ordered
 * earliest-unlocked first — see `getImprints`.
 */
export function useNg0717Imprints(): Ng0717Imprint[] {
  const [imprints, setImprints] = useState<Ng0717Imprint[]>([])

  useEffect(() => {
    const sub = liveQuery(async () => {
      // Touch the meta table so the query re-runs whenever a prescription key is
      // written; getImprints re-scans the imprint prefix it needs.
      await db.meta.get('prescription:v1:localSeed')
      return getImprints()
    }).subscribe({
      next: (val) => setImprints(val),
      error: (err) => console.error('[useNg0717Imprints] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  return imprints
}
