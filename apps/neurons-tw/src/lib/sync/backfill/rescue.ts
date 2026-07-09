// Multi-subject rescue LWW reconcile — onPullComplete post-pass
// (add-neurons-multi-subject-rescue, design D1 / D3 / D7).
//
// The generic meta adapter (tables.ts) is first-write-wins, which is only a
// transport default for the rescue family. This pass enforces the real merge,
// iterating EVERY incoming per-family plan key:
//   - `rescue:v1:plan:{familyId}` — envelope LWW on `updatedAt` (latest-action-
//     wins; explicit `plan: null` clears participate exactly like non-null ones);
//   - `rescue:v1:conf:{planCreatedAt}:{familyId}:{qid}` — per-key LWW on `at`;
//   - `rescue:v1:ovr:{planCreatedAt}:{familyId}:{conceptId}` — per-key LWW on `setAt`.
// Each LWW uses a deterministic total order over the canonical value for ties →
// pull-order-independent, bidirectionally convergent. Malformed incoming never
// wins; a malformed STORED plan envelope is dropped so the reader regenerates.
// Only in-window keys are reconciled (same matcher the metaAdapter uses), so an
// out-of-window stale-run key in a stale bundle can never resurrect.
//
// The legacy single `rescue:v1:plan` key is NOT admitted by the matcher (v28
// never snapshots it), so a pre-multi cloud plan reaches a fresh device ONLY
// through this pass's raw-bundle migration read (design D9 migration step 2).

import type { NeuronsDB } from '../../db'
import {
  RESCUE_PLAN_KEY,
  RESCUE_PLAN_KEY_PREFIX,
  RESCUE_CONF_KEY_PREFIX,
  RESCUE_OVR_KEY_PREFIX,
  rescuePlanKey,
  isSyncedRescueKey,
  isValidPlanEnvelopeRaw,
  parsePlanEnvelope,
  pickPlanEnvelopeLWW,
  pickConfLWW,
  pickOvrLWW,
} from '../../services/rescue/rescue-sync-keys'

