// Active-squad LWW reconcile — onPullComplete post-pass.
//
// The generic meta adapter (tables.ts) is first-write-wins, which is wrong for
// an editable preference: a device that already set a squad would ignore a
// newer selection pulled from another device. This pass enforces last-write-wins
// by comparing the timestamped envelope (`{ members, updatedAt }`) the
// study-squad service writes. Mirrors backfill/representatives.ts.

import type { NeuronsDB } from '../../db'
import { ACTIVE_SQUAD_META_KEY, pickActiveSquadLWW } from '../../services/study-squad'

export async function backfillActiveSquadLWW(
  db: NeuronsDB,
  bundleMeta: Record<string, unknown>,
): Promise<{ updated: boolean }> {
  const incomingRaw = bundleMeta[ACTIVE_SQUAD_META_KEY]
  if (typeof incomingRaw !== 'string') return { updated: false }
  let updated = false
  await db.transaction('rw', db.meta, async () => {
    const localRow = await db.meta.get(ACTIVE_SQUAD_META_KEY)
    const next = pickActiveSquadLWW(localRow?.value, incomingRaw)
    if (next !== null) {
      await db.meta.put({ key: ACTIVE_SQUAD_META_KEY, value: next })
      updated = true
    }
  })
  return { updated }
}
