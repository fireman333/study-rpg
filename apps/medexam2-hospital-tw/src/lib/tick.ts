/**
 * Tick loop for the hospital tycoon engine.
 *
 * Every 5 seconds while the tab is visible, accumulate
 *   throughput = sum over assigned rooms of (baseRate × powerMultiplier × roomFacility)
 * into revenue + reputation counters, capped at MAX_OFFLINE_TICK_SEC of catch-up.
 *
 * After the reputation write, check if any tier upgrade should fire. Tier
 * transitions are atomic with the reputation increment that caused them.
 *
 * Spec: openspec/specs/hospital-tycoon-engine/spec.md
 *       openspec/specs/clinic-level-up/spec.md
 */

import { useEffect } from 'react'
import {
  MAX_OFFLINE_TICK_SEC,
  TIER_ROOMS,
  TIER_UPGRADE_THRESHOLDS,
  computeThroughput,
  getNextTier,
  type HospitalTier,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

const TICK_INTERVAL_MS = 5000

export interface TickResult {
  deltaRevenue: number
  deltaReputation: number
  elapsedSec: number
  wasCapped: boolean
  upgradedTo?: HospitalTier
}

export async function runTick(): Promise<TickResult> {
  const db = getHospitalDB()
  return db.transaction('rw', db.rooms, db.doctors, db.gameCounters, async () => {
    const counters = await db.gameCounters.get('singleton')
    if (!counters) {
      // ensureSeed should always create it, but guard for race conditions
      await db.gameCounters.put({
        id: 'singleton',
        revenue: 0,
        reputation: 0,
        lastTickAt: Date.now(),
        tier: '診所',
      })
      return { deltaRevenue: 0, deltaReputation: 0, elapsedSec: 0, wasCapped: false }
    }

    const now = Date.now()
    const rawDeltaSec = (now - counters.lastTickAt) / 1000
    const wasCapped = rawDeltaSec > MAX_OFFLINE_TICK_SEC
    const elapsedSec = Math.max(0, Math.min(rawDeltaSec, MAX_OFFLINE_TICK_SEC))

    let totalThroughput = 0
    if (elapsedSec > 0) {
      const rooms = await db.rooms.toArray()
      const doctors = await db.doctors.toArray()
      const doctorMap = new Map(doctors.map((d) => [d.id, d]))
      for (const room of rooms) {
        const doctor = room.assignedDoctorId ? doctorMap.get(room.assignedDoctorId) ?? null : null
        totalThroughput += computeThroughput(room, doctor)
      }
    }

    const deltaRevenue = (totalThroughput * elapsedSec) / 60
    // Idle tick = 70% of reputation; per-Q hook in reputation.ts adds the other 30%.
    const deltaReputation = deltaRevenue * 0.7

    const newRevenue = counters.revenue + deltaRevenue
    const newReputation = counters.reputation + deltaReputation

    // Tier upgrade: loop in case catch-up crosses multiple thresholds at once.
    let currentTier = counters.tier
    let upgradedTo: HospitalTier | undefined
    while (true) {
      const threshold = TIER_UPGRADE_THRESHOLDS[currentTier]
      if (threshold === null || newReputation < threshold) break
      const next = getNextTier(currentTier)
      if (!next) break
      // Insert only rooms whose ids don't yet exist — preserves any existing
      // assignedDoctorId / roomFacility customizations on lower-tier rooms.
      const existingIds = new Set((await db.rooms.toArray()).map((r) => r.id))
      const newRooms = TIER_ROOMS[next].filter((r) => !existingIds.has(r.id))
      if (newRooms.length > 0) {
        await db.rooms.bulkAdd(newRooms)
      }
      currentTier = next
      upgradedTo = next
      if (import.meta.env.DEV) {
        console.debug('[tier-upgrade]', { from: counters.tier, to: currentTier, reputation: newReputation, added: newRooms.map((r) => r.id) })
      }
    }

    await db.gameCounters.put({
      ...counters,
      revenue: newRevenue,
      reputation: newReputation,
      lastTickAt: now,
      tier: currentTier,
    })

    return { deltaRevenue, deltaReputation, elapsedSec, wasCapped, upgradedTo }
  })
}

/**
 * Mount once at app root. Runs runTick() on mount, on visibility return,
 * and every 5s while tab is visible.
 *
 * onCapped fires whenever a tick was capped at the offline limit.
 * onUpgrade fires whenever a tier upgrade was committed in a tick.
 */
export function useTickLoop(
  onCapped?: () => void,
  onUpgrade?: (tier: HospitalTier) => void,
): void {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined

    function tickOnce() {
      runTick()
        .then((result) => {
          if (import.meta.env.DEV) {
            console.debug('[tick]', result)
          }
          if (result.wasCapped && onCapped) onCapped()
          if (result.upgradedTo && onUpgrade) onUpgrade(result.upgradedTo)
        })
        .catch((err) => console.error('[tick] failed', err))
    }

    function start() {
      if (intervalId !== undefined) return
      tickOnce()
      intervalId = setInterval(tickOnce, TICK_INTERVAL_MS)
    }

    function stop() {
      if (intervalId !== undefined) {
        clearInterval(intervalId)
        intervalId = undefined
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [onCapped, onUpgrade])
}
