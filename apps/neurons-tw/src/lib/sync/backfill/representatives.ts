// Representative-variant LWW reconcile — onPullComplete post-pass.
//
// The generic meta adapter (tables.ts) is first-write-wins, which is wrong for
// an editable preference: a device that already set a representative would
// ignore a newer selection pulled from another device. This pass enforces
// last-write-wins by comparing the timestamped envelope (`{ map, updatedAt }`)
// the representatives service writes. Mirrors the counters MAX-merge post-pass.

import type { NeuronsDB } from '../../db'
import { REPRESENTATIVES_META_KEY, pickRepresentativeLWW } from '../../services/representatives'

export async function backfillRepresentativesLWW(
  db: NeuronsDB,
  bundleMeta: Record<string, unknown>,
): Promise<{ updated: boolean }> {
  const incomingRaw = bundleMeta[REPRESENTATIVES_META_KEY]
  if (typeof incomingRaw !== 'string') return { updated: false }
  let updated = false
  await db.transaction('rw', db.meta, async () => {
    const localRow = await db.meta.get(REPRESENTATIVES_META_KEY)
    const next = pickRepresentativeLWW(localRow?.value, incomingRaw)
    if (next !== null) {
      await db.meta.put({ key: REPRESENTATIVES_META_KEY, value: next })
      updated = true
    }
  })
  return { updated }
}
