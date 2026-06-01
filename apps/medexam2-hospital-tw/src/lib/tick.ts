/**
 * Session-gated tick loop for the hospital tycoon engine (redesigned 2026-05-17
 * per `redesign-hospital-economy` change).
 *
 * Tick only accumulates progress while a study session is active. The session
 * controller (from content-pack `study-session.ts`) owns lifecycle (Pomodoro-
 * style timer + visibility auto-pause / auto-resume); this module owns DB
 * writes + tier-upgrade evaluation.
 *
 * Spec: openspec/changes/redesign-hospital-economy/design.md D1/D5/D9
 *       openspec/specs/hospital-tycoon-engine/spec.md
 *       openspec/specs/clinic-level-up/spec.md
 *
 * 2026-05-26 — `rewire-hospital-events-to-non-reading-trigger`: removed the
 * in-tick event roll + ER consult roll. Rolls now live in
 * `services/non-reading-event-trigger.ts`, fired from quiz answers + page
 * navigations (Hook A + Hook B). Tick keeps housekeeping only — malpractice
 * 24-hr auto-resolve and ER consult expiry auto-skip — because those are
 * time-based and need a periodic timer regardless of player interaction.
 */

import { useEffect, useRef, useState } from 'react'
import {
  MALPRACTICE_AUTO_RESOLVE_MS,
  MALPRACTICE_PENALTY_REP,
  MAX_OFFLINE_TICK_SEC,
  TIER_DIVERSIFICATION_REQUIREMENTS,
  READING_SESSION_BUFF_MULTIPLIER,
  TIER_ROOMS,
  TIER_UPGRADE_THRESHOLDS,
  VIP_BOOST_MULTIPLIER,
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
import { shouldRollERConsult } from '@study-rpg/core'
import { getHospitalDB, type ERConsultActiveState } from '../db/schema'
import { formatYMD } from './util/date'
import {
  appendERConsultLog,
  getERConsultSettings,
  isERConsultExpired,
  rollNewERConsult,
} from '../services/er-consultation'
import { buildDoctorByRoom, getAssignedDoctor } from './room-doctor-map'
import { buildEquippedItemMap, getEquipmentBonus } from '../services/equipment'
import { EQUIPMENT_TICKET_CAP } from '../data/equipment'

/** Equipment tickets granted on tier upgrade (indexed by the tier you just reached). */
const TIER_UPGRADE_EQUIPMENT_TICKETS: Partial<Record<HospitalTier, number>> = {
  '區域醫院': 3,
  '醫學中心': 4,
  '國家級教學醫院': 5,
}

/** Study time (in minutes) between hourly equipment ticket grants. */
const EQUIPMENT_TICKET_STUDY_INTERVAL_MIN = 60
import { computeThroughputMultiplier, computeUniqueEquipmentCount } from './equipment'

const TICK_INTERVAL_MS = 5000

export interface TickResult {
  deltaRevenueGross: number
  deltaSalary: number
  deltaReputation: number
  deltaStudyMinutes: number
  elapsedSec: number
  wasCapped: boolean
  upgradedTo?: HospitalTier
  // Note: pre-2026-05-26 `toastEvent` / `modalEvent` / `shouldRollERConsult`
  // were emitted here by the in-tick roll loop. The
  // `rewire-hospital-events-to-non-reading-trigger` change moved rolls onto
  // interaction-based triggers in `services/non-reading-event-trigger.ts`,
  // so the tick result no longer carries them. The malpractice 24-hr
  // auto-resolve and ER consult expiry-auto-skip paths remain here (tick is
  // the right home for time-based housekeeping) but they mutate Dexie
  // directly without surfacing UI callbacks.
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

  // Achievement Phase 7 hook: capture prev stats before tick mutations.
  // Hot path — but tick runs every 5s, and buildAchievementStats is ~50-200ms.
  // Net overhead per tick: ~100-400ms. Acceptable for MVP; if dogfood shows
  // tick jank, optimize by only running achievement check when meaningful
  // delta detected (tier change / event resolved / monotonic counter bumped).
  const { buildAchievementStats, buildSyntheticPlayer } = await import(
    './achievement-stats'
  )
  const { checkAndUnlockAchievements } = await import(
    '../services/achievement-reward'
  )
  const prevStats = await buildAchievementStats()
  const synthPlayer = buildSyntheticPlayer()

  const result = await db.transaction(
    'rw',
    [
      db.rooms,
      db.doctors,
      db.gameCounters,
      db.monotonicCounters,
      db.retirementLog,
      db.eventLog,
      db.erConsultLog,
      db.equipment,
      db.equipmentTickets,
      db.hospitalEquipment,
      db.dailyStudyLog,
    ],
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
      const doctorByRoom = buildDoctorByRoom(doctors)
      const allEquipment = await db.equipment.toArray()
      const equippedItemMap = buildEquippedItemMap(allEquipment)

      let totalThroughput = 0
      for (const room of rooms) {
        const doctor = getAssignedDoctor(room.id, doctorByRoom)
        const equippedItem = doctor ? equippedItemMap.get(doctor.id) : undefined
        totalThroughput += computeThroughput(room, doctor, getEquipmentBonus(equippedItem, room.type))
      }

      // add-hospital-equipment-medexam2 (2026-05-24): apply equipment
      // throughput multiplier hospital-wide. Multiplier = 1 + Σ bonuses;
      // returns 1.0 when no equipment owned (no-op for fresh saves).
      const ownedEquipment = await db.hospitalEquipment.toArray()
      const equipmentThroughputMultiplier = computeThroughputMultiplier(ownedEquipment)

      const elapsedMin = elapsedSec / 60
      // VIP boost — doubles throughput when vipBoostUntil > now
      const vipActive = (counters.vipBoostUntil ?? 0) > now
      const effectiveThroughput = vipActive ? totalThroughput * VIP_BOOST_MULTIPLIER : totalThroughput
      // Tick only runs when session is active (early-returned above), so the
      // reading buff always applies — no branch needed.
      const idleAdjustedThroughput =
        effectiveThroughput * READING_SESSION_BUFF_MULTIPLIER * equipmentThroughputMultiplier
      const deltaRevenueGross = idleAdjustedThroughput * elapsedMin
      const deltaSalary = computeSalaryDrain(doctors, counters.tier) * elapsedMin
      const deltaReputation = idleAdjustedThroughput * elapsedMin
      const deltaStudyMinutes = elapsedMin

      let newRevenue = applySalaryClamp(counters.revenue, deltaRevenueGross, deltaSalary)
      let newReputation = counters.reputation + deltaReputation

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
            // P1 anchor uses live doctors only — 24h grace does NOT apply here.
            // Spec: hospital-finances "Retiring only P1 immediately fails requireP1 despite 24h grace"
            const hasP1 = doctors.some((d) => rarityIsAtLeast(d.rarity, 'P1'))
            if (!hasP1) break
          }
        }
        // add-hospital-equipment-medexam2 (2026-05-24): T3 → T4 third gate —
        // ≥ 3 unique equipment installed at level ≥ 1. Counts unique IDs, not
        // total levels (5 L3 of same equipment = 1, not 5). Lower transitions
        // unaffected.
        if (currentTier === '醫學中心') {
          if (computeUniqueEquipmentCount(ownedEquipment) < 3) break
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

      // ─── Time-based housekeeping (no rolling) ────────────────────────────
      // Rolls moved to services/non-reading-event-trigger.ts; tick is now
      // limited to housekeeping that legitimately wants periodic timer
      // attention (malpractice 24-hr auto-resolve, ER consult expiry).
      let pendingEventId = counters.pendingEventId ?? null
      let pendingEventTriggeredAt = counters.pendingEventTriggeredAt ?? null
      let lastEventResolvedAt = counters.lastEventResolvedAt ?? null
      let lastInteractionEventAt = counters.lastInteractionEventAt ?? null

      // Auto-resolve stuck 醫療糾紛 after MALPRACTICE_AUTO_RESOLVE_MS — applies the
      // accept-penalty branch (lose rep, no revenue cost) so the player can't be
      // stuck forever on an unsolved event.
      if (
        pendingEventId === 'medical-malpractice' &&
        pendingEventTriggeredAt !== null &&
        now - pendingEventTriggeredAt >= MALPRACTICE_AUTO_RESOLVE_MS
      ) {
        // actual-delta after floor clamp — parity with player-action branch
        // (services/event.ts:85-105)
        const prevRep = newReputation
        newReputation = Math.max(0, prevRep - MALPRACTICE_PENALTY_REP)
        const actualRepDelta = newReputation - prevRep
        await db.eventLog.add({
          triggeredAt: pendingEventTriggeredAt,
          eventKey: 'medical-malpractice',
          outcome: 'auto-resolved-penalty',
          reputationDelta: actualRepDelta,
          revenueDelta: 0,
        })
        pendingEventId = null
        pendingEventTriggeredAt = null
        lastEventResolvedAt = now
        lastInteractionEventAt = now
      }

      // ─── ER consult expiry auto-skip (housekeeping only) ─────────────────
      // The actual roll for a NEW consult is no longer triggered by tick —
      // see services/non-reading-event-trigger.ts. Expiry auto-skip still
      // belongs here because it's purely time-based: a consult that the
      // player ignores for ER_CONSULT_AUTO_SKIP_MS expires regardless of
      // whether they're interacting.
      let erConsultActive = counters.erConsultActive ?? null

      if (erConsultActive && isERConsultExpired(erConsultActive, now)) {
        await appendERConsultLog({
          triggeredAt: erConsultActive.triggeredAt,
          resolvedAt: now,
          subjectId: erConsultActive.subjectId,
          questionId: erConsultActive.questionId,
          resolution: 'auto-skipped',
          rewardGained: 0,
          reactionTimeMs: null,
        })
        erConsultActive = null
        // Auto-skip is a resolution event for cooldown purposes — stamp
        // so the next nav doesn't fire a popup the moment the dialog clears.
        lastInteractionEventAt = now
      }

      await db.gameCounters.put({
        ...counters,
        revenue: newRevenue,
        reputation: newReputation,
        lastTickAt: now,
        tier: currentTier,
        pendingEventId,
        pendingEventTriggeredAt,
        lastEventResolvedAt,
        lastInteractionEventAt,
        erConsultActive,
      })

      let studyTicketsEarned = 0
      const mono = await db.monotonicCounters.get('singleton')
      if (mono) {
        const newTotalStudyMinutes = mono.totalStudyMinutes + deltaStudyMinutes
        const lastMilestone = mono.lastEquipmentTicketStudyMinutes ?? mono.totalStudyMinutes
        studyTicketsEarned = Math.floor(
          (newTotalStudyMinutes - lastMilestone) / EQUIPMENT_TICKET_STUDY_INTERVAL_MIN,
        )
        const newLastMilestone =
          studyTicketsEarned > 0
            ? lastMilestone + studyTicketsEarned * EQUIPMENT_TICKET_STUDY_INTERVAL_MIN
            : lastMilestone

        await db.monotonicCounters.put({
          ...mono,
          totalStudyMinutes: newTotalStudyMinutes,
          lastEquipmentTicketStudyMinutes: newLastMilestone,
          totalStudyMinutes: mono.totalStudyMinutes + deltaStudyMinutes,
          // Achievement Phase 7: bump tierUpgradeCount when tier changed.
          // Stays unchanged across ticks that don't upgrade.
          tierUpgradeCount: upgradedTo
            ? (mono.tierUpgradeCount ?? 0) + 1
            : (mono.tierUpgradeCount ?? 0),
        })
      }

      // Grant equipment tickets (study milestone + tier upgrade) in a single write
      const tierBundle = upgradedTo ? (TIER_UPGRADE_EQUIPMENT_TICKETS[upgradedTo] ?? 0) : 0
      const totalEquipmentGrant = studyTicketsEarned + tierBundle
      if (totalEquipmentGrant > 0) {
        const eqTickets = await db.equipmentTickets.get('global')
        if (eqTickets) {
          await db.equipmentTickets.put({
            ...eqTickets,
            available: Math.min(EQUIPMENT_TICKET_CAP, eqTickets.available + totalEquipmentGrant),
          })
        }
      // tidy-tabs-add-study-stats-medexam2: per-day study-minute snapshot for
      // the 成就 → 統計 sub-tab charts. Forward-only — pre-v18 lifetime
      // minutes are NOT backfilled here; the stats UI surfaces a residual
      // chip showing (totalStudyMinutes − Σ dailyStudyLog.minutesAdded).
      if (deltaStudyMinutes > 0) {
        const today = formatYMD(new Date(now))
        const existingDay = await db.dailyStudyLog.get(today)
        await db.dailyStudyLog.put({
          date: today,
          minutesAdded: (existingDay?.minutesAdded ?? 0) + deltaStudyMinutes,
          updatedAt: now,
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

  // Achievement check post-tx: catches study-time, tier-upgrade, and event-
  // resolved (eventLog write inside tx is visible to next stat scan) milestones.
  try {
    const nextStats = await buildAchievementStats()
    await checkAndUnlockAchievements(synthPlayer, prevStats, synthPlayer, nextStats)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[tick] achievement check failed:', err)
  }

  return result
}

/**
 * Phase 2 of ER consult roll — runs OUTSIDE the main tick tx because the
 * picker calls `loadSubjectQuestionIds` which awaits a content-pack fetch.
 * Re-checks mutex (settings + pendingEventId + erConsultActive) inside its own
 * tx so any state change between Phase 1 and Phase 2 wins (e.g. toggle-off).
 * Returns the new active state if successfully spawned, null otherwise.
 */
export async function maybeRollAndPersistERConsult(): Promise<ERConsultActiveState | null> {
  const db = getHospitalDB()
  const now = Date.now()
  const settings = await getERConsultSettings()
  // Mutex precheck (cheap) before the expensive content-pack load
  const counters = await db.gameCounters.get('singleton')
  if (!counters) return null
  if (
    !shouldRollERConsult({
      currentHospitalEventPending: (counters.pendingEventId ?? null) !== null,
      erConsultActive: (counters.erConsultActive ?? null) !== null,
      mentorDialogOpen: false,   // 二階 has no mentor-daily
      quizSessionActive: false,  // not tracked in 二階 (sibling modal OK)
      readingSessionRunning: false, // tick only runs when session active by design
      erConsultEnabled: settings.enabled,
    })
  ) {
    return null
  }

  const newActive = await rollNewERConsult(now)
  if (!newActive) return null

  return db.transaction('rw', db.gameCounters, async () => {
    const cur = await db.gameCounters.get('singleton')
    if (!cur) return null
    // Final mutex re-check inside tx — toggle-off / pending event / another roll
    // beating us all win and we discard the freshly-picked active.
    if (
      cur.pendingEventId !== null ||
      (cur.erConsultActive ?? null) !== null
    ) {
      return null
    }
    await db.gameCounters.put({ ...cur, erConsultActive: newActive })
    return newActive
  })
}

// ─── Study session singleton + React binding ──────────────────────────────────

let _controller: StudySessionController | null = null

/**
 * Singleton study-session controller. Lazy-created on first use; survives route
 * changes inside the SPA. Visibility auto-pause / auto-resume handled by the
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
  const cbRef = useRef({ onCapped, onUpgrade })
  cbRef.current = { onCapped, onUpgrade }

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
          const { onCapped, onUpgrade } = cbRef.current
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
  }, [state])

  return state
}
