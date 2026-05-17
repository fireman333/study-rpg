/**
 * Session-gated tick loop for the hospital tycoon engine (redesigned 2026-05-17
 * per `redesign-hospital-economy` change).
 *
 * Tick only accumulates progress while a study session is active. The session
 * controller (from content-pack `study-session.ts`) owns lifecycle + anti-cheat
 * (visibility + idle); this module owns DB writes + tier-upgrade evaluation.
 *
 * Spec: openspec/changes/redesign-hospital-economy/design.md D1/D5/D9
 *       openspec/specs/hospital-tycoon-engine/spec.md
 *       openspec/specs/clinic-level-up/spec.md
 */

import { useEffect, useState } from 'react'
import {
  MAX_OFFLINE_TICK_SEC,
  TIER_DIVERSIFICATION_REQUIREMENTS,
  TIER_ROOMS,
  TIER_UPGRADE_THRESHOLDS,
  applySalaryClamp,
  computeSalaryDrain,
  computeThroughput,
  countDistinctSubjectsAtRarity,
  createStudySessionController,
  getNextTier,
  rarityIsAtLeast,
  type HospitalTier,
  type StudySessionController,
  type StudySessionState,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

const TICK_INTERVAL_MS = 5000

export interface TickResult {
  deltaRevenueGross: number
  deltaSalary: number
  deltaReputation: number
  deltaStudyMinutes: number
  elapsedSec: number
  wasCapped: boolean
  upgradedTo?: HospitalTier
}

const ZERO_TICK: TickResult = {
  deltaRevenueGross: 0,
  deltaSalary: 0,
  deltaReputation: 0,
  deltaStudyMinutes: 0,
  elapsedSec: 0,
  wasCapped: false,
}

/**
 * Run one tick. No-op (returns zero deltas) unless a study session is active —
 * i.e. `gameCounters.currentSessionStartedAt !== null`.
 *
 * Math (per design D5):
 *   gross  = totalThroughput × elapsedMin  (assigned doctors only)
 *   salary = Σ allOwned.powerMultiplier × 4 × tierRate × elapsedMin
 *   rev    = max(0, currentRev + gross - salary)   (0-floor defensive)
 *   rep    = currentRep + totalThroughput × elapsedMin
 *   study  = currentStudy + elapsedMin             (monotonicCounters row)
 *
 * Tier upgrade fires when newReputation crosses threshold AND diversification
 * gate satisfied (distinctSubjectsAtRarity ≥ requiredCount, plus 1×P1 for the
 * 醫學中心 → 國家級教學醫院 transition).
 */
export async function runTick(): Promise<TickResult> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
    [db.rooms, db.doctors, db.gameCounters, db.monotonicCounters, db.retirementLog],
    async () => {
      const counters = await db.gameCounters.get('singleton')
      if (!counters) return ZERO_TICK
      if (counters.currentSessionStartedAt === null) {
        // Session not active — idle the tick, advance lastTickAt so a future
        // session resumption doesn't catch-up the dormant window.
        await db.gameCounters.put({ ...counters, lastTickAt: Date.now() })
        return ZERO_TICK
      }

      const now = Date.now()
      const rawDeltaSec = (now - counters.lastTickAt) / 1000
      const wasCapped = rawDeltaSec > MAX_OFFLINE_TICK_SEC
      const elapsedSec = Math.max(0, Math.min(rawDeltaSec, MAX_OFFLINE_TICK_SEC))
      if (elapsedSec <= 0) {
        await db.gameCounters.put({ ...counters, lastTickAt: now })
        return ZERO_TICK
      }

      const rooms = await db.rooms.toArray()
      const doctors = await db.doctors.toArray()
      const doctorMap = new Map(doctors.map((d) => [d.id, d]))

      let totalThroughput = 0
      for (const room of rooms) {
        const doctor = room.assignedDoctorId ? doctorMap.get(room.assignedDoctorId) ?? null : null
        totalThroughput += computeThroughput(room, doctor)
      }

      const elapsedMin = elapsedSec / 60
      const deltaRevenueGross = totalThroughput * elapsedMin
      const deltaSalary = computeSalaryDrain(doctors, counters.tier) * elapsedMin
      const deltaReputation = totalThroughput * elapsedMin
      const deltaStudyMinutes = elapsedMin

      const newRevenue = applySalaryClamp(counters.revenue, deltaRevenueGross, deltaSalary)
      const newReputation = counters.reputation + deltaReputation

      // Dual-gate tier upgrade: rep threshold AND diversification req
      let currentTier = counters.tier
      let upgradedTo: HospitalTier | undefined
      while (true) {
        const threshold = TIER_UPGRADE_THRESHOLDS[currentTier]
        if (threshold === null || newReputation < threshold) break
        const next = getNextTier(currentTier)
        if (!next) break
        // 國家級教學醫院 is top tier — no diversification requirement applies
        // (the while-loop already broke at the threshold === null check above).
        const req =
          currentTier === '國家級教學醫院'
            ? undefined
            : TIER_DIVERSIFICATION_REQUIREMENTS[currentTier]
        if (req) {
          // 24-hour grace per §5.8: recently-retired doctors still count toward
          // diversification, so players aren't punished for retiring a P5 mid-build.
          const graceCutoff = Date.now() - 24 * 60 * 60 * 1000
          const recentRetirees = await db.retirementLog
            .where('retiredAt')
            .above(graceCutoff)
            .toArray()
          const effectiveDoctors = [
            ...doctors,
            ...recentRetirees.map((r) => ({
              subjectId: r.subjectId,
              rarity: r.rarity,
            })),
          ]
          const distinct = countDistinctSubjectsAtRarity(effectiveDoctors, req.minRarity)
          if (distinct < req.requiredCount) break
          if (req.requireP1) {
            const hasP1 = effectiveDoctors.some((d) => rarityIsAtLeast(d.rarity, 'P1'))
            if (!hasP1) break
          }
        }
        const existingIds = new Set(rooms.map((r) => r.id))
        const newRooms = TIER_ROOMS[next].filter((r) => !existingIds.has(r.id))
        if (newRooms.length > 0) await db.rooms.bulkAdd(newRooms)
        currentTier = next
        upgradedTo = next
        if (import.meta.env.DEV) {
          console.debug('[tier-upgrade]', { from: counters.tier, to: currentTier, reputation: newReputation })
        }
      }

      await db.gameCounters.put({
        ...counters,
        revenue: newRevenue,
        reputation: newReputation,
        lastTickAt: now,
        tier: currentTier,
      })

      const mono = await db.monotonicCounters.get('singleton')
      if (mono) {
        await db.monotonicCounters.put({
          ...mono,
          totalStudyMinutes: mono.totalStudyMinutes + deltaStudyMinutes,
        })
      }

      return {
        deltaRevenueGross,
        deltaSalary,
        deltaReputation,
        deltaStudyMinutes,
        elapsedSec,
        wasCapped,
        upgradedTo,
      }
    },
  )
}

