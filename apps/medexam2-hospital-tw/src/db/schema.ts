import Dexie, { type EntityTable } from 'dexie'
import { initialGachaStats, type GachaStats } from '@study-rpg/core'
import {
  RECRUITMENT_PITY_RULES,
  RECRUITMENT_WEIGHTS,
  INITIAL_TICKETS,
  TICKET_CAP,
  MS_PER_DAY,
  type Rarity,
} from '@study-rpg/content-medexam2-tw'

const RECRUITMENT_GACHA_CONFIG = {
  tiers: RECRUITMENT_WEIGHTS,
  pityRules: RECRUITMENT_PITY_RULES,
}

export interface AffinityRow {
  subjectId: string
  correctCount: number
}

export interface DoctorRow {
  id: string
  subjectId: string
  rarity: Rarity
  powerMultiplier: number
  name: string
  spriteKey: string
  obtainedAt: number
  assignedRoom: string | null
}

export interface GachaStatsRow {
  id: 'global'
  totalRolls: number
  /** JSON-stringified Record<string, number>; Dexie indexes plain props only. */
  rollsSinceLast: Record<string, number>
}

export interface TicketsRow {
  id: 'global'
  available: number
  lastRefreshDay: number
}

export class HospitalDB extends Dexie {
  affinity!: EntityTable<AffinityRow, 'subjectId'>
  doctors!: EntityTable<DoctorRow, 'id'>
  gachaStats!: EntityTable<GachaStatsRow, 'id'>
  tickets!: EntityTable<TicketsRow, 'id'>

  constructor(name = 'study-rpg-medexam2-hospital-tw') {
    super(name)
    this.version(1).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
    })
  }
}

let _db: HospitalDB | undefined
export function getHospitalDB(): HospitalDB {
  if (!_db) _db = new HospitalDB()
  return _db
}

function currentEpochDay(): number {
  return Math.floor(Date.now() / MS_PER_DAY)
}

// ─── Bootstrap & daily refresh ───────────────────────────────────────────────

export async function ensureSeed(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.tickets, db.gachaStats, async () => {
    const t = await db.tickets.get('global')
    if (!t) {
      await db.tickets.put({
        id: 'global',
        available: INITIAL_TICKETS,
        lastRefreshDay: currentEpochDay(),
      })
    }
    const s = await db.gachaStats.get('global')
    if (!s) {
      const init = initialGachaStats(RECRUITMENT_GACHA_CONFIG)
      await db.gachaStats.put({ id: 'global', ...init })
    }
  })
}

export async function refreshDailyTickets(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.tickets, async () => {
    const t = await db.tickets.get('global')
    if (!t) return
    const today = currentEpochDay()
    const delta = today - t.lastRefreshDay
    if (delta <= 0) return
    const grant = Math.min(delta, TICKET_CAP - t.available)
    await db.tickets.put({
      ...t,
      available: Math.min(TICKET_CAP, t.available + Math.max(0, grant)),
      lastRefreshDay: today,
    })
  })
}

// ─── Affinity helpers ────────────────────────────────────────────────────────

export async function getAffinity(subjectId: string): Promise<number> {
  const row = await getHospitalDB().affinity.get(subjectId)
  return row?.correctCount ?? 0
}

export async function incrementAffinity(subjectId: string): Promise<number> {
  const db = getHospitalDB()
  return db.transaction('rw', db.affinity, async () => {
    const row = await db.affinity.get(subjectId)
    const next = (row?.correctCount ?? 0) + 1
    await db.affinity.put({ subjectId, correctCount: next })
    return next
  })
}

// ─── Gacha stats helpers ─────────────────────────────────────────────────────

export async function getGachaStats(): Promise<GachaStats> {
  const row = await getHospitalDB().gachaStats.get('global')
  if (!row) return initialGachaStats(RECRUITMENT_GACHA_CONFIG)
  return { totalRolls: row.totalRolls, rollsSinceLast: { ...row.rollsSinceLast } }
}
