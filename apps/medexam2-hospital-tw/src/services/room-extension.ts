/**
 * Room extension service — `redesign-hospital-economy` §8.3.
 *
 * Players spend revenue to buy ADDITIONAL rooms beyond the tier-default
 * roster. Locked at 診所; unlocks at 區域醫院 and above. Max extras per room
 * type are bounded by `ROOM_EXTENSION_COSTS[type].maxExtras` (3 outpatient /
 * 2 surgery / 2 ward).
 *
 * Atomic transaction: count existing extras → if under cap → deduct revenue
 * → insert new room row with deterministic id `extra-<type>-<seq>`.
 *
 * Extras follow the same RoomRow shape (baseRate=10, roomFacility=1.0,
 * facilityLevel=1, assignedDoctorId=null, slot=N+offset). They participate in
 * throughput / salary / facility upgrades identically to default rooms.
 */

import {
  ROOM_EXTENSION_COSTS,
  ROOM_EXTENSION_UNLOCKED_TIERS,
  type HospitalTier,
  type RoomType,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB, type RoomRow } from '../db/schema'

const EXTRA_PREFIX = 'extra-'

export type ExtensionResult =
  | { kind: 'success'; roomId: string; cost: number; newRoom: RoomRow }
  | {
      kind: 'aborted'
      reason: 'tier-locked' | 'max-extras' | 'insufficient-revenue'
      requiredRevenue: number
      currentExtras: number
      maxExtras: number
    }

function countExtras(rooms: RoomRow[], type: RoomType): number {
  return rooms.filter((r) => r.type === type && r.id.startsWith(`${EXTRA_PREFIX}${type}-`)).length
}

function nextExtraId(rooms: RoomRow[], type: RoomType): string {
  const used = new Set(
    rooms
      .filter((r) => r.id.startsWith(`${EXTRA_PREFIX}${type}-`))
      .map((r) => Number(r.id.slice(`${EXTRA_PREFIX}${type}-`.length)))
      .filter((n) => Number.isFinite(n)),
  )
  for (let i = 1; i <= 99; i++) {
    if (!used.has(i)) return `${EXTRA_PREFIX}${type}-${i}`
  }
  return `${EXTRA_PREFIX}${type}-${Date.now()}` // fallback (shouldn't hit)
}

function nextSlot(rooms: RoomRow[], type: RoomType): number {
  let max = 0
  for (const r of rooms) {
    if (r.type === type && r.slot > max) max = r.slot
  }
  return max + 1
}

export async function purchaseRoomExtension(type: RoomType): Promise<ExtensionResult> {
  const db = getHospitalDB()
  return db.transaction('rw', [db.rooms, db.gameCounters], async () => {
    const counters = await db.gameCounters.get('singleton')
    if (!counters) {
      return {
        kind: 'aborted',
        reason: 'tier-locked',
        requiredRevenue: 0,
        currentExtras: 0,
        maxExtras: 0,
      } as ExtensionResult
    }

    const tier: HospitalTier = counters.tier
    const tierUnlocked = ROOM_EXTENSION_UNLOCKED_TIERS.includes(tier)
    const config = ROOM_EXTENSION_COSTS[type]

    const allRooms = await db.rooms.toArray()
    const currentExtras = countExtras(allRooms, type)

    if (!tierUnlocked) {
      return {
        kind: 'aborted',
        reason: 'tier-locked',
        requiredRevenue: 0,
        currentExtras,
        maxExtras: config.maxExtras,
      }
    }
    if (currentExtras >= config.maxExtras) {
      return {
        kind: 'aborted',
        reason: 'max-extras',
        requiredRevenue: 0,
        currentExtras,
        maxExtras: config.maxExtras,
      }
    }
    if (counters.revenue < config.cost) {
      return {
        kind: 'aborted',
        reason: 'insufficient-revenue',
        requiredRevenue: config.cost,
        currentExtras,
        maxExtras: config.maxExtras,
      }
    }

    const newRoom: RoomRow = {
      id: nextExtraId(allRooms, type),
      type,
      baseRate: 10,
      roomFacility: 1.0,
      facilityLevel: 1,
      assignedDoctorId: null,
      slot: nextSlot(allRooms, type),
    }
    await db.rooms.put(newRoom)
    await db.gameCounters.put({ ...counters, revenue: counters.revenue - config.cost })

    return { kind: 'success', roomId: newRoom.id, cost: config.cost, newRoom }
  })
}
