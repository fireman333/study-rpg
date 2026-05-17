/**
 * Special events for the 二階 medexam2 content pack.
 *
 * Locked by `redesign-hospital-economy` (2026-05-17). Event base rates +
 * tier/throughput conditions are LITERALS per design D6 spec
 * `hospital-events`. `rollEvent` is a PURE function — caller threads RNG and
 * current game state in, the function returns either a triggered event spec
 * or `null` (no event this roll).
 *
 * Reputation scaling: effective rate = `baseRate × clamp(reputation / 100k,
 * 0.5, 3.0)`, capped at 0.3 per roll. Higher reputation → more events of all
 * polarities. Combined negative-rep event rate stays ≤ 5% at any reputation.
 *
 * UI classification (modal vs toast) is declared per-event so the app layer
 * can branch without knowing event semantics.
 */

import type { HospitalTier } from './clinic-tiers'

export type EventId =
  | 'medical-malpractice'
  | 'negative-news'
  | 'peer-criticism'
  | 'vip-patient'
  | 'emergency-shift'
  | 'audit-event'
  | 'research-award'

export type EventPolarity = 'positive' | 'negative' | 'mixed'

/** Modal = actionable (player choice); toast = passive (auto-applies). */
export type EventUiKind = 'modal' | 'toast'

export interface EventDefinition {
  id: EventId
  /** Display label (Traditional Chinese, parallels spec table). */
  label: string
  polarity: EventPolarity
  uiKind: EventUiKind
  /** Base per-roll probability (before reputation scaling and the 0.3 cap). */
  baseRate: number
  /** Minimum hospital tier required to roll this event. */
  minTier: HospitalTier
  /** Optional minimum totalThroughput condition (used by 醫療糾紛). */
  minThroughput?: number
}

/**
 * Trigger rate per roll, BEFORE reputation scaling. Spec table values from
 * `hospital-events` Req 1 in design D6.
 */
export const EVENT_TRIGGER_RATES: Record<EventId, number> = {
  'medical-malpractice': 0.08,
  'negative-news': 0.03,
  'peer-criticism': 0.02,
  'vip-patient': 0.05,
  'emergency-shift': 0.03,
  'audit-event': 0.02,
  'research-award': 0.02,
}

export const EVENT_DEFINITIONS: ReadonlyArray<EventDefinition> = Object.freeze([
  {
    id: 'medical-malpractice',
    label: '醫療糾紛',
    polarity: 'negative',
    uiKind: 'modal',
    baseRate: EVENT_TRIGGER_RATES['medical-malpractice'],
    minTier: '區域醫院',
    minThroughput: 50,
  },
  {
    id: 'negative-news',
    label: '負面新聞',
    polarity: 'negative',
    uiKind: 'toast',
    baseRate: EVENT_TRIGGER_RATES['negative-news'],
    minTier: '區域醫院',
  },
  {
    id: 'peer-criticism',
    label: '學會質疑',
    polarity: 'negative',
    uiKind: 'toast',
    baseRate: EVENT_TRIGGER_RATES['peer-criticism'],
    minTier: '醫學中心',
  },
  {
    id: 'vip-patient',
    label: 'VIP 病人',
    polarity: 'positive',
    uiKind: 'modal',
    baseRate: EVENT_TRIGGER_RATES['vip-patient'],
    minTier: '區域醫院',
  },
  {
    id: 'emergency-shift',
    label: '急診加開',
    polarity: 'positive',
    uiKind: 'modal',
    baseRate: EVENT_TRIGGER_RATES['emergency-shift'],
    minTier: '醫學中心',
  },
  {
    id: 'audit-event',
    label: '醫療評鑑',
    polarity: 'mixed',
    uiKind: 'modal',
    baseRate: EVENT_TRIGGER_RATES['audit-event'],
    minTier: '醫學中心',
  },
  {
    id: 'research-award',
    label: '學會獎項',
    polarity: 'positive',
    uiKind: 'toast',
    baseRate: EVENT_TRIGGER_RATES['research-award'],
    minTier: '醫學中心',
  },
])

/** Roll cadence — caller invokes `rollEvent` once every N ticks. */
export const EVENT_TICK_INTERVAL = 60

/** Post-resolution cooldown (session-time ms) before another roll is allowed. */
export const EVENT_POST_RESOLUTION_COOLDOWN_MS = 5 * 60 * 1000

/** Per-roll effective rate cap (after reputation scaling) — prevents spam. */
export const EVENT_MAX_RATE_PER_ROLL = 0.3

/** Reputation scaling clamp bounds. */
export const EVENT_REPUTATION_SCALE_MIN = 0.5
export const EVENT_REPUTATION_SCALE_MAX = 3.0
/** Reputation value at which scale factor = 1.0. */
export const EVENT_REPUTATION_SCALE_REFERENCE = 100_000

/** Random reputation loss bounds for 負面新聞 / 學會質疑 (uniform). */
export const NEGATIVE_REP_LOSS_MIN = 1_000
export const NEGATIVE_REP_LOSS_MAX = 10_000

/**
 * VIP boost multiplier on totalThroughput, lasting `VIP_BOOST_DURATION_MS`
 * of session time (paused with the session).
 */
export const VIP_BOOST_MULTIPLIER = 2.0
export const VIP_BOOST_DURATION_MS = 10 * 60 * 1000

