/**
 * Unit tests for the active-squad service (add-neurons-study-squad):
 * add/remove, reject-uncollected, cap enforcement, stale pruning, LWW merge,
 * and envelope parse tolerance.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, type NeuronVariantRow } from '../lib/db'
import {
  ACTIVE_SQUAD_META_KEY,
  MAX_SQUAD_SIZE,
  addSquadMember,
  removeSquadMember,
  readSquadEnvelope,
  filterStaleSquadMembers,
  pickActiveSquadLWW,
  parseSquadEnvelope,
  variantKey,
  parseVariantKey,
} from '../lib/services/study-squad'

const seedVariant = (familyId: string, slotIndex: number): NeuronVariantRow => ({
  familyId,
  slotIndex,
  rarity: 'P3',
  displayName: `${familyId} #${slotIndex}`,
  spriteKey: `variant:${familyId}:${slotIndex}`,
  rolledAt: 1717000000000,
  wasPityFloor: false,
})

beforeEach(async () => {
  await db.meta.clear()
  await db.neuronVariants.clear()
})

describe('study-squad service — db-backed', () => {
  it('adds a collected variant and stamps updatedAt', async () => {
    await db.neuronVariants.put(seedVariant('藥理學', 1))
    const ok = await addSquadMember('藥理學', 1)
    expect(ok).toBe(true)
    const env = await readSquadEnvelope()
    expect(env.members).toEqual(['藥理學:1'])
    expect(env.updatedAt).toBeGreaterThan(0)
  })

  it('rejects an uncollected variant (no matching row)', async () => {
    const ok = await addSquadMember('解剖學', 2)
    expect(ok).toBe(false)
    const env = await readSquadEnvelope()
    expect(env.members).toEqual([])
  })

  it('does not double-add the same variant', async () => {
    await db.neuronVariants.put(seedVariant('藥理學', 1))
    await addSquadMember('藥理學', 1)
    const ok = await addSquadMember('藥理學', 1)
    expect(ok).toBe(false)
    const env = await readSquadEnvelope()
    expect(env.members).toEqual(['藥理學:1'])
  })

  it('enforces MAX_SQUAD_SIZE', async () => {
    for (let i = 1; i <= MAX_SQUAD_SIZE + 1; i++) {
      await db.neuronVariants.put(seedVariant('科' + i, i))
    }
    for (let i = 1; i <= MAX_SQUAD_SIZE; i++) {
      expect(await addSquadMember('科' + i, i)).toBe(true)
    }
    // One past the cap is rejected.
    const overflow = await addSquadMember('科' + (MAX_SQUAD_SIZE + 1), MAX_SQUAD_SIZE + 1)
    expect(overflow).toBe(false)
    const env = await readSquadEnvelope()
    expect(env.members).toHaveLength(MAX_SQUAD_SIZE)
  })

  it('removes a member', async () => {
    await db.neuronVariants.put(seedVariant('藥理學', 1))
    await db.neuronVariants.put(seedVariant('生理學', 2))
    await addSquadMember('藥理學', 1)
    await addSquadMember('生理學', 2)
    const removed = await removeSquadMember('藥理學', 1)
    expect(removed).toBe(true)
    const env = await readSquadEnvelope()
    expect(env.members).toEqual(['生理學:2'])
    // Removing an absent member is a no-op false.
    expect(await removeSquadMember('藥理學', 1)).toBe(false)
  })

  it('persists the envelope under the activeSquad meta key', async () => {
    await db.neuronVariants.put(seedVariant('藥理學', 1))
    await addSquadMember('藥理學', 1)
    const row = await db.meta.get(ACTIVE_SQUAD_META_KEY)
    expect(row).toBeDefined()
    expect(JSON.parse(row!.value).members).toEqual(['藥理學:1'])
  })
})

describe('study-squad — pure helpers', () => {
  it('variantKey / parseVariantKey round-trip (incl. colon-containing family)', () => {
    expect(variantKey('藥理學', 3)).toBe('藥理學:3')
    expect(parseVariantKey('藥理學:3')).toEqual({ familyId: '藥理學', slotIndex: 3 })
    expect(parseVariantKey('a:b:2')).toEqual({ familyId: 'a:b', slotIndex: 2 })
    expect(parseVariantKey('bad')).toBeNull()
    expect(parseVariantKey(':3')).toBeNull()
  })

  it('filterStaleSquadMembers drops uncollected keys, keeps order', () => {
    const collected = new Set(['a:1', 'b:2'])
    expect(filterStaleSquadMembers(['a:1', 'c:9', 'b:2'], collected)).toEqual(['a:1', 'b:2'])
  })

  it('parseSquadEnvelope tolerates bare array (updatedAt 0) and bad input', () => {
    expect(parseSquadEnvelope(undefined)).toEqual({ members: [], updatedAt: 0 })
    expect(parseSquadEnvelope('["a:1","b:2"]')).toEqual({ members: ['a:1', 'b:2'], updatedAt: 0 })
    expect(parseSquadEnvelope('not json')).toEqual({ members: [], updatedAt: 0 })
    expect(parseSquadEnvelope('{"members":["a:1"],"updatedAt":7}')).toEqual({
      members: ['a:1'],
      updatedAt: 7,
    })
  })

  it('pickActiveSquadLWW returns incoming only when strictly newer', () => {
    const local = JSON.stringify({ members: ['a:1'], updatedAt: 100 })
    const newer = JSON.stringify({ members: ['b:2'], updatedAt: 200 })
    const older = JSON.stringify({ members: ['c:3'], updatedAt: 50 })
    expect(pickActiveSquadLWW(local, newer)).toBe(newer)
    expect(pickActiveSquadLWW(local, older)).toBeNull()
    expect(pickActiveSquadLWW(local, local)).toBeNull() // equal updatedAt → local wins
    expect(pickActiveSquadLWW(undefined, newer)).toBe(newer)
    expect(pickActiveSquadLWW(local, undefined)).toBeNull()
  })
})
