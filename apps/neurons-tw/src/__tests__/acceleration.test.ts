import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { FAMILY_BUFF_ENERGY_MULT } from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import {
  energyAccel,
  speedAccel,
  ENERGY_ACCEL_CAP,
  SPEED_ACCEL_CAP,
} from '../lib/services/acceleration'

/**
 * add-neurons-acceleration-system §8.2 — the additive `1 + Σ` energy/speed pools,
 * hard-capped, composed from active consumable buffs + owned equipment.
 */

const FAMILY = '藥理學'
const OTHER = '解剖學'
const HOUR = 60 * 60 * 1000

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function addBuff(
  buffKind: 'family-buff' | 'surge' | 'bolus' | 'variant-rate-up',
  familyId: string | null,
  expiresAt: number,
): Promise<void> {
  await db.dmnActiveBuffs.add({ buffKind, familyId, expiresAt, payload: null, sourceCardId: 't' })
}

async function own(equipmentId: string, rarity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'): Promise<void> {
  await db.equipment.put({ equipmentId, rarity, obtainedAt: 1, updatedAt: 1 })
}

describe('energyAccel', () => {
  it('is 1.0 with nothing active or owned', async () => {
    expect(await energyAccel(FAMILY)).toBe(1)
    expect(await energyAccel(null)).toBe(1)
  })

  it('family-buff folds to +1.0 ⇒ 2.0× (equivalent to the legacy ×FAMILY_BUFF_ENERGY_MULT)', async () => {
    await addBuff('family-buff', FAMILY, Date.now() + HOUR)
    expect(await energyAccel(FAMILY)).toBeCloseTo(1 + 1.0, 5)
    expect(1 + 1.0).toBe(FAMILY_BUFF_ENERGY_MULT) // 2 — the equivalence guard
  })

  it('family-buff is family-scoped (no effect on a different family)', async () => {
    await addBuff('family-buff', FAMILY, Date.now() + HOUR)
    expect(await energyAccel(OTHER)).toBe(1)
  })

  it('bolus is global (+0.5) and stacks with owned energy equipment', async () => {
    await addBuff('bolus', null, Date.now() + HOUR)
    await own('eq-mitochondrial-powerhouse-p1', 'P1') // energy +0.30
    expect(await energyAccel(OTHER)).toBeCloseTo(1 + 0.5 + 0.3, 5)
  })

  it('ignores an expired buff', async () => {
    await addBuff('bolus', null, Date.now() - 1000)
    expect(await energyAccel(null)).toBe(1)
  })

  it('clamps at ENERGY_ACCEL_CAP', async () => {
    await addBuff('family-buff', FAMILY, Date.now() + HOUR) // +1.0
    await addBuff('bolus', null, Date.now() + HOUR) // +0.5
    await own('eq-mitochondrial-powerhouse-p1', 'P1') // +0.30
    await own('eq-sodium-potassium-pump-p2', 'P2') // +0.18  → raw 2.98
    expect(await energyAccel(FAMILY)).toBe(ENERGY_ACCEL_CAP)
  })

  it('speed-lane equipment does NOT feed the energy pool', async () => {
    await own('eq-fully-myelinated-axon-p1', 'P1') // speed lane
    expect(await energyAccel(null)).toBe(1)
  })
})

describe('speedAccel', () => {
  it('is 1.0 with nothing active or owned', async () => {
    expect(await speedAccel()).toBe(1)
  })

  it('surge (+0.5) stacks with owned speed equipment', async () => {
    await addBuff('surge', null, Date.now() + HOUR)
    await own('eq-fully-myelinated-axon-p1', 'P1') // speed +0.30
    expect(await speedAccel()).toBeCloseTo(1 + 0.5 + 0.3, 5)
  })

  it('clamps at SPEED_ACCEL_CAP', async () => {
    await addBuff('surge', null, Date.now() + HOUR) // +0.5
    await own('eq-fully-myelinated-axon-p1', 'P1') // +0.30
    await own('eq-saltatory-conduction-p2', 'P2') // +0.18
    await own('eq-oligodendrocyte-companion-p3', 'P3') // +0.10
    await own('eq-myelin-thickening-p3', 'P3') // +0.10  → raw 2.18
    expect(await speedAccel()).toBe(SPEED_ACCEL_CAP)
  })

  it('energy-lane equipment does NOT feed the speed pool', async () => {
    await own('eq-mitochondrial-powerhouse-p1', 'P1') // energy lane
    expect(await speedAccel()).toBe(1)
  })
})
