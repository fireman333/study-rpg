/**
 * Non-reading event trigger — `rewire-hospital-events-to-non-reading-trigger`
 * (2026-05-26).
 *
 * Replaces the legacy tick-based event/ER roll loop (tick.ts pre-strip)
 * with an interaction-based probabilistic trigger. Two call sites:
 *
 *   - Hook A (quiz answer) — `maybeRollNonReadingEvent('quiz')` after any
 *     quiz answer commit + reward write (QuizModal, ER consult answer,
 *     mentor / training if applicable).
 *   - Hook B (route nav) — `maybeRollNonReadingEvent('nav')` from App.tsx's
 *     `useLocation` effect when the new pathname is in the player-content
 *     whitelist.
 *
 * Gate sequence (skip on first failure):
 *   1. Reading-session gate — skip if `currentSessionStartedAt !== null`
 *   2. Cooldown gate — skip if last interaction event < 3 min ago
 *   3. Mutex gate — skip if any popup already pending
 *
 * On pass, rolls **event first, ER second** (event has narrative priority;
 * ER's internal mutex naturally skips if event already wrote `pendingEventId`).
 *
 * TOCTOU mitigation:
 *   - **Single-flight guard**: module-level `inFlight` ref prevents the same
 *     async run from re-entering during awaits. Concurrent calls return the
 *     same promise.
 *   - **Final mutex re-check inside Dexie tx**: the write that sets
 *     `pendingEventId` re-reads counters inside a `rw` tx and aborts if
 *     state changed (mirrors the existing `maybeRollAndPersistERConsult`
 *     pattern in tick.ts).
 *
 * Player content whitelist is keyed off the actual App.tsx routes — when
 * adding a new player-content route, ALSO update `isPlayerContentRoute`
 * below or the new page will silently not trigger events.
 */

import {
  EVENT_DEFINITIONS,
  EVENT_ROLL_PROBABILITY,
  ER_ROLL_PROBABILITY,
  NON_READING_EVENT_COOLDOWN_MS,
  rollEvent,
  type RollEventResult,
  type ToastEventOutcome,
  type EventDefinition,
} from '@study-rpg/content-medexam2-tw'

import { getHospitalDB } from '../db/schema'
import { maybeRollAndPersistERConsult } from '../lib/tick'
import { hospitalEventToastQueue } from '../lib/hospital-event-toast-queue'

// ─── Whitelist ───────────────────────────────────────────────────────────────

/**
 * Set of pathnames where Hook B will attempt to fire a roll. Aligned to
 * `App.tsx`'s `<Route>` definitions (2026-05-26):
 *
 *   /, /hospital, /roster, /fate-cards, /bookmarks, /leaderboard, /achievements
 *
 * Intentional exclusions:
 *   - /study — focus mode; reading-session gate is defense-in-depth, but the
 *     whitelist is the primary mechanism preventing nav into /study from
 *     triggering. Same semantics whether session is started or not.
 *   - /training — redirect-only, journey ends at /roster which IS in the set.
 *   - /onboarding, /settings, /help — utility pages.
 *   - Any unknown path — fail-safe default off.
 *
 * **When adding a new player-content route to App.tsx, ALSO add it here.**
 */
const PLAYER_CONTENT_ROUTES: ReadonlySet<string> = new Set([
  '/',
  '/hospital',
  '/roster',
  '/fate-cards',
  '/bookmarks',
  '/leaderboard',
  '/achievements',
])

export function isPlayerContentRoute(pathname: string): boolean {
  // Strip query string before comparing — `/leaderboard?tab=foo` still counts.
  const path = pathname.split('?')[0]
  return PLAYER_CONTENT_ROUTES.has(path)
}

// ─── Gate helpers ────────────────────────────────────────────────────────────

export async function isInReadingSession(): Promise<boolean> {
  const db = getHospitalDB()
  const counters = await db.gameCounters.get('singleton')
  return (counters?.currentSessionStartedAt ?? null) !== null
}

export async function isInCooldown(): Promise<boolean> {
  const db = getHospitalDB()
  const counters = await db.gameCounters.get('singleton')
  const last = counters?.lastInteractionEventAt ?? 0
  return Date.now() - last < NON_READING_EVENT_COOLDOWN_MS
}

// ─── DEV-only telemetry ──────────────────────────────────────────────────────

interface EventStats {
  rollAttempts: Record<TriggerSource, number>
  eventFires: Record<TriggerSource, number>
  erFires: Record<TriggerSource, number>
  skipReadingSession: number
  skipCooldown: number
  skipMutex: number
  skipSingleFlight: number
}

