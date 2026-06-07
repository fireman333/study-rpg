/**
 * Per-family first-pull (add-neurons-first-pull-path-rep) — replaces the 4-branch
 * 舊制度 ritual. The first time the player answers a family (correct OR incorrect),
 * grant one free guaranteed-P5 variant for that family, minted SILENTLY via the
 * existing gacha, and set it as that family's **path representative** (the neuron
 * shown at the family's maze tract walker head). Recorded once per family in the
 * synced `firstPullFamilies` meta set (monotonic UNION merge → a fresh device
 * never re-grants).
 *
 * Cycle note: `connectome.ts` DYNAMIC-imports this module post-commit. This module
 * statically imports `variant-gacha` (→ connectome), so a static import the other
 * way would cycle; the dynamic import in connectome breaks it.
 *
 * Capability spec: openspec/specs/neuron-path-representative/spec.md
 */

import { db } from '../db'
import { pullVariant } from './variant-gacha'
import { setRepresentative } from './representatives'

/** Synced meta key: JSON array of familyIds already first-pulled (monotonic-union merge). */
export const FIRST_PULL_FAMILIES_KEY = 'firstPullFamilies'

function parseFamilySet(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  try {
    const arr = JSON.parse(raw) as unknown
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch (err) {
    console.warn('[first-pull] failed to parse firstPullFamilies:', err)
  }
  return new Set()
}

/** The set of familyIds that already received their first-pull. */
export async function firstPulledFamilies(): Promise<Set<string>> {
  return parseFamilySet((await db.meta.get(FIRST_PULL_FAMILIES_KEY))?.value)
}

/** Record a family's first-pull (monotonic add; never removes). */
export async function recordFirstPull(familyId: string): Promise<void> {
  const set = await firstPulledFamilies()
  if (set.has(familyId)) return
  set.add(familyId)
  await db.meta.put({ key: FIRST_PULL_FAMILIES_KEY, value: JSON.stringify([...set]) })
}

/**
 * Pure UNION of two stored `firstPullFamilies` values — returns the value to
 * persist, or null when local already covers incoming (nothing to do). Exported
 * for the onPullComplete backfill post-pass: the generic meta adapter is
 * first-write-wins, but a growing set needs union so the first-pull stays
 * one-time across all devices (mirrors the representatives LWW post-pass).
 */
export function unionFirstPullFamilies(
  localRaw: string | undefined,
  incomingRaw: string | undefined,
): string | null {
  if (incomingRaw === undefined) return null
  const local = parseFamilySet(localRaw)
  const incoming = parseFamilySet(incomingRaw)
  let changed = false
  for (const f of incoming) {
    if (!local.has(f)) {
      local.add(f)
      changed = true
    }
  }
  return changed ? JSON.stringify([...local]) : null
}

/**
 * Grant a family's first-pull if it hasn't been granted yet: mint one
 * guaranteed-P5 silently via the gacha, set it as the family's representative,
 * and record the first-pull. Idempotent on the family set. Returns true when a
 * grant happened. Callers run this best-effort post-commit (channel `[first-pull]`).
 */
export async function grantFirstPullIfNeeded(
  familyId: string,
  resolveFamilyDisplayName: (id: string) => string,
): Promise<boolean> {
  const set = await firstPulledFamilies()
  if (set.has(familyId)) return false

  const result = await pullVariant(familyId, resolveFamilyDisplayName, {
    silent: true,
    forceRarity: 'P5',
    firstPull: true,
  })
  if (!result.ok || !result.variant) return false

  // The freshly-minted P5 becomes the family's path representative (default until
  // the player re-selects on the collection page). setRepresentative guards on
  // collected, which the mint above just satisfied.
  await setRepresentative(familyId, result.variant.slotIndex)
  await recordFirstPull(familyId)
  return true
}

/* DEV-only debug handle for manual smoke (mirrors __variantGacha / __maze). */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __firstPull?: unknown }).__firstPull = {
    families: firstPulledFamilies,
    grant: (familyId: string) => grantFirstPullIfNeeded(familyId, (id) => id),
    /** Re-arm first-pull for all families (clears the set; does NOT clear collection). */
    reset: async () => {
      await db.meta.delete(FIRST_PULL_FAMILIES_KEY)
      console.warn('[first-pull] DEV: cleared firstPullFamilies')
    },
  }
}
