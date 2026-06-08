import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { buildLeaderboardPayload } from '../lib/services/neurons-leaderboard'

/**
 * Spec Req (neurons-mode → "Leaderboard push SHALL include real reading
 * minutes from totalStudyMinutes counter"): buildLeaderboardPayload reads
 * meta['totalStudyMinutes'] via readTotalStudyMinutes() instead of hardcoding 0.
 *
 * Pre-fix: payload.total_study_min was always 0.
 * Post-fix: payload.total_study_min reflects real Dexie meta key.
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('buildLeaderboardPayload — total_study_min wiring', () => {
  it('reflects meta["totalStudyMinutes"] when accrued', async () => {
    await db.meta.put({ key: 'totalStudyMinutes', value: '42' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_study_min).toBe(42)
  })

  it('returns 0 when meta key is missing (fresh user)', async () => {
    // No meta seed — user never started reading-timer
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_study_min).toBe(0)
  })

  it('returns 0 when meta key value is undefined or malformed', async () => {
    await db.meta.put({ key: 'totalStudyMinutes', value: 'not-a-number' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_study_min).toBe(0)
  })

  it('reflects 0 explicitly stored', async () => {
    await db.meta.put({ key: 'totalStudyMinutes', value: '0' })
    const payload = await buildLeaderboardPayload('TestNick', false)
    expect(payload.total_study_min).toBe(0)
  })

  it('handles large accrual values (no overflow)', async () => {
    await db.meta.put({ key: 'totalStudyMinutes', value: '999999' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_study_min).toBe(999999)
  })
})

describe('buildLeaderboardPayload — open collection (variant_count distinct, no family_complete)', () => {
  it('variant_count equals distinct OWNED slots (held dupes / copies do not inflate)', async () => {
    await db.neuronVariants.bulkPut([
      { familyId: '藥理學', slotIndex: 0, rarity: 'P0', displayName: 'a', spriteKey: 'variant:藥理學:0', rolledAt: 1, wasPityFloor: false, copies: 1 },
      { familyId: '藥理學', slotIndex: 1, rarity: 'P5', displayName: 'b', spriteKey: 'variant:藥理學:1', rolledAt: 2, wasPityFloor: false, copies: 5 },
      { familyId: '解剖學', slotIndex: 0, rarity: 'P0', displayName: 'c', spriteKey: 'variant:解剖學:0', rolledAt: 3, wasPityFloor: false, copies: 1 },
    ])
    // variant_count is now the canonical ownedSlotCount projection, so each slot
    // needs ≥1 held individual. The copies=5 slot holds 5 individuals — distinct
    // OWNED count is still 3 (held duplicates do NOT inflate the slot count).
    await db.neuronInstances.bulkPut([
      { instanceId: 'p0a', familyId: '藥理學', slotIndex: 0, rarity: 'P0', spriteKey: 'variant:藥理學:0', rolledAt: 1, consumedAt: null },
      { instanceId: 'p1a', familyId: '藥理學', slotIndex: 1, rarity: 'P5', spriteKey: 'variant:藥理學:1', rolledAt: 2, consumedAt: null },
      { instanceId: 'p1b', familyId: '藥理學', slotIndex: 1, rarity: 'P5', spriteKey: 'variant:藥理學:1', rolledAt: 2, consumedAt: null },
      { instanceId: 'p1c', familyId: '藥理學', slotIndex: 1, rarity: 'P5', spriteKey: 'variant:藥理學:1', rolledAt: 2, consumedAt: null },
      { instanceId: 'p1d', familyId: '藥理學', slotIndex: 1, rarity: 'P5', spriteKey: 'variant:藥理學:1', rolledAt: 2, consumedAt: null },
      { instanceId: 'p1e', familyId: '藥理學', slotIndex: 1, rarity: 'P5', spriteKey: 'variant:藥理學:1', rolledAt: 2, consumedAt: null },
      { instanceId: 'c0a', familyId: '解剖學', slotIndex: 0, rarity: 'P0', spriteKey: 'variant:解剖學:0', rolledAt: 3, consumedAt: null },
    ])
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.variant_count).toBe(3) // 3 distinct OWNED slots; 5 held dupes do NOT inflate
  })

  it('payload does not carry a family_complete field (retired)', async () => {
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect('family_complete' in payload).toBe(false)
  })
})
