import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { MILESTONE_STREAK_THRESHOLD } from '@study-rpg/content-neurons-tw'
import { db, type NeuronVariantRow } from '../lib/db'
import { handleSlotUnlock } from '../lib/services/variant-gacha'
import { variantBirthCaption } from '../lib/variant-caption'
import {
  buildBundleSnapshot,
  applyBundleSnapshot,
  validateBundleMeta,
  SCHEMA_VERSION,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'

/**
 * add-neurons-variant-provenance §6 tests.
 *
 * Covers: provenance capture at mint (full / 救贖 / 里程碑 / plain), the
 * synthetic-backfill 元老 path (absence = marker), the pure caption helper, and
 * R2 cross-version round-trip (provenance-less bundle applies → 元老; a
 * provenance-bearing row survives build → clear → apply, preserved in whole-row
 * JSON). Mirrors the DMN v1↔v2 forward-compat discipline.
 */

const resolve = (id: string): string => id

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function seedStreak(n: number): Promise<void> {
  await db.meta.put({ key: 'currentQuizCorrectStreak', value: String(n) })
}

describe('provenance capture at mint', () => {
  it('stamps full provenance; streak below threshold → not 里程碑', async () => {
    await seedStreak(3)
    await handleSlotUnlock(
      { familyId: '藥理學', slotIndex: 1, apAtUnlock: 10, wasRedemption: false },
      resolve,
      { silent: true },
    )
    const row = await db.neuronVariants.get(['藥理學', 1])
    expect(row?.provenance).toBeDefined()
    expect(row?.provenance?.apAtUnlock).toBe(10)
    expect(row?.provenance?.wasRedemption).toBe(false)
    expect(row?.provenance?.streakAtMint).toBe(3)
    expect(row?.provenance?.bornAtISO).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // 3 < 7 → no 連續 prefix in the caption
    expect(variantBirthCaption(row as NeuronVariantRow)).not.toContain('連續')
  })

  it('sets wasRedemption when the triggering question was everWrong', async () => {
    await seedStreak(1)
    await handleSlotUnlock(
      { familyId: '免疫學', slotIndex: 2, apAtUnlock: 30, wasRedemption: true },
      resolve,
      { silent: true },
    )
    const row = await db.neuronVariants.get(['免疫學', 2])
    expect(row?.provenance?.wasRedemption).toBe(true)
    expect(variantBirthCaption(row as NeuronVariantRow)).toContain('攻下一題曾錯的免疫學')
  })

  it('flags 里程碑 when streakAtMint >= MILESTONE_STREAK_THRESHOLD', async () => {
    await seedStreak(MILESTONE_STREAK_THRESHOLD)
    await handleSlotUnlock(
      { familyId: '生理學', slotIndex: 3, apAtUnlock: 80, wasRedemption: false },
      resolve,
      { silent: true },
    )
    const row = await db.neuronVariants.get(['生理學', 3])
    expect(row?.provenance?.streakAtMint).toBe(MILESTONE_STREAK_THRESHOLD)
    expect(variantBirthCaption(row as NeuronVariantRow)).toContain(
      `連續 ${MILESTONE_STREAK_THRESHOLD} 天`,
    )
  })

  it('does NOT stamp provenance for synthetic backfill (apAtUnlock = -1) → 元老', async () => {
    await seedStreak(5)
    await handleSlotUnlock(
      { familyId: '解剖學', slotIndex: 1, apAtUnlock: -1, wasRedemption: false },
      resolve,
      { silent: true },
    )
    const row = await db.neuronVariants.get(['解剖學', 1])
    expect(row).toBeDefined()
    expect(row?.provenance).toBeUndefined()
    expect(variantBirthCaption(row as NeuronVariantRow)).toContain('傳承個體')
  })
})

describe('元老 detection (no provenance)', () => {
  it('renders 元老 caption from rolledAt + familyId; helper performs no write', async () => {
    const legacyRow: NeuronVariantRow = {
      familyId: '藥理學',
      slotIndex: 5,
      rarity: 'P2',
      displayName: '報酬迴路之王 · 共振核心',
      spriteKey: 'variant:藥理學:5',
      rolledAt: Date.parse('2026-05-25T08:00:00Z'),
      wasPityFloor: true,
      // provenance intentionally absent (pre-upgrade row)
    }
    await db.neuronVariants.put(legacyRow)
    const caption = variantBirthCaption(legacyRow)
    expect(caption).toMatch(/^\d{4}-\d{2}-\d{2} · 藥理學 · 傳承個體$/)
    // Pure helper does not write — the stored row stays provenance-less.
    const stored = await db.neuronVariants.get(['藥理學', 5])
    expect(stored?.provenance).toBeUndefined()
  })
})

describe('birth caption composition', () => {
  it('combines 里程碑 + 救贖 inline on one line', () => {
    const row: NeuronVariantRow = {
      familyId: '免疫學',
      slotIndex: 4,
      rarity: 'P1',
      displayName: '抗體風暴老兵 · 神經元始祖',
      spriteKey: 'variant:免疫學:4',
      rolledAt: 1_700_000_000_000,
      wasPityFloor: false,
      provenance: { bornAtISO: '2026-06-01', apAtUnlock: 200, wasRedemption: true, streakAtMint: 9 },
    }
    expect(variantBirthCaption(row)).toBe('2026-06-01 · 連續 9 天 · 攻下一題曾錯的免疫學時放電誕生')
  })

  it('standard caption shows date + 答對 N 題 + subject', () => {
    const row: NeuronVariantRow = {
      familyId: '藥理學',
      slotIndex: 1,
      rarity: 'P4',
      displayName: '初代代謝師 · 漂移末梢',
      spriteKey: 'variant:藥理學:1',
      rolledAt: 1_700_000_000_000,
      wasPityFloor: false,
      provenance: { bornAtISO: '2026-06-01', apAtUnlock: 10, wasRedemption: false, streakAtMint: 3 },
    }
    expect(variantBirthCaption(row)).toBe('2026-06-01 · 答對 10 題藥理學時放電誕生')
  })
})

describe('R2 cross-version round-trip (provenance)', () => {
  it('applies a provenance-less bundle (older shape) → rows render as 元老, no error', async () => {
    const olderBundle: BundleSnapshot = {
      meta: {
        schema_version: 6,
        updated_at: '2026-06-01T00:00:00Z',
        client_id: 'v6-client',
        app_version: '0.4.0',
      },
      data: {
        synapses: [],
        familyAccrual: [],
        familyMastery: [],
        neuronVariants: [
          {
            familyId: '藥理學',
            slotIndex: 1,
            rarity: 'P3',
            displayName: '初代代謝師 · 穩態突觸',
            spriteKey: 'variant:藥理學:1',
            rolledAt: 1_700_000_000_000,
            wasPityFloor: false,
            // provenance intentionally absent (v6 shape)
          },
        ],
        achievements: [],
        leaderboardProfile: [],
        meta: [],
        dmnCards: [],
        dmnEventLog: [],
        dmnActiveBuffs: [],
        questionBookmarks: [],
        questionBookmarkTombstones: [],
        questionFlags: [],
        questionHistory: [],
      },
    }
    expect(() => validateBundleMeta(olderBundle)).not.toThrow()
    await applyBundleSnapshot(db, olderBundle)
    const row = await db.neuronVariants.get(['藥理學', 1])
    expect(row?.provenance).toBeUndefined()
    expect(variantBirthCaption(row as NeuronVariantRow)).toContain('傳承個體')
  })

  it('preserves provenance across a build → clear → apply round-trip', async () => {
    await db.neuronVariants.put({
      familyId: '免疫學',
      slotIndex: 3,
      rarity: 'P2',
      displayName: '圍城衛兵 · 共振核心',
      spriteKey: 'variant:免疫學:3',
      rolledAt: 1_700_000_000_000,
      wasPityFloor: false,
      provenance: { bornAtISO: '2026-06-01', apAtUnlock: 80, wasRedemption: true, streakAtMint: 9 },
    })
    const bundle = await buildBundleSnapshot(db)
    expect(bundle.meta.schema_version).toBe(SCHEMA_VERSION)

    await db.delete()
    await db.open()
    expect(await db.neuronVariants.count()).toBe(0)

    await applyBundleSnapshot(db, bundle)
    const restored = await db.neuronVariants.get(['免疫學', 3])
    expect(restored?.provenance).toEqual({
      bornAtISO: '2026-06-01',
      apAtUnlock: 80,
      wasRedemption: true,
      streakAtMint: 9,
    })
  })
})
