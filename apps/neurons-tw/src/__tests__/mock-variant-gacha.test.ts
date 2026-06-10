import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { initialGachaStats, type GachaStats } from '@study-rpg/core'
import { MOCK_PITY_AT_ROLLS } from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import { NEURONS_ADAPTERS } from '../lib/sync/tables'
import {
  buildMockGachaConfig,
  rollMockVariant,
  submitMockVariantRoll,
  canRollPaperToday,
} from '../lib/services/mock-variant-gacha'

/** Deterministic LCG so distribution/pity assertions are reproducible. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const isRare = (rarity: string): boolean => rarity === 'P0' || rarity === 'P1' || rarity === 'P2'

function countRares(score: number, n: number, rng: () => number): number {
  let stats: GachaStats = initialGachaStats(buildMockGachaConfig(score))
  let rares = 0
  for (let i = 0; i < n; i += 1) {
    const r = rollMockVariant(score, stats, rng)
    stats = r.newStats
    if (isRare(r.rarity)) rares += 1
  }
  return rares
}

describe('mock-variant gacha — pure roll', () => {
  it('higher score band yields not-fewer rares (score weighting is monotonic)', () => {
    const N = 4000
    const failRares = countRares(50, N, seededRng(12345))
    const excellentRares = countRares(95, N, seededRng(12345))
    expect(excellentRares).toBeGreaterThan(failRares)
  })

  it('pity forces a rare (>= P2) after a dry streak', () => {
    // Hand-construct stats sitting exactly at the pity threshold for P2.
    const stats: GachaStats = { totalRolls: MOCK_PITY_AT_ROLLS, rollsSinceLast: { P2: MOCK_PITY_AT_ROLLS } }
    const r = rollMockVariant(50, stats, seededRng(7))
    expect(r.wasPity).toBe(true)
    expect(isRare(r.rarity)).toBe(true)
  })

  it('always resolves to a catalog variant of the rolled rarity', () => {
    const rng = seededRng(99)
    let stats = initialGachaStats(buildMockGachaConfig(80))
    for (let i = 0; i < 50; i += 1) {
      const r = rollMockVariant(80, stats, rng)
      stats = r.newStats
      expect(typeof r.variantId).toBe('string')
      expect(r.variantId.length).toBeGreaterThan(0)
    }
  })
})

describe('mock-variant gacha — persistence + daily cap', () => {
  beforeEach(async () => {
    await Dexie.delete('neurons-rpg')
    await db.open()
  })
  afterEach(async () => {
    db.close()
    await Dexie.delete('neurons-rpg')
  })

  it('submit persists a row and returns isNew; same paper same day caps the second roll', async () => {
    const first = await submitMockVariantRoll('114-1-醫學一', 90, seededRng(1), 1000)
    expect(first).not.toBeNull()
    expect(first?.isNew).toBe(true)
    expect(await db.mockExamVariants.count()).toBe(1)

    // Same paper, same local day → capped (no roll), exam still "happened".
    const second = await submitMockVariantRoll('114-1-醫學一', 90, seededRng(2), 2000)
    expect(second).toBeNull()
    expect(await db.mockExamVariants.count()).toBe(1)
    expect(await canRollPaperToday('114-1-醫學一')).toBe(false)

    // A DIFFERENT paper is still rollable the same day.
    const other = await submitMockVariantRoll('114-1-醫學二', 90, seededRng(3), 3000)
    expect(other).not.toBeNull()
  })

  it('a new local day re-opens the roll for that paper', async () => {
    await submitMockVariantRoll('114-1-醫學一', 70, seededRng(1), 1000)
    expect(await canRollPaperToday('114-1-醫學一')).toBe(false)

    // Simulate yesterday's stamp by rewriting the local daily-cap marker.
    await db.meta.put({ key: 'mockVariantRollDates', value: JSON.stringify({ '114-1-醫學一': '2000-01-01' }) })
    expect(await canRollPaperToday('114-1-醫學一')).toBe(true)

    const again = await submitMockVariantRoll('114-1-醫學一', 70, seededRng(5), 4000)
    expect(again).not.toBeNull()
  })

  it('a duplicate roll increments copies, not row count', async () => {
    // Force the same variant by pre-seeding a row, then roll it again via the adapter-free path:
    await db.mockExamVariants.put({
      variantId: 'cortical-pyramidal',
      rarity: 'P5',
      displayName: '皮質錐體細胞',
      spriteKey: 'mock-variant:cortical-pyramidal',
      copies: 1,
      firstRolledAt: 100,
      lastRolledAt: 100,
    })
    // Drive a roll that lands on a P5 (low score → P5-heavy); loop until it dupes an existing one.
    let saw = false
    for (let i = 0; i < 40 && !saw; i += 1) {
      await db.meta.put({ key: 'mockVariantRollDates', value: JSON.stringify({}) }) // re-open cap
      const r = await submitMockVariantRoll('p', 10, seededRng(1000 + i), 5000 + i)
      if (r && !r.isNew) saw = true
    }
    expect(saw).toBe(true)
    const total = await db.mockExamVariants.count()
    // At least one row has copies > 1 (a dupe was merged, not appended).
    const rows = await db.mockExamVariants.toArray()
    expect(rows.some((x) => x.copies > 1)).toBe(true)
    expect(total).toBeLessThanOrEqual(13) // never exceeds the catalog size
  })
})

describe('mock-variant gacha — R2 adapter idempotency', () => {
  beforeEach(async () => {
    await Dexie.delete('neurons-rpg')
    await db.open()
  })
  afterEach(async () => {
    db.close()
    await Dexie.delete('neurons-rpg')
  })

  it('re-applying the same snapshot does not double-count copies', async () => {
    const adapter = NEURONS_ADAPTERS.find((a) => a.name === 'mockExamVariants')!
    expect(adapter).toBeDefined()

    await db.mockExamVariants.put({
      variantId: 'vta-dopamine',
      rarity: 'P2',
      displayName: '腹側被蓋區多巴胺神經元',
      spriteKey: 'mock-variant:vta-dopamine',
      copies: 3,
      firstRolledAt: 100,
      lastRolledAt: 200,
    })
    const snap = await adapter.snapshot(db)

    // Apply the SAME snapshot twice into a wiped table.
    await db.mockExamVariants.clear()
    await adapter.apply(db, snap)
    await adapter.apply(db, snap)

    const row = await db.mockExamVariants.get('vta-dopamine')
    expect(row?.copies).toBe(3) // MAX-merge idempotent — NOT 6
    expect(await db.mockExamVariants.count()).toBe(1)
  })

  it('merge keeps the higher copies (monotonic-max) and never un-collects', async () => {
    const adapter = NEURONS_ADAPTERS.find((a) => a.name === 'mockExamVariants')!
    await db.mockExamVariants.put({
      variantId: 'mtl-concept-cell',
      rarity: 'P0',
      displayName: '內側顳葉概念細胞',
      spriteKey: 'mock-variant:mtl-concept-cell',
      copies: 5,
      firstRolledAt: 50,
      lastRolledAt: 500,
    })
    // Incoming has FEWER copies + earlier first + later last.
    await adapter.apply(db, [
      {
        variantId: 'mtl-concept-cell',
        rarity: 'P0',
        displayName: '內側顳葉概念細胞',
        spriteKey: 'mock-variant:mtl-concept-cell',
        copies: 2,
        firstRolledAt: 10,
        lastRolledAt: 900,
      },
    ])
    const row = await db.mockExamVariants.get('mtl-concept-cell')
    expect(row?.copies).toBe(5) // MAX(5,2)
    expect(row?.firstRolledAt).toBe(10) // MIN(50,10)
    expect(row?.lastRolledAt).toBe(900) // MAX(500,900)
  })
})
