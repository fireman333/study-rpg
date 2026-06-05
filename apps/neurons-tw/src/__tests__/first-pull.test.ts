import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { FAMILIES_BY_BRANCH, NT_BRANCHES } from '@study-rpg/content-neurons-tw'
import { buildBundleSnapshot, applyBundleSnapshot } from '../lib/sync/r2/bundles'
import {
  FIRST_PULL_DONE_KEY,
  isFirstPullDone,
  readStarterFamily,
  runFirstPull,
  STARTER_FAMILY_KEYS,
} from '../lib/services/first-pull'

const resolve = (id: string): string => id

async function seedAllFamilies(): Promise<void> {
  for (const branch of NT_BRANCHES) {
    for (const fam of FAMILIES_BY_BRANCH[branch]) {
      await db.familyAccrual.put({
        familyId: fam,
        ap: 5,
        firedToday: false,
        lastFireDate: null,
        unlockedSlots: [],
        sameDayCorrect: 0,
        pullCount: 0,
      })
    }
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedAllFamilies()
})

describe('runFirstPull', () => {
  it('mints one variant per branch, records starterFamily + firstPullDone, leaves the settle economy untouched', async () => {
    const out = await runFirstPull(resolve)
    expect(out).not.toBeNull()
    expect(out!.draws).toHaveLength(4)
    for (const d of out!.draws) expect(d.pull.ok).toBe(true)

    // 4 disjoint families (one per branch) → 4 fresh variant rows.
    expect(await db.neuronVariants.count()).toBe(4)
    expect(await isFirstPullDone()).toBe(true)

    for (const branch of NT_BRANCHES) {
      const fam = await readStarterFamily(branch)
      expect(fam).not.toBeNull()
      expect(FAMILIES_BY_BRANCH[branch]).toContain(fam!)
      // Pure gift: no settle / energy written for any branch.
      expect(await db.meta.get(`maze:${branch.toLowerCase()}:settles`)).toBeUndefined()
      expect(await db.meta.get(`maze:${branch.toLowerCase()}:earned`)).toBeUndefined()
    }
  })

  it('is idempotent — a second call returns null and mints nothing new', async () => {
    await runFirstPull(resolve)
    const before = await db.neuronVariants.count()
    const second = await runFirstPull(resolve)
    expect(second).toBeNull()
    expect(await db.neuronVariants.count()).toBe(before)
  })

  it('does not re-enable after clearing the collection (gated on the flag, not emptiness)', async () => {
    await runFirstPull(resolve)
    await db.neuronVariants.clear()
    await db.neuronInstances.clear()
    const again = await runFirstPull(resolve)
    expect(again).toBeNull()
    expect(await isFirstPullDone()).toBe(true)
  })

  it('first-pull meta keys ride the bundle snapshot and restore on apply (v15)', async () => {
    await runFirstPull(resolve)

    const bundle = await buildBundleSnapshot(db)
    expect(bundle.meta.schema_version).toBe(17)
    const metaRows = (bundle.data.meta as Array<{ key: string; value: string }>) ?? []
    const byKey = new Map(metaRows.map((r) => [r.key, r.value]))
    expect(byKey.get(FIRST_PULL_DONE_KEY)).toBe('true')
    for (const k of STARTER_FAMILY_KEYS) expect(byKey.get(k)).toBeTruthy()

    // Fresh device: apply the bundle → first-pull state restores (write-if-missing).
    await db.meta.clear()
    await applyBundleSnapshot(db, bundle)
    expect(await isFirstPullDone()).toBe(true)
    for (const branch of NT_BRANCHES) {
      expect(await readStarterFamily(branch)).not.toBeNull()
    }
  })
})
