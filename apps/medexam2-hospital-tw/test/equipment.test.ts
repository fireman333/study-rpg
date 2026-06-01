import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rarity } from '@study-rpg/content-medexam2-tw'
import type {
  EquipmentMaterialsRow,
  EquipmentRow,
  GameCountersRow,
} from '../src/db/schema'

class MemoryTable<T extends { id: string }> {
  rows = new Map<string, T>()

  async get(id: string): Promise<T | undefined> {
    return this.rows.get(id)
  }

  async put(row: T): Promise<void> {
    this.rows.set(row.id, row)
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id)
  }

  async toArray(): Promise<T[]> {
    return Array.from(this.rows.values())
  }
}

type MockDB = {
  equipment: MemoryTable<EquipmentRow>
  equipmentMaterials: MemoryTable<EquipmentMaterialsRow>
  gameCounters: MemoryTable<GameCountersRow>
  transaction: <T>(
    mode: 'rw',
    tables: unknown,
    callback: () => Promise<T>,
  ) => Promise<T>
}

const mockState = {
  db: {
    equipment: new MemoryTable<EquipmentRow>(),
    equipmentMaterials: new MemoryTable<EquipmentMaterialsRow>(),
    gameCounters: new MemoryTable<GameCountersRow>(),
    transaction: async <T>(_mode: 'rw', _tables: unknown, callback: () => Promise<T>) => callback(),
  } satisfies MockDB,
}

vi.doMock('../src/db/schema', () => ({
  getHospitalDB: () => mockState.db,
}))

const {
  dismantleEquipment,
  getEquipmentBonus,
  upgradeEquipment,
} = await import('../src/services/equipment')

function makeEquipment(
  rarity: Rarity,
  overrides: Partial<EquipmentRow> = {},
): EquipmentRow {
  return {
    id: 'eq-1',
    definitionId: 'standard-stethoscope',
    category: 'stethoscope',
    rarity,
    obtainedAt: 1,
    equippedDoctorId: null,
    ...overrides,
  }
}

function makeCounters(revenue: number): GameCountersRow {
  return {
    id: 'singleton',
    revenue,
    reputation: 0,
    lastTickAt: 1,
    tier: '診所',
    hasUsedStarterPull: false,
    currentSessionStartedAt: null,
    lastSessionEndedAt: null,
    tutorial: { completedSteps: {}, firstVisit: {}, firedTips: {} },
  }
}

describe('equipment rarity upgrades', () => {
  beforeEach(async () => {
    mockState.db.equipment.rows.clear()
    mockState.db.equipmentMaterials.rows.clear()
    mockState.db.gameCounters.rows.clear()
    await mockState.db.equipmentMaterials.put({ id: 'global', parts: 0 })
    await mockState.db.gameCounters.put(makeCounters(0))
  })

  it('upgrades a P5 stethoscope to the P4 definition and spends resources', async () => {
    await mockState.db.equipment.put(makeEquipment('P5'))
    await mockState.db.equipmentMaterials.put({ id: 'global', parts: 25 })
    await mockState.db.gameCounters.put(makeCounters(1_000))

    const result = await upgradeEquipment('eq-1')

    expect(result.kind).toBe('success')
    const item = await mockState.db.equipment.get('eq-1')
    expect(item?.id).toBe('eq-1')
    expect(item?.rarity).toBe('P4')
    expect(item?.definitionId).toBe('advanced-stethoscope')
    expect((await mockState.db.equipmentMaterials.get('global'))?.parts).toBe(0)
    expect((await mockState.db.gameCounters.get('singleton'))?.revenue).toBe(0)
  })

  it('keeps equipment bonus rarity-derived after upgrade', async () => {
    await mockState.db.equipment.put(makeEquipment('P5'))
    await mockState.db.equipmentMaterials.put({ id: 'global', parts: 25 })
    await mockState.db.gameCounters.put(makeCounters(1_000))

    const before = getEquipmentBonus(makeEquipment('P5'), 'outpatient')
    await upgradeEquipment('eq-1')
    const after = getEquipmentBonus(await mockState.db.equipment.get('eq-1'), 'outpatient')

    expect(before).toBe(1.05)
    expect(after).toBe(1.10)
  })

  it('blocks terminal P1 upgrades without spending resources', async () => {
    await mockState.db.equipment.put(makeEquipment('P1', { definitionId: 'oracle-stethoscope' }))
    await mockState.db.equipmentMaterials.put({ id: 'global', parts: 600 })
    await mockState.db.gameCounters.put(makeCounters(125_000))

    const result = await upgradeEquipment('eq-1')

    expect(result).toMatchObject({ kind: 'aborted', reason: 'terminal-rarity' })
    expect((await mockState.db.equipment.get('eq-1'))?.rarity).toBe('P1')
    expect((await mockState.db.equipmentMaterials.get('global'))?.parts).toBe(600)
    expect((await mockState.db.gameCounters.get('singleton'))?.revenue).toBe(125_000)
  })

  it('blocks upgrades when parts are insufficient', async () => {
    await mockState.db.equipment.put(makeEquipment('P4', { definitionId: 'advanced-stethoscope' }))
    await mockState.db.equipmentMaterials.put({ id: 'global', parts: 74 })
    await mockState.db.gameCounters.put(makeCounters(5_000))

    const result = await upgradeEquipment('eq-1')

    expect(result).toMatchObject({
      kind: 'aborted',
      reason: 'insufficient-parts',
      requiredParts: 75,
      requiredRevenue: 5_000,
    })
    expect((await mockState.db.equipment.get('eq-1'))?.rarity).toBe('P4')
  })

  it('blocks upgrades when revenue is insufficient', async () => {
    await mockState.db.equipment.put(makeEquipment('P3', { definitionId: 'cardiology-stethoscope' }))
    await mockState.db.equipmentMaterials.put({ id: 'global', parts: 200 })
    await mockState.db.gameCounters.put(makeCounters(24_999))

    const result = await upgradeEquipment('eq-1')

    expect(result).toMatchObject({
      kind: 'aborted',
      reason: 'insufficient-revenue',
      requiredParts: 200,
      requiredRevenue: 25_000,
    })
    expect((await mockState.db.equipmentMaterials.get('global'))?.parts).toBe(200)
  })
})

describe('equipment dismantling', () => {
  beforeEach(async () => {
    mockState.db.equipment.rows.clear()
    mockState.db.equipmentMaterials.rows.clear()
    mockState.db.gameCounters.rows.clear()
    await mockState.db.equipmentMaterials.put({ id: 'global', parts: 0 })
  })

  it('blocks dismantling equipped items', async () => {
    await mockState.db.equipment.put(makeEquipment('P4', { equippedDoctorId: 'doctor-1' }))

    const result = await dismantleEquipment('eq-1')

    expect(result).toMatchObject({ kind: 'aborted', reason: 'equipped' })
    expect(await mockState.db.equipment.get('eq-1')).toBeDefined()
    expect((await mockState.db.equipmentMaterials.get('global'))?.parts).toBe(0)
  })

  it('deletes unequipped items and grants rarity-based parts', async () => {
    await mockState.db.equipment.put(makeEquipment('P2', { definitionId: 'master-diagnostic-stethoscope' }))
    await mockState.db.equipmentMaterials.put({ id: 'global', parts: 5 })

    const result = await dismantleEquipment('eq-1')

    expect(result).toMatchObject({ kind: 'success', partsGained: 200, rarity: 'P2' })
    expect(await mockState.db.equipment.get('eq-1')).toBeUndefined()
    expect((await mockState.db.equipmentMaterials.get('global'))?.parts).toBe(205)
  })
})
