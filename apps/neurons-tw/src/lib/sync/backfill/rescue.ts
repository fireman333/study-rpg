// Single-subject rescue LWW reconcile — onPullComplete post-pass
// (add-neurons-rescue-r2-sync, design D2 / D4 / D5).
//
// The generic meta adapter (tables.ts) is first-write-wins, which is only a
// transport default for the rescue family. This pass enforces the real merge:
//   - `rescue:v1:plan` — envelope LWW on `updatedAt` (latest-action-wins;
//     explicit `plan: null` clears participate exactly like non-null envelopes);
//   - `rescue:v1:conf:{planCreatedAt}:{qid}` — per-key LWW on `at`;
//   - `rescue:v1:ovr:{planCreatedAt}:{conceptId}` — per-key LWW on `setAt`.
// Each LWW uses a deterministic total order over the canonical value for ties →
// pull-order-independent, bidirectionally convergent. Malformed incoming never
// wins; a malformed STORED plan envelope is dropped so the reader regenerates.
// Only in-window keys are reconciled (same matcher the metaAdapter uses), so an
// out-of-window stale-run key in a stale bundle can never resurrect. Mirrors the
// prescription-plan MIN-LWW post-pass.

import type { NeuronsDB } from '../../db'
import {
  RESCUE_PLAN_KEY,
  RESCUE_CONF_KEY_PREFIX,
  RESCUE_OVR_KEY_PREFIX,
  isSyncedRescueKey,
  isValidPlanEnvelopeRaw,
  pickPlanEnvelopeLWW,
  pickConfLWW,
  pickOvrLWW,
} from '../../services/rescue/rescue-sync-keys'

export async function backfillRescueLWW(
  db: NeuronsDB,
  bundleMeta: Record<string, unknown>,
): Promise<{ updated: number }> {
  let updated = 0
  const confKeys: string[] = []
  const ovrKeys: string[] = []
  for (const key of Object.keys(bundleMeta)) {
    if (key.startsWith(RESCUE_CONF_KEY_PREFIX)) {
      if (isSyncedRescueKey(key)) confKeys.push(key)
    } else if (key.startsWith(RESCUE_OVR_KEY_PREFIX)) {
      if (isSyncedRescueKey(key)) ovrKeys.push(key)
    }
  }
  const hasPlan = RESCUE_PLAN_KEY in bundleMeta

  if (!hasPlan && confKeys.length === 0 && ovrKeys.length === 0) return { updated }

  await db.transaction('rw', db.meta, async () => {
    // Plan envelope LWW (+ validate final: drop a malformed in-window envelope
    // the generic first-write apply may have installed → reader regenerates).
    if (hasPlan) {
      const incomingRaw = bundleMeta[RESCUE_PLAN_KEY]
      if (typeof incomingRaw === 'string') {
        const localRow = await db.meta.get(RESCUE_PLAN_KEY)
        const next = pickPlanEnvelopeLWW(localRow?.value, incomingRaw)
        if (next !== null && next !== localRow?.value) {
          await db.meta.put({ key: RESCUE_PLAN_KEY, value: next })
          updated++
        }
      }
      const finalRow = await db.meta.get(RESCUE_PLAN_KEY)
      if (finalRow !== undefined && !isValidPlanEnvelopeRaw(finalRow.value)) {
        await db.meta.delete(RESCUE_PLAN_KEY)
        updated++
      }
    }

    for (const key of confKeys) {
      const incomingRaw = bundleMeta[key]
      if (typeof incomingRaw !== 'string') continue
      const localRow = await db.meta.get(key)
      const next = pickConfLWW(localRow?.value, incomingRaw)
      if (next !== null && next !== localRow?.value) {
        await db.meta.put({ key, value: next })
        updated++
      }
    }

    for (const key of ovrKeys) {
      const incomingRaw = bundleMeta[key]
      if (typeof incomingRaw !== 'string') continue
      const localRow = await db.meta.get(key)
      const next = pickOvrLWW(localRow?.value, incomingRaw)
      if (next !== null && next !== localRow?.value) {
        await db.meta.put({ key, value: next })
        updated++
      }
    }
  })
  return { updated }
}
