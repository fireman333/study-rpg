// Prescription plan earliest-createdAt-wins MIN-LWW reconcile — onPullComplete
// post-pass (add-neurons-prescription-tiers-and-sync, design D5).
//
// The generic meta adapter (tables.ts) is first-write-wins, which is only a
// transport default for the per-(account, date) `prescription:v1:plan:{date}`
// family: two offline devices can freeze DIVERGENT plans for the same date, and
// the account must converge on the EARLIEST-created one (the first device to
// open the day is the one most likely mid-progress; a late-opening idle device
// must not overwrite a worked plan). MIN over the totally-ordered
// `(createdAt, seed)` pair is a semilattice → pull-order-independent,
// bidirectionally convergent. Progress keys UNION'd from a losing plan stay
// counted (forgiving pre-convergence crediting); the tier claim-floor absorbs
// any derived-tier drop. Malformed incoming plans keep local. Mirrors the
// representatives LWW post-pass.

import type { NeuronsDB } from '../../db'
import {
  PRESCRIPTION_PLAN_KEY_PREFIX,
  isSyncedPrescriptionKey,
  isValidPlanRaw,
  pickPlanMinLWW,
} from '../../services/prescription'

export async function backfillPrescriptionPlanMinLWW(
  db: NeuronsDB,
  bundleMeta: Record<string, unknown>,
): Promise<{ updated: number }> {
  // Only in-window plan keys are reconciled — the same date-window test the
  // metaAdapter uses, so an out-of-window plan in a stale bundle can never
  // resurrect through this pass.
  const planKeys = Object.keys(bundleMeta).filter(
    (k) => k.startsWith(PRESCRIPTION_PLAN_KEY_PREFIX) && isSyncedPrescriptionKey(k),
  )
  let updated = 0
  if (planKeys.length === 0) return { updated }
  await db.transaction('rw', db.meta, async () => {
    for (const key of planKeys) {
      const incomingRaw = bundleMeta[key]
      // MIN-LWW reconcile only applies to a well-formed string incoming; a
      // non-string incoming is malformed transport and never wins.
      if (typeof incomingRaw === 'string') {
        const localRow = await db.meta.get(key)
        const next = pickPlanMinLWW(localRow?.value, incomingRaw)
        if (next !== null && next !== localRow?.value) {
          await db.meta.put({ key, value: next })
          updated++
        }
      }
      // ALWAYS validate the final stored row (runs even for a non-string
      // incoming): drop a malformed in-window plan the generic first-write apply
      // may have installed when local was absent — string garbage OR a non-string
      // value from a corrupt bundle. pickPlanMinLWW can't repair that (it keeps
      // local); deleting it lets the reader regenerate a fresh valid plan.
      const finalRow = await db.meta.get(key)
      if (finalRow !== undefined && !isValidPlanRaw(finalRow.value)) {
        await db.meta.delete(key)
        updated++
      }
    }
  })
  return { updated }
}