export async function backfillRescueLWW(
  db: NeuronsDB,
  bundleMeta: Record<string, unknown>,
  // `cloudPlanWins` is set ONLY for the first pull after an anonymous → authed
  // adoption (marker was null → 'proceed-and-write'). See the adoption block.
  opts?: { cloudPlanWins?: boolean },
): Promise<{ updated: number }> {
  let updated = 0
  const planKeys: string[] = []
  const confKeys: string[] = []
  const ovrKeys: string[] = []
  for (const key of Object.keys(bundleMeta)) {
    if (key.startsWith(RESCUE_PLAN_KEY_PREFIX)) {
      // Per-family plan keys are always synced (the matcher admits them); the
      // legacy `rescue:v1:plan` has no trailing family segment so it is NOT
      // captured here — it is handled separately as `legacyRaw` below.
      planKeys.push(key)
    } else if (key.startsWith(RESCUE_CONF_KEY_PREFIX)) {
      if (isSyncedRescueKey(key)) confKeys.push(key)
    } else if (key.startsWith(RESCUE_OVR_KEY_PREFIX)) {
      if (isSyncedRescueKey(key)) ovrKeys.push(key)
    }
  }
  // Legacy single cloud key (matcher rejects → the generic apply skipped it):
  // migrate it into its per-family key here (bypassing the matcher).
  const legacyRaw = typeof bundleMeta[RESCUE_PLAN_KEY] === 'string' ? (bundleMeta[RESCUE_PLAN_KEY] as string) : null

  if (planKeys.length === 0 && confKeys.length === 0 && ovrKeys.length === 0 && legacyRaw === null) {
    return { updated }
  }

  // The cloud carries EXISTING rescue state iff it has any per-family plan key or
  // the legacy single key. On an adoption pull with existing state we run a
  // per-family SET decision; a brand-new account (no rescue key at all) falls
  // through to normal LWW so anonymous plans carry over. (add-neurons-multi-subject-rescue D3)
  const cloudHasAnyRescuePlan = planKeys.length > 0 || legacyRaw !== null
  const adoptionSetWins = opts?.cloudPlanWins === true && cloudHasAnyRescuePlan

  await db.transaction('rw', db.meta, async () => {
    // Drop a malformed final stored envelope so the reader regenerates cleanly.
    const validateFinal = async (key: string): Promise<void> => {
      const finalRow = await db.meta.get(key)
      if (finalRow !== undefined && !isValidPlanEnvelopeRaw(finalRow.value)) {
        await db.meta.delete(key)
        updated++
      }
    }

    if (adoptionSetWins) {
      // ── Adoption SET-wins: the account's cloud rescue state is authoritative. ──
      const cloudFamilies = new Set<string>()

      // For each per-family cloud key, the cloud envelope wins VERBATIM (active
      // OR explicit-null) regardless of the anonymous local `updatedAt` — no
      // resurrection of an abandoned account plan, no anonymous clobber.
      for (const key of planKeys) {
        const incomingRaw = bundleMeta[key]
        if (typeof incomingRaw !== 'string') continue
        const familyId = key.slice(RESCUE_PLAN_KEY_PREFIX.length)
        // Mark the family cloud-covered ONLY once its value is a valid envelope —
        // a malformed cloud value must NOT shield an anonymous-only local plan
        // from the drop below (Codex/Fable review fix 4). A malformed cloud key
        // is treated as "no real cloud plan for this family".
        if (isValidPlanEnvelopeRaw(incomingRaw)) {
          cloudFamilies.add(familyId)
          const localRow = await db.meta.get(key)
          if (incomingRaw !== localRow?.value) {
            await db.meta.put({ key, value: incomingRaw })
            updated++
          }
        }
        await validateFinal(key)
      }

      // Legacy single cloud key → its per-family key (cloud wins verbatim). A
      // legacy explicit-null carries no familyId, so it cannot be mapped to a
      // family and is simply discarded.
      if (legacyRaw !== null) {
        const env = parsePlanEnvelope(legacyRaw)
        if (env?.plan && typeof env.plan.familyId === 'string') {
          const famKey = rescuePlanKey(env.plan.familyId)
          cloudFamilies.add(env.plan.familyId)
          const localRow = await db.meta.get(famKey)
          if (legacyRaw !== localRow?.value) {
            await db.meta.put({ key: famKey, value: legacyRaw })
            updated++
          }
          await validateFinal(famKey)
        }
      }

      // Drop anonymous-ONLY local families (cloud has no key for them): anonymous
      // play must not leak a subject into an account that already has its own
      // rescue state. Only an ACTIVE anon plan is dropped; a local null is
      // already clear.
      const localPlanRows = await db.meta.where('key').startsWith(RESCUE_PLAN_KEY_PREFIX).toArray()
      for (const row of localPlanRows) {
        const familyId = row.key.slice(RESCUE_PLAN_KEY_PREFIX.length)
        if (cloudFamilies.has(familyId)) continue
        const env = parsePlanEnvelope(row.value)
        if (env?.plan) {
          await db.meta.delete(row.key)
          updated++
        }
      }
    } else {
      // ── Normal per-family LWW (brand-new adoption AND every subsequent pull). ──
      for (const key of planKeys) {
        const incomingRaw = bundleMeta[key]
        if (typeof incomingRaw === 'string') {
          const localRow = await db.meta.get(key)
          const next = pickPlanEnvelopeLWW(localRow?.value, incomingRaw)
          if (next !== null && next !== localRow?.value) {
            await db.meta.put({ key, value: next })
            updated++
          }
        }
        await validateFinal(key)
      }

      // Cloud legacy migration (design D9 step 2): the matcher no longer admits
      // the legacy single key, so read it from the RAW bundle and merge it into
      // its per-family key via LWW — otherwise a fresh v28 device signing into an
      // account with a pre-multi cloud plan would silently lose it.
      if (legacyRaw !== null) {
        const env = parsePlanEnvelope(legacyRaw)
        if (env?.plan && typeof env.plan.familyId === 'string') {
          const famKey = rescuePlanKey(env.plan.familyId)
          const localRow = await db.meta.get(famKey)
          const next = pickPlanEnvelopeLWW(localRow?.value, legacyRaw)
          if (next !== null && next !== localRow?.value) {
            await db.meta.put({ key: famKey, value: next })
            updated++
          }
          await validateFinal(famKey)
        }
      }
    }

    // Confidence / override per-key LWW (identical in both paths; the run scope
    // keys anonymous records under a different createdAt/family so they can never
    // clobber an adopted cloud run — they simply age out of the window).
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
