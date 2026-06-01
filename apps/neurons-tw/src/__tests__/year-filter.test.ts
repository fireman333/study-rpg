import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  ALL_YEARS,
  YEAR_FILTER_META_KEY,
  getYearFilter,
  setYearFilter,
  effectiveYearSet,
} from '../lib/services/year-filter'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('effectiveYearSet (pure)', () => {
  it('null → all years', () => {
    expect(effectiveYearSet(null)).toEqual(new Set(ALL_YEARS))
  })
  it('empty array → all years (not empty set)', () => {
    expect(effectiveYearSet([])).toEqual(new Set(ALL_YEARS))
  })
  it('subset → that subset', () => {
    expect(effectiveYearSet([113, 114])).toEqual(new Set([113, 114]))
  })
  it('full list → all years (no-op semantics)', () => {
    const s = effectiveYearSet([...ALL_YEARS])
    expect(s.size).toBe(ALL_YEARS.length)
  })
})

describe('getYearFilter / setYearFilter (persistence)', () => {
  it('no row → null', async () => {
    expect(await getYearFilter()).toBeNull()
  })
  it('round-trips a selection (filtered + sorted desc)', async () => {
    await setYearFilter([114, 113])
    expect(await getYearFilter()).toEqual([114, 113])
  })
  it('drops unknown years on write', async () => {
    await setYearFilter([114, 999, 100])
    expect(await getYearFilter()).toEqual([114])
  })
  it('corrupt value → null without throwing', async () => {
    await db.meta.put({ key: YEAR_FILTER_META_KEY, value: 'not-json{' })
    expect(await getYearFilter()).toBeNull()
  })
  it('non-array JSON → null', async () => {
    await db.meta.put({ key: YEAR_FILTER_META_KEY, value: '{"a":1}' })
    expect(await getYearFilter()).toBeNull()
  })
})

describe('pool gate (family + year)', () => {
  const pool = [
    { id: '106-1-醫學一-藥理學-Q1', subject: '藥理學', meta: { year: 106 } },
    { id: '114-1-醫學一-藥理學-Q2', subject: '藥理學', meta: { year: 114 } },
    { id: '114-1-醫學一-解剖學-Q3', subject: '解剖學', meta: { year: 114 } },
  ]
  function gate(family: string | null, persisted: number[] | null) {
    const ys = effectiveYearSet(persisted)
    const byFamily = family == null ? pool : pool.filter((q) => q.subject === family)
    if (ys.size >= ALL_YEARS.length) return byFamily
    return byFamily.filter((q) => ys.has(q.meta.year))
  }
  it('cross-family + single year', () => {
    expect(gate(null, [114]).map((q) => q.id)).toEqual([
      '114-1-醫學一-藥理學-Q2',
      '114-1-醫學一-解剖學-Q3',
    ])
  })
  it('specific family + single year', () => {
    expect(gate('藥理學', [114]).map((q) => q.id)).toEqual(['114-1-醫學一-藥理學-Q2'])
  })
  it('all years = no year exclusion', () => {
    expect(gate('藥理學', null).length).toBe(2)
  })
  it('empty filtered pool is possible (family × year miss)', () => {
    expect(gate('解剖學', [106]).length).toBe(0)
  })
})
