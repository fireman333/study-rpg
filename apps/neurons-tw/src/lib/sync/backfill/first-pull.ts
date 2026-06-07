// Per-family first-pull UNION reconcile — onPullComplete post-pass.
//
// The generic meta adapter (tables.ts) is first-write-wins, which is wrong for a
// GROWING set: a device that already first-pulled some families would ignore the
// families another device first-pulled. This pass merges by monotonic UNION so
// the first-pull stays one-time across all devices (a fresh device adopting the
// union never re-mints). Mirrors the representatives LWW post-pass.

import type { NeuronsDB } from '../../db'
import { FIRST_PULL_FAMILIES_KEY, unionFirstPullFamilies } from '../../services/first-pull'

export async function backfillFirstPullFamiliesUnion(
  db: NeuronsDB,
  bundleMeta: Record<string, unknown>,
): Promise<{ updated: boolean }> {
  const incomingRaw = bundleMeta[FIRST_PULL_FAMILIES_KEY]
  if (typeof incomingRaw !== 'string') return { updated: false }
  let updated = false
  await db.transaction('rw', db.meta, async () => {
    const localRow = await db.meta.get(FIRST_PULL_FAMILIES_KEY)
    const next = unionFirstPullFamilies(localRow?.value, incomingRaw)
    if (next !== null) {
      await db.meta.put({ key: FIRST_PULL_FAMILIES_KEY, value: next })
      updated = true
    }
  })
  return { updated }
}