const __stats: EventStats = {
  rollAttempts: { quiz: 0, nav: 0 },
  eventFires: { quiz: 0, nav: 0 },
  erFires: { quiz: 0, nav: 0 },
  skipReadingSession: 0,
  skipCooldown: 0,
  skipMutex: 0,
  skipSingleFlight: 0,
}

if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__events = {
    getStats: (): EventStats => ({
      ...__stats,
      rollAttempts: { ...__stats.rollAttempts },
      eventFires: { ...__stats.eventFires },
      erFires: { ...__stats.erFires },
    }),
    resetStats: (): void => {
      __stats.rollAttempts = { quiz: 0, nav: 0 }
      __stats.eventFires = { quiz: 0, nav: 0 }
      __stats.erFires = { quiz: 0, nav: 0 }
      __stats.skipReadingSession = 0
      __stats.skipCooldown = 0
      __stats.skipMutex = 0
      __stats.skipSingleFlight = 0
    },
  }
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export type TriggerSource = 'quiz' | 'nav'

export interface MaybeRollResult {
  /** Why the roll did not run (gate name) or null if rolls executed. */
  skipped: 'reading-session' | 'cooldown' | 'mutex' | 'single-flight' | null
  /** Modal/toast event that fired (null if no event). */
  eventFired: EventDefinition | null
  /** Toast outcome (null for modal or no-event). */
  toastOutcome: ToastEventOutcome | null
  /** True if an ER consult fired. */
  erFired: boolean
}

let inFlight: Promise<MaybeRollResult> | null = null

/**
 * Attempt to roll a hospital event and/or ER consult. Idempotent under
 * concurrent invocation thanks to the single-flight guard. Never throws —
 * errors land on console with the `[non-reading-trigger]` prefix.
 */
