import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  livingCompanionDefs,
  livingCompanions,
  EQUIPMENT_CATALOG,
} from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'

/**
 * add-neurons-living-companion-render — owned living-cell glial companions march
 * with the expedition squad (the `MazeExpedition` band), derived purely from the
 * catalog `companion` flag + the owned `equipment` table. These tests pin the
 * predicate (spec: neurons-living-companion) and the exact data path the band
 * uses to build its companion marchers (db.equipment → ids → livingCompanions),
 * without mounting React (the suite has no RTL; the live band render is covered
 * by the Chrome MCP verify stage).
 */

const GLIA = ['eq-oligodendrocyte-companion-p3', 'eq-astrocyte-glycogen-p3']
const RANK = { P1: 0, P2: 1, P3: 2, P4: 3, P5: 4 } as const

describe('living-companion catalog subset', () => {
  it('livingCompanionDefs returns exactly the two glia, all companion:true', () => {
    const defs = livingCompanionDefs()
    expect(defs.map((d) => d.equipmentId).sort()).toEqual([...GLIA].sort())
    expect(defs.every((d) => d.companion === true)).toBe(true)
  })

  it('structural/molecular items are NOT companions', () => {
    const nonGlia = EQUIPMENT_CATALOG.filter((d) => !GLIA.includes(d.equipmentId))
    expect(nonGlia.length).toBe(EQUIPMENT_CATALOG.length - 2)
    expect(nonGlia.every((d) => d.companion !== true)).toBe(true)
  })

  it('livingCompanions: owned glia in, owned structural out', () => {
    const owned = new Set(['eq-oligodendrocyte-companion-p3', 'eq-node-of-ranvier-p4'])
    expect(livingCompanions(owned).map((d) => d.equipmentId)).toEqual([
      'eq-oligodendrocyte-companion-p3',
    ])
  })

  it('livingCompanions: empty owned → empty; structural-only → empty', () => {
    expect(livingCompanions([]).length).toBe(0)
    expect(livingCompanions(['eq-node-of-ranvier-p4', 'eq-trace-glucose-p5']).length).toBe(0)
  })

  it('livingCompanions: rarest-first ordering (ranks non-decreasing)', () => {
    const ranks = livingCompanions(GLIA).map((d) => RANK[d.rarity])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('accepts an array or a Set of owned ids equivalently', () => {
    expect(livingCompanions(GLIA).map((d) => d.equipmentId)).toEqual(
      livingCompanions(new Set(GLIA)).map((d) => d.equipmentId),
    )
  })
})

describe('expedition-band companion marchers mirror the component data path (db → ids → defs)', () => {
  beforeEach(async () => {
    await db.equipment.clear()
  })

  it('owned glia + structural in the equipment table → only glia march', async () => {
    const now = Date.now()
    await db.equipment.bulkPut([
      { equipmentId: 'eq-oligodendrocyte-companion-p3', rarity: 'P3', obtainedAt: now, updatedAt: now },
      { equipmentId: 'eq-node-of-ranvier-p4', rarity: 'P4', obtainedAt: now, updatedAt: now },
    ])
    const ids = (await db.equipment.toArray()).map((r) => r.equipmentId)
    expect(livingCompanions(ids).map((d) => d.equipmentId)).toEqual([
      'eq-oligodendrocyte-companion-p3',
    ])
  })

  it('no companion owned → no companion marchers', async () => {
    const now = Date.now()
    await db.equipment.bulkPut([
      { equipmentId: 'eq-trace-glucose-p5', rarity: 'P5', obtainedAt: now, updatedAt: now },
    ])
    const ids = (await db.equipment.toArray()).map((r) => r.equipmentId)
    expect(livingCompanions(ids).length).toBe(0)
  })

  it('both glia owned → both march (rarest-first)', async () => {
    const now = Date.now()
    await db.equipment.bulkPut([
      { equipmentId: 'eq-astrocyte-glycogen-p3', rarity: 'P3', obtainedAt: now, updatedAt: now },
      { equipmentId: 'eq-oligodendrocyte-companion-p3', rarity: 'P3', obtainedAt: now, updatedAt: now },
    ])
    const ids = (await db.equipment.toArray()).map((r) => r.equipmentId)
    expect(livingCompanions(ids).map((d) => d.equipmentId).sort()).toEqual([...GLIA].sort())
  })
})
