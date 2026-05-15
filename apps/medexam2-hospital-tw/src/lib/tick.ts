/**
 * Tick loop for the hospital tycoon engine.
 *
 * Every 5 seconds while the tab is visible, accumulate
 *   throughput = sum over assigned rooms of (baseRate × powerMultiplier × roomFacility)
 * into revenue + reputation counters, capped at MAX_OFFLINE_TICK_SEC of catch-up.
 *
 * Spec: openspec/specs/hospital-tycoon-engine/spec.md
 */

import { useEffect } from 'react'
import { MAX_OFFLINE_TICK_SEC, computeThroughput } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

const TICK_INTERVAL_MS = 5000

export interface TickResult {
  deltaRevenue: number
  deltaReputation: number
  elapsedSec: number
  wasCapped: boolean
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
    const deltaReputation = deltaRevenue // 1:1 baseline; wire-hospital-reputation will refine

    await db.gameCounters.put({
      ...counters,
      revenue: counters.revenue + deltaRevenue,
      reputation: counters.reputation + deltaReputation,
      lastTickAt: now,
    })

    return { deltaRevenue, deltaReputation, elapsedSec, wasCapped }
  })
}

/**
 * Mount once at app root. Runs runTick() on mount, on visibility return,
 * and every 5s while tab is visible.
 *
 * onCapped fires whenever a tick was capped at the offline limit, so the UI
 * can surface a one-time notification.
 */
export function useTickLoop(onCapped?: () => void): void {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined

    function tickOnce() {
      runTick()
        .then((result) => {
          if (import.meta.env.DEV) {
            console.debug('[tick]', result)
          }
          if (result.wasCapped && onCapped) onCapped()
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
  }, [onCapped])
}
