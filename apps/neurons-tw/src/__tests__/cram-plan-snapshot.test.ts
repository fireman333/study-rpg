import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, todayISO } from '../lib/db'
import {
  getTodayPlanSnapshotIds,
  type PrescriptionPlan,
} from '../lib/services/prescription'

const planKey = (date: string) => `prescription:v1:plan:${date}`

async function putPlan(p: Partial<PrescriptionPlan>): Promise<void> {
  const plan: PrescriptionPlan = {
    date: todayISO(),
    createdAt: 1,
    seed: 'seed',
    wrongTarget: 0,
    breadthTarget: 0,
    breadthFamilyId: null,
    breadthFamilyLabel: null,
    wrongEligibleQuestionIds: [],
    breadthEligibleQuestionIds: [],
    yearScope: null,
    ...p,
  }
  await db.meta.put({ key: planKey(todayISO()), value: JSON.stringify(plan) })
}

describe('getTodayPlanSnapshotIds', () => {
  beforeEach(async () => {
    await db.meta.clear()
  })

  it('returns the union of repair ∪ breadth eligible ids when today has a plan', async () => {
    await putPlan({
      wrongEligibleQuestionIds: ['w1', 'w2'],
      breadthEligibleQuestionIds: ['b1', 'b2', 'w2'],
    })
    const ids = await getTodayPlanSnapshotIds()
    expect(ids).not.toBeNull()
    expect([...ids!].sort()).toEqual(['b1', 'b2', 'w1', 'w2'])
  })

  it('returns null when today has no plan', async () => {
    expect(await getTodayPlanSnapshotIds()).toBeNull()
  })

  it('never materializes a plan (read-only — plan key stays absent)', async () => {
    expect(await db.meta.get(planKey(todayISO()))).toBeUndefined()
    const ids = await getTodayPlanSnapshotIds()
    expect(ids).toBeNull()
    // the read must not have written a plan key
    expect(await db.meta.get(planKey(todayISO()))).toBeUndefined()
  })
})
