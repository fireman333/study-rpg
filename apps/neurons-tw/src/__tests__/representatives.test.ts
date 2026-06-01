import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, type NeuronVariantRow } from '../lib/db'
import {
  REPRESENTATIVES_META_KEY,
  getRepresentativesRaw,
  readRepresentativeEnvelope,
  filterStaleRepresentatives,
  setRepresentative,
  pickRepresentativeLWW,
  parseRepresentativeEnvelope,
} from '../lib/services/representatives'
import { backfillRepresentativesLWW } from '../lib/sync/backfill/representatives'

const variant = (familyId: string, slotIndex: number): NeuronVariantRow => ({
  familyId,
  slotIndex,
  rarity: 'P3',
  displayName: `${familyId}#${slotIndex}`,
  spriteKey: `variant:${familyId}:${slotIndex}`,
  rolledAt: 1_700_000_000_000,
  wasPityFloor: false,
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('setRepresentative validation', () => {
  it('rejects an uncollected slot (no-op, returns false)', async () => {
    const ok = await setRepresentative('藥理學', 5)
    expect(ok).toBe(false)
    const row = await db.meta.get(REPRESENTATIVES_META_KEY)
    expect(row).toBeUndefined()
  })

  it('persists a collected slot with an updatedAt timestamp', async () => {
    await db.neuronVariants.put(variant('藥理學', 2))
    const ok = await setRepresentative('藥理學', 2)
    expect(ok).toBe(true)
    const env = await readRepresentativeEnvelope()
    expect(env.map['藥理學']).toBe(2)
    expect(env.updatedAt).toBeGreaterThan(0)
    expect(await getRepresentativesRaw()).toEqual({ 藥理學: 2 })
  })

  it('does not change the prior representative when an invalid set is attempted', async () => {
    await db.neuronVariants.put(variant('藥理學', 2))
    await setRepresentative('藥理學', 2)
    const ok = await setRepresentative('藥理學', 5) // slot 5 not collected
    expect(ok).toBe(false)
    expect((await getRepresentativesRaw())['藥理學']).toBe(2)
  })
})

describe('filterStaleRepresentatives', () => {
  it('drops entries whose slot is not collected', () => {
    const map = { 藥理學: 2, 解剖學: 1 }
    const collected = new Set(['藥理學:2'])
    expect(filterStaleRepresentatives(map, collected)).toEqual({ 藥理學: 2 })
  })

  it('keeps all entries when every slot is collected', () => {
    const map = { 藥理學: 2, 解剖學: 1 }
    const collected = new Set(['藥理學:2', '解剖學:1'])
    expect(filterStaleRepresentatives(map, collected)).toEqual(map)
  })
})

describe('parseRepresentativeEnvelope', () => {
  it('parses a full envelope', () => {
    expect(parseRepresentativeEnvelope(JSON.stringify({ map: { 藥理學: 1 }, updatedAt: 42 }))).toEqual({
      map: { 藥理學: 1 },
      updatedAt: 42,
    })
  })

  it('tolerates a bare legacy map as updatedAt 0', () => {
    expect(parseRepresentativeEnvelope(JSON.stringify({ 藥理學: 3 }))).toEqual({
      map: { 藥理學: 3 },
      updatedAt: 0,
    })
  })

  it('returns empty for undefined / garbage', () => {
    expect(parseRepresentativeEnvelope(undefined)).toEqual({ map: {}, updatedAt: 0 })
    expect(parseRepresentativeEnvelope('not json')).toEqual({ map: {}, updatedAt: 0 })
  })
})

describe('pickRepresentativeLWW', () => {
  const env = (map: Record<string, number>, updatedAt: number) =>
    JSON.stringify({ map, updatedAt })

  it('returns incoming when it is strictly newer', () => {
    const incoming = env({ 藥理學: 3 }, 200)
    expect(pickRepresentativeLWW(env({ 藥理學: 1 }, 100), incoming)).toBe(incoming)
  })

  it('returns null when local is newer or equal (local wins)', () => {
    expect(pickRepresentativeLWW(env({ 藥理學: 1 }, 200), env({ 藥理學: 3 }, 200))).toBeNull()
    expect(pickRepresentativeLWW(env({ 藥理學: 1 }, 300), env({ 藥理學: 3 }, 200))).toBeNull()
  })

  it('returns null when incoming is absent', () => {
    expect(pickRepresentativeLWW(env({ 藥理學: 1 }, 100), undefined)).toBeNull()
  })

  it('lets a timestamped incoming beat a bare legacy local (updatedAt 0)', () => {
    const incoming = env({ 藥理學: 2 }, 1)
    expect(pickRepresentativeLWW(JSON.stringify({ 藥理學: 9 }), incoming)).toBe(incoming)
  })
})

describe('backfillRepresentativesLWW (cross-device reconcile)', () => {
  it('overwrites a stale local with a newer incoming (last-write-wins)', async () => {
    await db.meta.put({
      key: REPRESENTATIVES_META_KEY,
      value: JSON.stringify({ map: { 藥理學: 1 }, updatedAt: 100 }),
    })
    const incoming = { [REPRESENTATIVES_META_KEY]: JSON.stringify({ map: { 藥理學: 3 }, updatedAt: 200 }) }
    const res = await backfillRepresentativesLWW(db, incoming)
    expect(res.updated).toBe(true)
    expect((await getRepresentativesRaw())['藥理學']).toBe(3)
  })

  it('keeps local when it is newer than incoming', async () => {
    await db.meta.put({
      key: REPRESENTATIVES_META_KEY,
      value: JSON.stringify({ map: { 藥理學: 5 }, updatedAt: 300 }),
    })
    const incoming = { [REPRESENTATIVES_META_KEY]: JSON.stringify({ map: { 藥理學: 1 }, updatedAt: 200 }) }
    const res = await backfillRepresentativesLWW(db, incoming)
    expect(res.updated).toBe(false)
    expect((await getRepresentativesRaw())['藥理學']).toBe(5)
  })

  it('is a no-op when the bundle has no representativeVariants key', async () => {
    await db.meta.put({
      key: REPRESENTATIVES_META_KEY,
      value: JSON.stringify({ map: { 藥理學: 2 }, updatedAt: 100 }),
    })
    const res = await backfillRepresentativesLWW(db, {})
    expect(res.updated).toBe(false)
    expect((await getRepresentativesRaw())['藥理學']).toBe(2)
  })
})
