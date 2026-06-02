import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, type NeuronVariantRow, type VariantRarity } from '../lib/db'
import {
  pickBranchRepresentatives,
  buildCharacterCardPayload,
  CARD_BRANCH_ORDER,
  DEFAULT_CARD_NICKNAME,
  type CharacterCardPayload,
} from '../lib/services/character-card'
import { renderCharacterCard, type CardAssets } from '../lib/character-card-render'

const mkVariant = (
  familyId: string,
  slotIndex: number,
  rarity: VariantRarity,
  rolledAt = 0,
): NeuronVariantRow => ({
  familyId,
  slotIndex,
  rarity,
  displayName: `${familyId}-${slotIndex}`,
  spriteKey: `variant:${familyId}:${slotIndex}`,
  rolledAt,
  wasPityFloor: false,
})

describe('pickBranchRepresentatives (pure)', () => {
  it('returns one slot per branch in CARD_BRANCH_ORDER, null for empty branches', () => {
    const reps = pickBranchRepresentatives([mkVariant('藥理學', 1, 'P3')], {}, new Map())
    expect(reps).toHaveLength(CARD_BRANCH_ORDER.length)
    expect(reps[0]?.branch).toBe('DA')
    expect(reps[0]?.familyId).toBe('藥理學')
    // 5HT / GABA / Glu have no collected variant
    expect(reps[1]).toBeNull()
    expect(reps[2]).toBeNull()
    expect(reps[3]).toBeNull()
  })

  it('picks the highest-rarity variant when no representative is chosen', () => {
    const reps = pickBranchRepresentatives(
      [mkVariant('藥理學', 1, 'P3'), mkVariant('公共衛生學', 2, 'P1')],
      {},
      new Map(),
    )
    // DA branch: P1 (公共衛生學) beats P3 (藥理學)
    expect(reps[0]?.familyId).toBe('公共衛生學')
    expect(reps[0]?.rarity).toBe('P1')
  })

  it('prefers the player-chosen representative over a rarer one', () => {
    const reps = pickBranchRepresentatives(
      [mkVariant('藥理學', 1, 'P1'), mkVariant('公共衛生學', 2, 'P4')],
      { 公共衛生學: 2 },
      new Map(),
    )
    // chosen (公共衛生學 P4) wins despite 藥理學 being P1
    expect(reps[0]?.familyId).toBe('公共衛生學')
    expect(reps[0]?.slotIndex).toBe(2)
  })

  it('breaks rarity ties by higher family AP', () => {
    const reps = pickBranchRepresentatives(
      [mkVariant('寄生蟲學', 1, 'P2'), mkVariant('組織學', 1, 'P2')],
      {},
      new Map([
        ['寄生蟲學', 5],
        ['組織學', 50],
      ]),
    )
    // 5HT branch index 1
    expect(reps[1]?.familyId).toBe('組織學')
  })

  it('breaks rarity+AP ties by more recent rolledAt', () => {
    const reps = pickBranchRepresentatives(
      [mkVariant('生物化學', 1, 'P3', 100), mkVariant('病理學', 1, 'P3', 200)],
      {},
      new Map(),
    )
    // GABA branch index 2 — newer roll (病理學 @200) wins
    expect(reps[2]?.familyId).toBe('病理學')
  })
})

