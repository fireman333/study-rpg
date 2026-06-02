import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { NEURONS_ADAPTERS } from '../lib/sync/tables'

/**
 * Collection 2.0 sync carve-outs:
 *   - neuronVariants: identity + content immutable, `copies` MAX-merge, earliest
 *     rolledAt (NOT first-write-wins, NOT LWW).
 *   - familyAccrual: `pullCount` MAX-merge alongside `ap`.
 */

const variantAdapter = NEURONS_ADAPTERS.find((a) => a.name === 'neuronVariants')!
const accrualAdapter = NEURONS_ADAPTERS.find((a) => a.name === 'familyAccrual')!

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('neuronVariants copies MAX-merge', () => {
  it('keeps the higher copies count + earliest rolledAt on conflict', async () => {
    await db.neuronVariants.put({
      familyId: '藥理學',
      slotIndex: 1,
      rarity: 'P5',
      displayName: 'local',
      spriteKey: 'variant:藥理學:1',
      rolledAt: 1000,
      wasPityFloor: false,
      copies: 3,
    })
    // Incoming has fewer copies + later rolledAt + different (ignored) content.
    await variantAdapter.apply(db, [
      {
        familyId: '藥理學',
        slotIndex: 1,
        rarity: 'P5',
        displayName: 'incoming',
        spriteKey: 'variant:藥理學:1',
        rolledAt: 2000,
        wasPityFloor: false,
        copies: 1,
      },
    ])
    const row = await db.neuronVariants.get(['藥理學', 1])
    expect(row?.copies).toBe(3) // MAX, not overwritten down
    expect(row?.rolledAt).toBe(1000) // earliest
    expect(row?.displayName).toBe('local') // content immutable
  })

  it('raises copies when incoming has more', async () => {
    await db.neuronVariants.put({
      familyId: '解剖學',
      slotIndex: 2,
      rarity: 'P4',
      displayName: 'local',
      spriteKey: 'variant:解剖學:2',
      rolledAt: 1000,
      wasPityFloor: false,
      copies: 1,
    })
    await variantAdapter.apply(db, [
      {
        familyId: '解剖學',
        slotIndex: 2,
        rarity: 'P4',
        displayName: 'incoming',
        spriteKey: 'variant:解剖學:2',
        rolledAt: 1000,
        wasPityFloor: false,
        copies: 5,
      },
    ])
    const row = await db.neuronVariants.get(['解剖學', 2])
    expect(row?.copies).toBe(5)
  })

  it('inserts an unseen variant unchanged', async () => {
    await variantAdapter.apply(db, [
      {
        familyId: '生理學',
        slotIndex: 0,
        rarity: 'P0',
        displayName: 'apex',
        spriteKey: 'variant:生理學:0',
        rolledAt: 1234,
        wasPityFloor: true,
        copies: 1,
      },
    ])
    const row = await db.neuronVariants.get(['生理學', 0])
    expect(row?.rarity).toBe('P0')
    expect(row?.wasPityFloor).toBe(true)
  })
})

describe('familyAccrual pullCount MAX-merge', () => {
  it('MAX-merges pullCount even when incoming AP is lower (local non-counter fields kept)', async () => {
    await db.familyAccrual.put({
      familyId: '藥理學',
      ap: 50,
      firedToday: true,
      lastFireDate: '2026-06-01',
      unlockedSlots: [],
      sameDayCorrect: 0,
      pullCount: 10,
    })
    await accrualAdapter.apply(db, [
      {
        familyId: '藥理學',
        ap: 20, // lower → local non-counter fields win
        firedToday: false,
        lastFireDate: '2026-05-01',
        unlockedSlots: [],
        sameDayCorrect: 0,
        pullCount: 25, // higher → MAX wins
      },
    ])
    const acc = await db.familyAccrual.get('藥理學')
    expect(acc?.ap).toBe(50) // local kept (higher AP)
    expect(acc?.pullCount).toBe(25) // MAX-merged independently
  })

  it('takes the higher-AP row for non-counter fields but still MAX-merges pullCount', async () => {
    await db.familyAccrual.put({
      familyId: '解剖學',
      ap: 10,
      firedToday: false,
      lastFireDate: null,
      unlockedSlots: [],
      sameDayCorrect: 0,
      pullCount: 30,
    })
    await accrualAdapter.apply(db, [
      {
        familyId: '解剖學',
        ap: 99, // higher → incoming non-counter fields win
        firedToday: true,
        lastFireDate: '2026-06-02',
        unlockedSlots: [],
        sameDayCorrect: 3,
        pullCount: 5, // lower → local MAX kept
      },
    ])
    const acc = await db.familyAccrual.get('解剖學')
    expect(acc?.ap).toBe(99)
    expect(acc?.pullCount).toBe(30) // MAX(30, 5)
  })
})
