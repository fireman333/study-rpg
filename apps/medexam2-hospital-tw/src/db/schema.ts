import Dexie, { type EntityTable } from 'dexie'
import { initialGachaStats, type GachaStats } from '@study-rpg/core'
import {
  RECRUITMENT_PITY_RULES,
  RECRUITMENT_WEIGHTS,
  INITIAL_TICKETS,
  TICKET_CAP,
  MS_PER_DAY,
  TIER_ROOMS,
  RARITY_POWER_MULTIPLIER,
  type HospitalTier,
  type Rarity,
  type Room,
} from '@study-rpg/content-medexam2-tw'

const RECRUITMENT_GACHA_CONFIG = {
  tiers: RECRUITMENT_WEIGHTS,
  pityRules: RECRUITMENT_PITY_RULES,
}

const ALL_SUBJECT_IDS = [
  '內科', '家醫科', '小兒科', '皮膚科', '神經內科', '精神科',
  '外科', '泌尿科', '骨科', '婦產科', '復健科', '眼科', '耳鼻喉科', '麻醉科',
] as const

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
  rollsSinceLast: Record<string, number>
}

export interface TicketsRow {
  id: 'global'
  available: number
  lastRefreshDay: number
}

export type RoomRow = Room

export interface GameCountersRow {
  id: 'singleton'
  revenue: number
  reputation: number
  lastTickAt: number
  tier: HospitalTier
  hasUsedStarterPull: boolean
}

export interface MasteryRow {
  subjectId: string
  correct: number
  total: number
}

export interface QuestionHistoryRow {
  questionId: string
  subjectId: string
  attempts: number
  correctCount: number
  lastAnsweredAt: number
  lastResult: 'correct' | 'wrong'
  nextDueAt: number | null
  interval: number
  easeFactor: number
}

export class HospitalDB extends Dexie {
  affinity!: EntityTable<AffinityRow, 'subjectId'>
  doctors!: EntityTable<DoctorRow, 'id'>
  gachaStats!: EntityTable<GachaStatsRow, 'id'>
  tickets!: EntityTable<TicketsRow, 'id'>
  rooms!: EntityTable<RoomRow, 'id'>
  gameCounters!: EntityTable<GameCountersRow, 'id'>
  mastery!: EntityTable<MasteryRow, 'subjectId'>
  questionHistory!: EntityTable<QuestionHistoryRow, 'questionId'>

  constructor(name = 'study-rpg-medexam2-hospital-tw') {
    super(name)
    this.version(1).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
    })
    this.version(2).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
    })
    this.version(3).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
    })
    // v4: adds mastery + questionHistory tables; gameCounters gains
    // `hasUsedStarterPull` (JS prop, not indexed). Existing dogfood saves get
    // force-flagged true in ensureSeed so the starter-pull UI never appears for them.
    this.version(4)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      })
      .upgrade(async (tx) => {
        // Backfill 14 default mastery rows for upgrading saves
        const masteryTable = tx.table<MasteryRow, string>('mastery')
        const existing = new Set((await masteryTable.toArray()).map((r) => r.subjectId))
        const missing = ALL_SUBJECT_IDS.filter((s) => !existing.has(s)).map((subjectId) => ({
          subjectId,
          correct: 0,
          total: 0,
        }))
        if (missing.length > 0) await masteryTable.bulkAdd(missing)
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

function makeStarterDoctor(subjectId: '內科' | '外科', seqIndex: number): DoctorRow {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `starter-${subjectId}-${Date.now()}-${seqIndex}`,
    subjectId,
    rarity: 'P5',
    powerMultiplier: RARITY_POWER_MULTIPLIER.P5,
    name: `${subjectId} 醫師 #1`,
    spriteKey: `doctor-${subjectId}-P5`,
    obtainedAt: Date.now() + seqIndex,
    assignedRoom: null,
  }
}

export async function ensureSeed(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction(
    'rw',
    [db.tickets, db.gachaStats, db.rooms, db.gameCounters, db.doctors, db.mastery],
    async () => {
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
      const roomCount = await db.rooms.count()
      if (roomCount === 0) {
        await db.rooms.bulkPut(TIER_ROOMS['診所'])
      }

      const doctorCount = await db.doctors.count()
      const counters = await db.gameCounters.get('singleton')

      if (!counters) {
        // Fresh save — seed 2 P5 starter doctors + starter pull available
        await db.gameCounters.put({
          id: 'singleton',
          revenue: 0,
          reputation: 0,
          lastTickAt: Date.now(),
          tier: '診所',
          hasUsedStarterPull: false,
        })
        if (doctorCount === 0) {
          await db.doctors.bulkPut([makeStarterDoctor('內科', 0), makeStarterDoctor('外科', 1)])
        }
      } else {
        const c = counters as Partial<GameCountersRow>
        const patches: Partial<GameCountersRow> = {}
        if (c.tier === undefined) patches.tier = '診所'
        // Recovery branch — see `fix-v3-to-v4-starter-pull-migration` design.md D4 matrix.
        // The original v3→v4 patcher unconditionally force-set hasUsedStarterPull=true,
        // which softlocked v3 saves whose doctors table was empty (no starter pull UI +
        // no doctors = unplayable). Branch on actual doctorCount instead of flag value:
        //   - doctorCount === 0  → seed 2 P5 starters + set flag false (recovery, fires
        //                          for both undefined and already-true flag victims;
        //                          self-terminating because doctorCount > 0 next boot)
        //   - doctorCount > 0    → preserve original intent: set flag true if undefined,
        //                          no-op if already defined
        if (doctorCount === 0) {
          await db.doctors.bulkPut([makeStarterDoctor('內科', 0), makeStarterDoctor('外科', 1)])
          patches.hasUsedStarterPull = false
        } else if (c.hasUsedStarterPull === undefined) {
          patches.hasUsedStarterPull = true
        }
        if (Object.keys(patches).length > 0) {
          await db.gameCounters.put({ ...counters, ...patches } as GameCountersRow)
        }
      }

      // Backfill mastery for any subject missing (safety net beyond upgrade hook)
      const existingMastery = new Set((await db.mastery.toArray()).map((r) => r.subjectId))
      const missing = ALL_SUBJECT_IDS.filter((s) => !existingMastery.has(s)).map((subjectId) => ({
        subjectId,
        correct: 0,
        total: 0,
      }))
      if (missing.length > 0) await db.mastery.bulkAdd(missing)
    },
  )
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
