import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, todayISO } from '../lib/db'
import { isSyncedPrescriptionKey } from '../lib/services/prescription'
import { isSyncedMetaKey } from '../lib/sync/tables'
import {
  buildBundleSnapshot,
  applyBundleSnapshot,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'

// Date-windowed prescription synced-key matcher, single-sourced from
// prescription.ts and consumed by isSyncedMetaKey (snapshot AND apply use the
// same test). add-neurons-prescription-tiers-and-sync, design D4.

/** Shift an ISO date by ±days (local calendar). */
const shift = (base: string, days: number): string => {
  const d = new Date(`${base}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}

const TODAY = '2026-07-07' // explicit `today` param → no wall-clock dependence

describe('isSyncedPrescriptionKey — families and window edges', () => {
  const windowed = ['plan', 'wrong', 'breadth', 'cramRescue', 'wire', 'tierClaim'] as const

  it.each(windowed)('%s: today ✓ / yesterday ✓ / tomorrow ✓ / ±2 days ✗', (family) => {
    const suffix = family === 'plan' ? '' : family === 'tierClaim' ? ':2' : ':q1'
    const key = (date: string): string => `prescription:v1:${family}:${date}${suffix}`
    expect(isSyncedPrescriptionKey(key(TODAY), TODAY)).toBe(true)
    expect(isSyncedPrescriptionKey(key(shift(TODAY, -1)), TODAY)).toBe(true)
    expect(isSyncedPrescriptionKey(key(shift(TODAY, 1)), TODAY)).toBe(true)
    expect(isSyncedPrescriptionKey(key(shift(TODAY, -2)), TODAY)).toBe(false)
    expect(isSyncedPrescriptionKey(key(shift(TODAY, 2)), TODAY)).toBe(false)
  })

  it('completed / reward match ALL dates (full history)', () => {
    expect(isSyncedPrescriptionKey('prescription:v1:completed:2026-01-01', TODAY)).toBe(true)
    expect(isSyncedPrescriptionKey('prescription:v1:reward:2025-12-31', TODAY)).toBe(true)
    expect(isSyncedPrescriptionKey(`prescription:v1:completed:${TODAY}`, TODAY)).toBe(true)
  })

  it('lightsOut / localSeed NEVER match', () => {
    expect(isSyncedPrescriptionKey(`prescription:v1:lightsOut:${TODAY}`, TODAY)).toBe(false)
    expect(isSyncedPrescriptionKey('prescription:v1:localSeed', TODAY)).toBe(false)
  })

  it('does not capture the imprint family (it rides its own prefix) or foreign keys', () => {
    // The imprint prefix is a SEPARATE registered matcher in isSyncedMetaKey.
    expect(
      isSyncedPrescriptionKey(`prescription:v1:ng0717:imprint:藥理學:${TODAY}`, TODAY),
    ).toBe(false)
    expect(isSyncedMetaKey(`prescription:v1:ng0717:imprint:藥理學:${TODAY}`)).toBe(true)
    // non-prescription keys are untouched
    expect(isSyncedPrescriptionKey('maze:藥理學:earned', TODAY)).toBe(false)
    // malformed date suffix → not synced
    expect(isSyncedPrescriptionKey('prescription:v1:wrong:notadate:q1', TODAY)).toBe(false)
  })

  it('wire keys tolerate pairKey separators; tierClaim carries the tier suffix', () => {
    expect(
      isSyncedPrescriptionKey(`prescription:v1:wire:${TODAY}:生理學|藥理學`, TODAY),
    ).toBe(true)
    expect(isSyncedPrescriptionKey(`prescription:v1:tierClaim:${TODAY}:4`, TODAY)).toBe(true)
  })
})

describe('snapshot AND apply both honor the matcher', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('snapshot: in-window keys enter the bundle; out-of-window / local-only do not', async () => {
    const today = todayISO()
    await db.meta.put({ key: `prescription:v1:wrong:${today}:q1`, value: '1' })
    await db.meta.put({ key: `prescription:v1:tierClaim:${today}:2`, value: '{}' })
    await db.meta.put({ key: `prescription:v1:wrong:${shift(today, -2)}:q9`, value: '1' })
    await db.meta.put({ key: `prescription:v1:lightsOut:${today}`, value: '{}' })
    await db.meta.put({ key: 'prescription:v1:reward:2026-01-01', value: '{}' }) // all dates
    const bundle = await buildBundleSnapshot(db)
    const keys = new Set((bundle.data.meta as Array<{ key: string }>).map((r) => r.key))
    expect(keys.has(`prescription:v1:wrong:${today}:q1`)).toBe(true)
    expect(keys.has(`prescription:v1:tierClaim:${today}:2`)).toBe(true)
    expect(keys.has('prescription:v1:reward:2026-01-01')).toBe(true)
    expect(keys.has(`prescription:v1:wrong:${shift(today, -2)}:q9`)).toBe(false) // out of window
    expect(keys.has(`prescription:v1:lightsOut:${today}`)).toBe(false) // local-only
  })

  it('apply: accepts in-window keys, drops out-of-window and local-only keys; out-of-window local keys stay untouched', async () => {
    const today = todayISO()
    // A local out-of-window key (e.g. a past day's progress) must survive apply
    // untouched — first-write-wins never deletes local keys absent from a bundle.
    await db.meta.put({ key: `prescription:v1:wrong:${shift(today, -5)}:old`, value: '1' })
    const incoming: BundleSnapshot = {
      meta: { schema_version: 26, updated_at: 'x', client_id: 'c', app_version: '0.4.0' },
      data: {
        meta: [
          { key: `prescription:v1:wrong:${shift(today, -1)}:qy`, value: '1' }, // yesterday → accepted
          { key: `prescription:v1:wrong:${shift(today, -2)}:qo`, value: '1' }, // −2d → dropped
          { key: `prescription:v1:localSeed`, value: 'foreign' }, // never
          { key: 'prescription:v1:completed:2026-01-01', value: '{}' }, // all dates → accepted
        ],
      },
    }
    await applyBundleSnapshot(db, incoming)
    expect((await db.meta.get(`prescription:v1:wrong:${shift(today, -1)}:qy`))?.value).toBe('1')
    expect(await db.meta.get(`prescription:v1:wrong:${shift(today, -2)}:qo`)).toBeUndefined()
    expect(await db.meta.get('prescription:v1:localSeed')).toBeUndefined()
    expect((await db.meta.get('prescription:v1:completed:2026-01-01'))?.value).toBe('{}')
    expect((await db.meta.get(`prescription:v1:wrong:${shift(today, -5)}:old`))?.value).toBe('1')
  })
})