export async function maybeRollNonReadingEvent(
  source: TriggerSource,
): Promise<MaybeRollResult> {
  if (inFlight) {
    __stats.skipSingleFlight += 1
    return inFlight
  }

  inFlight = (async (): Promise<MaybeRollResult> => {
    __stats.rollAttempts[source] += 1
    try {
      if (await isInReadingSession()) {
        __stats.skipReadingSession += 1
        return { skipped: 'reading-session', eventFired: null, toastOutcome: null, erFired: false }
      }

      if (await isInCooldown()) {
        __stats.skipCooldown += 1
        return { skipped: 'cooldown', eventFired: null, toastOutcome: null, erFired: false }
      }

      const db = getHospitalDB()
      const counters = await db.gameCounters.get('singleton')
      if (!counters) {
        return { skipped: 'mutex', eventFired: null, toastOutcome: null, erFired: false }
      }
      if (
        (counters.pendingEventId ?? null) !== null ||
        (counters.erConsultActive ?? null) !== null
      ) {
        __stats.skipMutex += 1
        return { skipped: 'mutex', eventFired: null, toastOutcome: null, erFired: false }
      }

      // ─── Event roll (outer gate then inner table) ──────────────────────
      let eventFired: EventDefinition | null = null
      let toastOutcome: ToastEventOutcome | null = null

      if (Math.random() < EVENT_ROLL_PROBABILITY) {
        // Need throughput for the eligibility filter — recompute cheaply.
        const rooms = await db.rooms.toArray()
        const doctors = await db.doctors.toArray()
        const totalThroughput = computeTotalThroughput(rooms, doctors)

        // `lastResolvedAt: null` neutralises the legacy inner cooldown (per
        // design D6 — the new wall-clock `lastInteractionEventAt` is the
        // single source of truth and was already checked above).
        const result: RollEventResult = rollEvent({
          tier: counters.tier,
          reputation: counters.reputation,
          totalThroughput,
          lastResolvedAt: null,
          nowSessionMs: Date.now(),
          hasPendingEvent: false,
          rng: Math.random,
        })

        if (result.kind === 'triggered') {
          const persisted = await persistEventResult(result)
          if (persisted) {
            eventFired = result.event
            toastOutcome = result.toastOutcome
            __stats.eventFires[source] += 1
            // Toast UI: push to singleton queue so any subscribing component
            // (App.tsx) can surface the banner. Modal events render via
            // Dexie liveQuery on `pendingEventId` — no push needed for those.
            if (result.toastOutcome) {
              hospitalEventToastQueue.push({
                event: result.event,
                outcome: { ...result.toastOutcome },
              })
            }
          }
        }
      }

      // ─── ER roll (independent outer gate) ──────────────────────────────
      // Re-uses the existing tick.ts helper which carries the inner ER mutex
      // (settings.enabled / pendingEventId / erConsultActive / etc.) +
      // its own Dexie tx for the write. If the event roll above wrote
      // pendingEventId, this call naturally skips.
      let erFired = false
      if (Math.random() < ER_ROLL_PROBABILITY) {
        const active = await maybeRollAndPersistERConsult()
        if (active) {
          erFired = true
          __stats.erFires[source] += 1
          // Stamp cooldown on ER fire as well — answerERConsult / skipERConsult
          // will overwrite on resolve, but stamping at trigger time ensures the
          // dialog can't be followed by another nav-roll within the cooldown.
          await stampInteractionTimestamp()
        }
      }

      return { skipped: null, eventFired, toastOutcome, erFired }
    } catch (err) {
      console.error('[non-reading-trigger]', err)
      return { skipped: null, eventFired: null, toastOutcome: null, erFired: false }
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

/**
 * Compute totalThroughput from the loaded rooms + doctors arrays. Inlined here
 * to avoid pulling tick.ts internals — mirrors tick.ts:160–164 semantics.
 */
function computeTotalThroughput(
  rooms: { id: string; assignedDoctorId?: string | null; baseRate: number; roomFacility?: number }[],
  doctors: { id: string; assignedRoom?: string | null; powerMultiplier?: number; subjectId: string }[],
): number {
  // Local minimal port of computeThroughput; the production impl is in
  // `@study-rpg/core` but we only need a coarse number for the rollEvent
  // eligibility filter (10 + threshold check on 醫療糾紛). Re-use existing
  // engine helpers if they're already imported elsewhere — kept inline to
  // limit blast radius.
  let total = 0
  const doctorById = new Map(doctors.map((d) => [d.id, d]))
  for (const room of rooms) {
    if (!room.assignedDoctorId) continue
    const doctor = doctorById.get(room.assignedDoctorId)
    if (!doctor) continue
    const facility = room.roomFacility ?? 1
    const power = doctor.powerMultiplier ?? 1
    total += room.baseRate * facility * power
  }
  return total
}

/**
 * Inside a Dexie rw tx on `gameCounters` + `eventLog`:
 *   1. Re-read counters; abort if any mutex condition now fails
 *      (single-flight guard helps but cross-tab race could still hit).
 *   2. For modal events: write `pendingEventId` + `pendingEventTriggeredAt`.
 *      For toast events: apply outcome to reputation, write eventLog row,
 *      update `lastEventResolvedAt` + `lastInteractionEventAt`.
 *
 * Returns true if persisted, false if mutex re-check failed.
 */
async function persistEventResult(
  result: Extract<RollEventResult, { kind: 'triggered' }>,
): Promise<boolean> {
  const db = getHospitalDB()
  const now = Date.now()
  return db.transaction('rw', db.gameCounters, db.eventLog, async () => {
    const cur = await db.gameCounters.get('singleton')
    if (!cur) return false
    if (
      (cur.pendingEventId ?? null) !== null ||
      (cur.erConsultActive ?? null) !== null
    ) {
      // TOCTOU: another path beat us to a popup. Discard.
      return false
    }

    if (result.toastOutcome) {
      // Toast — apply immediately. Mirror tick.ts:289–311 (actual-delta after
      // floor clamp so eventLog reflects realized impact).
      const delta = result.toastOutcome
      const intentDelta =
        delta.kind === 'reputation-loss' ? -delta.amount : delta.amount
      const prevRep = cur.reputation
      const newRep = Math.max(0, prevRep + intentDelta)
      const actualRepDelta = newRep - prevRep
      await db.eventLog.add({
        triggeredAt: now,
        eventKey: result.event.id,
        outcome: delta.kind,
        reputationDelta: actualRepDelta,
        revenueDelta: 0,
      })
      await db.gameCounters.put({
        ...cur,
        reputation: newRep,
        lastEventResolvedAt: now,
        lastInteractionEventAt: now,
      })
    } else {
      // Modal — set pending state; resolve handler in services/event.ts
      // will stamp `lastInteractionEventAt` when player resolves.
      await db.gameCounters.put({
        ...cur,
        pendingEventId: result.event.id,
        pendingEventTriggeredAt: now,
      })
    }
    return true
  })
}

/**
 * Stamp `lastInteractionEventAt = now` on the gameCounters singleton.
 * Used when an ER consult fires (we want the cooldown to start at trigger
 * time, not just resolve time — otherwise a fired-but-unanswered ER lets
 * a follow-up nav fire another popup mid-dialog if the player ignores it).
 */
async function stampInteractionTimestamp(): Promise<void> {
  const db = getHospitalDB()
  const now = Date.now()
  await db.transaction('rw', db.gameCounters, async () => {
    const cur = await db.gameCounters.get('singleton')
    if (!cur) return
    await db.gameCounters.put({ ...cur, lastInteractionEventAt: now })
  })
}

// Silence "unused import" if EVENT_DEFINITIONS isn't directly referenced; it
// is re-exported by content-pack and used here implicitly via rollEvent's
// internal table. Kept as explicit dependency note.
void EVENT_DEFINITIONS
