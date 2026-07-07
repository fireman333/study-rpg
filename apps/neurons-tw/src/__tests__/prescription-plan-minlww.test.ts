import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, todayISO } from '../lib/db'
import { pickPlanMinLWW, type PrescriptionPlan } from '../lib/services/prescription'
import { backfillPrescriptionPlanMinLWW } from '../lib/sync/backfill/prescription-plan'

// Mirrors the imprint-keepsake suite: the plan family's merge is a registered
// backfill post-pass (earliest-createdAt-wins MIN-LWW on `(createdAt, seed)`),
// run on pull completion — the metaAdapter's first-write-wins is only its
// transport default (add-neurons-prescription-tiers-and-sync, design D5).

const PLAN_KEY = `prescription:v1:plan:${todayISO()}`

const mkPlanRaw = (createdAt: number, seed: string): string => {
  const plan: PrescriptionPlan = {
    date: todayISO(),
    createdAt,
    seed,
    wrongTarget: 1,
    breadthTarget: 0,
    breadthFamilyId: 'phys',
    breadthFamilyLabel: '生理',
    wrongEligibleQuestionIds: ['w1'],
    breadthEligibleQuestionIds: [],
    yearScope: null,
  }
  return JSON.stringify(plan)
}

describe('pickPlanMinLWW (pure)', () => {
  it('earliest createdAt wins in both directions', () => {
    const early = mkPlanRaw(100, 'b')
    const late = mkPlanRaw(200, 'a')
    expect(pickPlanMinLWW(late, early)).toBe(early) // incoming earlier → replace
    expect(pickPlanMinLWW(early, late)).toBeNull() // local earlier → keep
  })

  it('tie-breaks equal createdAt by min seed', () => {
    const a = mkPlanRaw(100, 'aa')
    const b = mkPlanRaw(100, 'bb')
    expect(pickPlanMinLWW(b, a)).toBe(a)
    expect(pickPlanMinLWW(a, b)).toBeNull()
  })

  it('malformed incoming keeps local; malformed local yields to valid incoming', () => {
    const good = mkPlanRaw(100, 'a')
    expect(pickPlanMinLWW(good, 'not-json{')).toBeNull()
    expect(pickPlanMinLWW(good, JSON.stringify({ seed: 'x' }))).toBeNull() // missing createdAt
    expect(pickPlanMinLWW('not-json{', good)).toBe(good)
    expect(pickPlanMinLWW(undefined, good)).toBe(good) // no local → take incoming
  })
})

describe('backfillPrescriptionPlanMinLWW (post-pass convergence)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  const early = mkPlanRaw(100, 'a')
  const late = mkPlanRaw(200, 'b')

  it('both pull orders converge to the min (createdAt, seed) plan', async () => {
    // Order 1: device holds the LATE plan, pulls the EARLY one.
    await db.meta.put({ key: PLAN_KEY, value: late })
    await backfillPrescriptionPlanMinLWW(db, { [PLAN_KEY]: early })
    expect((await db.meta.get(PLAN_KEY))?.value).toBe(early)
    // Order 2: device holds the EARLY plan, pulls the LATE one.
    await db.meta.put({ key: PLAN_KEY, value: early })
    await backfillPrescriptionPlanMinLWW(db, { [PLAN_KEY]: late })
    expect((await db.meta.get(PLAN_KEY))?.value).toBe(early)
  })

  it('seed tie-break converges deterministically', async () => {
    const seedA = mkPlanRaw(100, 'aa')
    const seedB = mkPlanRaw(100, 'bb')
    await db.meta.put({ key: PLAN_KEY, value: seedB })
    await backfillPrescriptionPlanMinLWW(db, { [PLAN_KEY]: seedA })
    expect((await db.meta.get(PLAN_KEY))?.value).toBe(seedA)
  })

  it('malformed incoming keeps the local plan', async () => {
    await db.meta.put({ key: PLAN_KEY, value: early })
    await backfillPrescriptionPlanMinLWW(db, { [PLAN_KEY]: '{broken' })
    expect((await db.meta.get(PLAN_KEY))?.value).toBe(early)
  })

  it('progress keys written under the losing plan survive (UNION)', async () => {
    const today = todayISO()
    await db.meta.put({ key: PLAN_KEY, value: late })
    await db.meta.put({ key: `prescription:v1:wrong:${today}:w1`, value: '1' })
    await db.meta.put({ key: `prescription:v1:breadth:${today}:b1`, value: '1' })
    await backfillPrescriptionPlanMinLWW(db, { [PLAN_KEY]: early })
    expect((await db.meta.get(PLAN_KEY))?.value).toBe(early)
    expect((await db.meta.get(`prescription:v1:wrong:${today}:w1`))?.value).toBe('1')
    expect((await db.meta.get(`prescription:v1:breadth:${today}:b1`))?.value).toBe('1')
  })

  it('ignores out-of-window plan keys (a stale bundle cannot resurrect an old plan)', async () => {
    const staleKey = 'prescription:v1:plan:2020-01-01'
    await backfillPrescriptionPlanMinLWW(db, { [staleKey]: mkPlanRaw(1, 'z') })
    expect(await db.meta.get(staleKey)).toBeUndefined()
  })

  it('drops a malformed in-window plan the generic apply installed on a fresh device (M5)', async () => {
    // Local was absent; the generic first-write apply installed a garbage plan
    // from a corrupt bundle. pickPlanMinLWW keeps local (malformed incoming) →
    // the post-pass must DELETE the malformed value so the reader regenerates.
    await db.meta.put({ key: PLAN_KEY, value: '{broken-installed' })
    await backfillPrescriptionPlanMinLWW(db, { [PLAN_KEY]: '{broken-installed' })
    expect(await db.meta.get(PLAN_KEY)).toBeUndefined()
  })

  it('drops a NON-STRING plan value a corrupt bundle installed (M5, non-string)', async () => {
    // A corrupt bundle carries `{ key: planKey, value: 123 }`; the generic apply
    // installs the non-string and the post-pass skips MIN-LWW for it — the
    // always-run final validation must still delete it.
    await db.meta.put({ key: PLAN_KEY, value: 123 as unknown as string })
    await backfillPrescriptionPlanMinLWW(db, { [PLAN_KEY]: 123 })
    expect(await db.meta.get(PLAN_KEY)).toBeUndefined()
  })

  it('replaces a malformed local plan with a valid incoming one', async () => {
    await db.meta.put({ key: PLAN_KEY, value: '{was-broken' })
    await backfillPrescriptionPlanMinLWW(db, { [PLAN_KEY]: early })
    expect((await db.meta.get(PLAN_KEY))?.value).toBe(early)
  })
})