/** 醫療糾紛 settlement cost minimum + percentage. */
export const MALPRACTICE_SETTLEMENT_MIN = 10_000
export const MALPRACTICE_SETTLEMENT_PERCENT = 0.10
export const MALPRACTICE_PENALTY_REP = 5_000
/** Auto-resolve timeout for 醫療糾紛 (wall-clock). */
export const MALPRACTICE_AUTO_RESOLVE_MS = 24 * 60 * 60 * 1000

/** 急診加開 outcome (positive modal event — player accepts). */
export const EMERGENCY_SHIFT_REVENUE_BONUS = 5_000
export const EMERGENCY_SHIFT_REPUTATION_BONUS = 500

/** 醫療評鑑 outcome (mixed modal event — random pass/fail on resolve). */
export const AUDIT_PASS_PROBABILITY = 0.7
export const AUDIT_PASS_REPUTATION = 5_000
export const AUDIT_FAIL_REPUTATION_LOSS = 3_000

export type ToastEventOutcome =
  | { kind: 'reputation-loss'; amount: number }
  | { kind: 'reputation-gain'; amount: number }

export interface RollEventOptions {
  /** Current hospital tier — gates which events are eligible. */
  tier: HospitalTier
  /** Current reputation — drives the scaling factor. */
  reputation: number
  /** Sum of all assigned-doctor throughputs — gates 醫療糾紛's 50/min minimum. */
  totalThroughput: number
  /**
   * Session-time ms when the previous event resolved (or `null` if no prior
   * event). Used to enforce `EVENT_POST_RESOLUTION_COOLDOWN_MS`.
   */
  lastResolvedAt: number | null
  /** Current session-time ms (monotonic clock counted only while active). */
  nowSessionMs: number
  /** Whether a previous event is still pending — if so, skip roll. */
  hasPendingEvent: boolean
  /** RNG provider in `[0, 1)`. */
  rng: () => number
}

export type RollEventResult =
  | { kind: 'no-event' }
  | { kind: 'skipped'; reason: 'pending-event' | 'cooldown' }
  | {
      kind: 'triggered'
      event: EventDefinition
      /** Pre-resolved outcome for toast events; null for modal events. */
      toastOutcome: ToastEventOutcome | null
    }

/**
 * Resolve a single event-tick roll.
 *
 * Pure: no Date.now, no Math.random — caller threads RNG. Caller is also
 * responsible for tracking `lastResolvedAt` / `hasPendingEvent` and writing
 * the resulting state changes (reputation deductions, event log row).
 *
 * For toast events, the outcome is pre-computed here so the app can apply it
 * immediately without re-rolling. For modal events, the caller awaits player
 * input.
 */
export function rollEvent(opts: RollEventOptions): RollEventResult {
  if (opts.hasPendingEvent) return { kind: 'skipped', reason: 'pending-event' }

  if (
    opts.lastResolvedAt !== null &&
    opts.nowSessionMs - opts.lastResolvedAt < EVENT_POST_RESOLUTION_COOLDOWN_MS
  ) {
    return { kind: 'skipped', reason: 'cooldown' }
  }

  const scale = clampReputationScale(opts.reputation)

  // Collect eligible events for this tier + throughput, then weighted-pick.
  const eligible = EVENT_DEFINITIONS.filter((evt) => {
    if (!tierAtLeast(opts.tier, evt.minTier)) return false
    if (evt.minThroughput !== undefined && opts.totalThroughput < evt.minThroughput) return false
    return true
  })
  if (eligible.length === 0) return { kind: 'no-event' }

  // Each eligible event gets one independent chance at its scaled rate.
  // Iterate deterministically; first to hit wins (single-event-at-a-time
  // invariant in spec). Reputation-scaling factor capped per-event.
  for (const evt of eligible) {
    const effectiveRate = Math.min(evt.baseRate * scale, EVENT_MAX_RATE_PER_ROLL)
    if (opts.rng() < effectiveRate) {
      let toastOutcome: ToastEventOutcome | null = null
      if (evt.uiKind === 'toast') {
        if (evt.polarity === 'negative') {
          const span = NEGATIVE_REP_LOSS_MAX - NEGATIVE_REP_LOSS_MIN
          const amount = Math.round(NEGATIVE_REP_LOSS_MIN + opts.rng() * span)
          toastOutcome = { kind: 'reputation-loss', amount }
        } else if (evt.polarity === 'positive') {
          // 學會獎項 — symmetric positive rep gain (uniform 1k–10k).
          const span = NEGATIVE_REP_LOSS_MAX - NEGATIVE_REP_LOSS_MIN
          const amount = Math.round(NEGATIVE_REP_LOSS_MIN + opts.rng() * span)
          toastOutcome = { kind: 'reputation-gain', amount }
        }
      }
      return { kind: 'triggered', event: evt, toastOutcome }
    }
  }
  return { kind: 'no-event' }
}

/** Reputation → scaling factor, clamped to `[0.5, 3.0]`. */
export function clampReputationScale(reputation: number): number {
  const raw = reputation / EVENT_REPUTATION_SCALE_REFERENCE
  if (raw < EVENT_REPUTATION_SCALE_MIN) return EVENT_REPUTATION_SCALE_MIN
  if (raw > EVENT_REPUTATION_SCALE_MAX) return EVENT_REPUTATION_SCALE_MAX
  return raw
}

const TIER_RANK: Record<HospitalTier, number> = {
  診所: 0,
  區域醫院: 1,
  醫學中心: 2,
  國家級教學醫院: 3,
}

function tierAtLeast(current: HospitalTier, min: HospitalTier): boolean {
  return TIER_RANK[current] >= TIER_RANK[min]
}
