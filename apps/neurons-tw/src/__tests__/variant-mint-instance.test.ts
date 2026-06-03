import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { mintVariantSlot, pullVariant } from '../lib/services/variant-gacha'
import { NEURON_VARIANT_CATALOG, PULL_COST } from '@study-rpg/content-neurons-tw'

/**
 * Regression-lock the foundational invariant (add-neurons-dupe-fusion R1): EVERY
 * mint — new OR dupe, via `mintVariantSlot` (deterministic) or `pullVariant` —
 * writes one held `neuronInstances` row with its own birth context, while the
 * slot's `copies` stays a monotonic lifetime-mint count. (Previously only
 * end-to-end smoke-verified; this locks it against pull-path refactors.)
 */

const DEF = NEURON_VARIANT_CATALOG[0]

beforeEach(async () => {
  await db.neuronInstances.clear()
  await db.neuronVariants.clear()
  await db.familyAccrual.clear()
  await db.meta.clear()
})
afterEach(async () => {
  await db.neuronInstances.clear()
  await db.neuronVariants.clear()
  await db.familyAccrual.clear()
  await db.meta.clear()
})

describe('every mint writes an individual', () => {
  it('mintVariantSlot ×2 on one slot → 2 individuals + copies=2', async () => {
    const r1 = await mintVariantSlot(DEF.familyId, DEF.slotIndex, (f) => f)
    expect(r1.ok).toBe(true)
    expect(r1.isDupe).toBe(false)

    const r2 = await mintVariantSlot(DEF.familyId, DEF.slotIndex, (f) => f)
    expect(r2.ok).toBe(true)
    expect(r2.isDupe).toBe(true) // same slot again → dupe individual

    const insts = (await db.neuronInstances.where('familyId').equals(DEF.familyId).toArray()).filter(
      (i) => i.slotIndex === DEF.slotIndex && i.consumedAt === null,
    )
    expect(insts).toHaveLength(2) // dupe minted a SECOND individual, not copies++ only
    // Each individual is distinct (own id) and carries its own provenance.
    expect(new Set(insts.map((i) => i.instanceId)).size).toBe(2)
    expect(insts.every((i) => i.provenance != null)).toBe(true)

    // Slot row keeps copies as the lifetime-mint count.
    const slot = await db.neuronVariants.get([DEF.familyId, DEF.slotIndex])
    expect((slot as { copies: number }).copies).toBe(2)
  })

  it('pullVariant mints exactly one individual per pull', async () => {
    // Seed the family accrual row (pullVariant requires it) + enough energy.
    await db.familyAccrual.put({
      familyId: DEF.familyId,
      ap: 0,
      firedToday: false,
      lastFireDate: null,
      unlockedSlots: [],
      sameDayCorrect: 0,
      pullCount: 0,
    })
    await db.meta.put({ key: 'neuralEnergyEarned', value: String(PULL_COST * 2) })
    await db.meta.put({ key: 'neuralEnergySpent', value: '0' })

    const before = await db.neuronInstances.count()
    const res = await pullVariant(DEF.familyId, (f) => f)
    expect(res.ok).toBe(true)
    expect(await db.neuronInstances.count()).toBe(before + 1) // one new individual

    const held = (await db.neuronInstances.toArray()).filter((i) => i.consumedAt === null)
    expect(held).toHaveLength(1)
    expect(held[0].familyId).toBe(DEF.familyId)
    expect(held[0].provenance).toBeTruthy()
  })
})
