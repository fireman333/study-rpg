import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { DMN_CARD_CATALOG } from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import { drawDmnCard } from '../lib/services/dmn-fate-card'

/**
 * Verify draw mechanics: pool-removal + cap at 20.
 *
 * Rarity weight distribution is NOT tested here (would need 1000s of trials
 * and is sensitive to RNG seed); the catalog validator + manual roll-loop
 * inspection are sufficient acceptance for distribution.
 */

const META_KEY_DRAWS = 'dmnDrawsAvailable'

beforeEach(async () => {
  await db.delete()
  await db.open()
  // Seed families so dispatchFamilyBuff has something to pick from.
  await db.familyAccrual.bulkAdd(
    DMN_CARD_CATALOG.slice(0, 1).map(() => ({
      familyId: '藥理學',
      ap: 0,
      firedToday: false,
      lastFireDate: null,
      unlockedSlots: [],
      sameDayCorrect: 0,
      pullCount: 0,
    })),
  )
})

async function setDraws(n: number): Promise<void> {
  await db.meta.put({ key: META_KEY_DRAWS, value: String(n) })
}

describe('drawDmnCard', () => {
  it('returns null when draws available = 0', async () => {
    await setDraws(0)
    const result = await drawDmnCard()
    expect(result).toBeNull()
  })

  it('decrements drawsAvailable + inserts dmnCards row on success', async () => {
    await setDraws(3)
    const before = await db.dmnCards.count()
    expect(before).toBe(0)
    const result = await drawDmnCard()
    expect(result).not.toBeNull()
    const after = await db.dmnCards.count()
    expect(after).toBe(1)
    const remaining = (await db.meta.get(META_KEY_DRAWS))?.value
    expect(remaining).toBe('2')
  })

  it('never re-draws an already-owned card (pool-removal)', async () => {
    await setDraws(20)
    const drawnIds = new Set<string>()
    for (let i = 0; i < 20; i += 1) {
      const result = await drawDmnCard()
      expect(result).not.toBeNull()
      expect(drawnIds.has(result!.card.cardId)).toBe(false)
      drawnIds.add(result!.card.cardId)
    }
    expect(drawnIds.size).toBe(20)
    expect(await db.dmnCards.count()).toBe(20)
  })

  it('returns null when catalog complete (20/20 owned)', async () => {
    await setDraws(25) // more draws than cards
    for (let i = 0; i < 20; i += 1) {
      const r = await drawDmnCard()
      expect(r).not.toBeNull()
    }
    // 21st attempt — pool empty
    const overflow = await drawDmnCard()
    expect(overflow).toBeNull()
  })

  it('writes dmnEventLog row for each draw (idempotency log)', async () => {
    await setDraws(3)
    await drawDmnCard()
    await drawDmnCard()
    const logCount = await db.dmnEventLog.count()
    expect(logCount).toBe(2)
  })

  it('increments dmnLifetimeDrawsConsumed counter', async () => {
    await setDraws(3)
    await drawDmnCard()
    await drawDmnCard()
    const lifetime = (await db.meta.get('dmnLifetimeDrawsConsumed'))?.value
    expect(lifetime).toBe('2')
  })
})