// ─── Study session singleton + React binding ──────────────────────────────────

let _controller: StudySessionController | null = null

/**
 * Singleton study-session controller. Lazy-created on first use; survives route
 * changes inside the SPA. Anti-cheat (visibility + idle 90s) handled by the
 * controller; this module wires lifecycle callbacks to DB writes.
 */
export function getStudySessionController(): StudySessionController {
  if (_controller) return _controller
  _controller = createStudySessionController({
    onStart: () => void markSessionStart(),
    onPause: () => void markSessionEnd(),
    onResume: () => void markSessionStart(),
    onStop: () => void markSessionEnd(),
  })
  return _controller
}

async function markSessionStart(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.gameCounters, async () => {
    const counters = await db.gameCounters.get('singleton')
    if (!counters) return
    const now = Date.now()
    await db.gameCounters.put({
      ...counters,
      currentSessionStartedAt: now,
      lastTickAt: now, // reset so resumed session doesn't catch-up dormant time
    })
  })
}

async function markSessionEnd(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.gameCounters, async () => {
    const counters = await db.gameCounters.get('singleton')
    if (!counters || counters.currentSessionStartedAt === null) return
    await db.gameCounters.put({
      ...counters,
      currentSessionStartedAt: null,
      lastSessionEndedAt: Date.now(),
    })
  })
}

/**
 * React hook bound to the study-session singleton. Schedules `runTick` every
 * 5s while state === 'active'; emits capped / upgrade callbacks. Returns the
 * current session state for UI rendering.
 */
export function useStudySessionTick(
  onCapped?: () => void,
  onUpgrade?: (tier: HospitalTier) => void,
): StudySessionState {
  const controller = getStudySessionController()
  const [state, setState] = useState<StudySessionState>(controller.getState())

  useEffect(() => {
    // Re-read state on mount in case controller transitioned before mount.
    setState(controller.getState())
    // Patch controller callbacks to also drive React state.
    // We rely on the singleton being created lazily before this hook mounts.
    // For state observation we poll every 250ms — lighter than wiring a custom
    // event emitter into the content-pack controller and adequate for UI.
    const stateInterval = setInterval(() => {
      const next = controller.getState()
      setState((prev) => (prev === next ? prev : next))
    }, 250)
    return () => clearInterval(stateInterval)
  }, [controller])

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined

    function tickOnce() {
      runTick()
        .then((result) => {
          if (import.meta.env.DEV) console.debug('[tick]', result)
          if (result.wasCapped && onCapped) onCapped()
          if (result.upgradedTo && onUpgrade) onUpgrade(result.upgradedTo)
        })
        .catch((err) => console.error('[tick] failed', err))
    }

    if (state === 'active') {
      tickOnce()
      intervalId = setInterval(tickOnce, TICK_INTERVAL_MS)
    }

    return () => {
      if (intervalId !== undefined) clearInterval(intervalId)
    }
  }, [state, onCapped, onUpgrade])

  return state
}