describe('buildCharacterCardPayload (Dexie-backed)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('aggregates counts/stats from local state and resolves reps + profile', async () => {
    await db.familyAccrual.bulkPut([
      { familyId: '藥理學', ap: 100, firedToday: false, lastFireDate: null, unlockedSlots: [], sameDayCorrect: 0, pullCount: 0 },
      { familyId: '解剖學', ap: 50, firedToday: false, lastFireDate: null, unlockedSlots: [], sameDayCorrect: 0, pullCount: 0 },
    ])
    await db.neuronVariants.bulkPut([
      mkVariant('藥理學', 1, 'P2'),
      mkVariant('藥理學', 2, 'P3'),
      mkVariant('藥理學', 3, 'P3'),
      mkVariant('藥理學', 4, 'P4'),
      mkVariant('藥理學', 5, 'P5'),
      mkVariant('藥理學', 0, 'P0'),
      mkVariant('藥理學', 6, 'P5'), // 藥理學 now complete (7/7 pyramid: P0 + slots 1–5 + extra P5 base)
      mkVariant('解剖學', 1, 'P1'),
    ])
    await db.synapses.bulkPut([
      { pairKey: 'a:b', state: 'strong', lastCoFireDate: '2026-06-01', createdAt: '2026-06-01' },
      { pairKey: 'c:d', state: 'strong', lastCoFireDate: '2026-06-01', createdAt: '2026-06-01' },
      { pairKey: 'e:f', state: 'weak', lastCoFireDate: '2026-06-01', createdAt: '2026-06-01' },
    ])
    await db.leaderboardProfile.put({
      user_id: 'u1',
      nickname: '測試員',
      nickname_lower: '測試員',
      opted_in: true,
      is_public: true,
      dismissed_at: null,
      last_pushed_at: null,
      selectedTitle: '神經元大師',
    })

    const payload = await buildCharacterCardPayload('u1')

    expect(payload.nickname).toBe('測試員')
    expect(payload.title).toBe('神經元大師')
    expect(payload.variantCount).toBe(8)
    expect(payload.variantTotal).toBe(77)
    expect(payload.familiesComplete).toBe(1) // only 藥理學 has all 7 (pyramid)
    expect(payload.familyTotal).toBe(11)
    expect(payload.totalAp).toBe(150)
    expect(payload.strongSynapseCount).toBe(2)
    expect(typeof payload.totalStudyMinutes).toBe('number')
    expect(payload.reps).toHaveLength(4)
    expect(payload.reps[0]?.familyId).toBe('藥理學') // DA
    expect(payload.reps[3]?.familyId).toBe('解剖學') // Glu
    expect(payload.reps[1]).toBeNull() // 5HT
    expect(payload.reps[2]).toBeNull() // GABA

    // No account identifier leaks onto the card payload.
    expect((payload as unknown as Record<string, unknown>).user_id).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain('u1')
  })

  it('falls back to the default nickname when no profile exists', async () => {
    const payload = await buildCharacterCardPayload()
    expect(payload.nickname).toBe(DEFAULT_CARD_NICKNAME)
    expect(payload.title).toBeNull()
    expect(payload.variantCount).toBe(0)
    expect(payload.reps.every((r) => r === null)).toBe(true)
  })
})

// Minimal recording 2D context — node test env has no real canvas.
function makeMockCtx(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = []
  const ctx = new Proxy(
    {},
    {
      get(_t, prop) {
        const key = String(prop)
        if (key === 'measureText') return (s: string) => ({ width: String(s).length * 10 })
        if (key === 'canvas') return { width: 1080, height: 1350 }
        return (..._args: unknown[]) => {
          calls.push(key)
        }
      },
      set() {
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('renderCharacterCard (mock ctx smoke)', () => {
  it('draws a full payload without throwing (sprites → drawImage)', () => {
    const payload: CharacterCardPayload = {
      nickname: '測試員',
      title: '稱號',
      reps: CARD_BRANCH_ORDER.map((branch) => ({
        branch,
        familyId: '藥理學',
        slotIndex: 1,
        spriteKey: 'variant:藥理學:1',
        rarity: 'P2' as VariantRarity,
        displayName: '多巴胺神經元',
      })),
      totalAp: 1234,
      strongSynapseCount: 5,
      variantCount: 6,
      variantTotal: 55,
      familiesComplete: 1,
      familyTotal: 11,
      totalStudyMinutes: 125,
      renderedAt: 0,
    }
    const assets: CardAssets = {
      sprites: { 'variant:藥理學:1': {} as unknown as CanvasImageSource },
      fontFamily: 'sans-serif',
    }
    const { ctx, calls } = makeMockCtx()
    expect(() => renderCharacterCard(ctx, payload, assets)).not.toThrow()
    expect(calls).toContain('fillRect')
    expect(calls).toContain('fillText')
    expect(calls).toContain('drawImage')
  })

  it('draws an empty-collection payload without throwing (no drawImage)', () => {
    const payload: CharacterCardPayload = {
      nickname: DEFAULT_CARD_NICKNAME,
      title: null,
      reps: [null, null, null, null],
      totalAp: 0,
      strongSynapseCount: 0,
      variantCount: 0,
      variantTotal: 55,
      familiesComplete: 0,
      familyTotal: 11,
      totalStudyMinutes: 0,
      renderedAt: 0,
    }
    const { ctx, calls } = makeMockCtx()
    expect(() => renderCharacterCard(ctx, payload, { sprites: {}, fontFamily: 'sans-serif' })).not.toThrow()
    expect(calls).toContain('fillText')
    expect(calls).not.toContain('drawImage')
  })
})
