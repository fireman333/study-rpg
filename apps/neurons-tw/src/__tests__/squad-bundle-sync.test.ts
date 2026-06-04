/**
 * Bundle-level sync semantics for the activeSquad meta key (add-neurons-study-squad):
 * the key snapshots into the v8 bundle; a v7 bundle (no activeSquad) preserves
 * the local squad on omission.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  buildBundleSnapshot,
  applyBundleSnapshot,
  SCHEMA_VERSION,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'
import { ACTIVE_SQUAD_META_KEY } from '../lib/services/study-squad'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('activeSquad bundle sync', () => {
  it('bundle SCHEMA_VERSION is 16', () => {
    expect(SCHEMA_VERSION).toBe(16)
  })

  it('snapshots the activeSquad meta key into the bundle', async () => {
    const value = JSON.stringify({ members: ['藥理學:1', '生理學:2'], updatedAt: 100 })
    await db.meta.put({ key: ACTIVE_SQUAD_META_KEY, value })

    const bundle = await buildBundleSnapshot(db)
    expect(bundle.meta.schema_version).toBe(16)
    const metaRows = bundle.data.meta as { key: string; value: string }[]
    const squadRow = metaRows.find((r) => r.key === ACTIVE_SQUAD_META_KEY)
    expect(squadRow).toBeDefined()
    expect(JSON.parse(squadRow!.value).members).toEqual(['藥理學:1', '生理學:2'])
  })

  it('a v7 bundle (no activeSquad) preserves the local squad on omission', async () => {
    const localValue = JSON.stringify({ members: ['藥理學:1'], updatedAt: 200 })
    await db.meta.put({ key: ACTIVE_SQUAD_META_KEY, value: localValue })

    const v7Bundle: BundleSnapshot = {
      meta: {
        schema_version: 7,
        updated_at: '2026-06-01T00:00:00Z',
        client_id: 'v7-client',
        app_version: '0.4.0',
      },
      data: {
        synapses: [],
        familyAccrual: [],
        familyMastery: [],
        neuronVariants: [],
        achievements: [],
        leaderboardProfile: [],
        meta: [], // no activeSquad — older client never carried it
      },
    }

    await applyBundleSnapshot(db, v7Bundle)
    const row = await db.meta.get(ACTIVE_SQUAD_META_KEY)
    expect(row?.value).toBe(localValue) // local untouched
  })
})
