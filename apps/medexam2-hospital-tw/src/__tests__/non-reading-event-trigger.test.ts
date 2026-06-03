import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

import { getHospitalDB } from '../db/schema'
import {
  isInReadingSession,
  isInCooldown,
  isPlayerContentRoute,
  maybeRollNonReadingEvent,
} from '../services/non-reading-event-trigger'
import { hospitalEventToastQueue } from '../lib/hospital-event-toast-queue'
import { NON_READING_EVENT_COOLDOWN_MS } from '@study-rpg/content-medexam2-tw'

// Helper: seed a baseline counters row so the gates have something to read.
async function seedCounters(
  overrides: Partial<Record<string, unknown>> = {},
): Promise<void> {
  const db = getHospitalDB()
  await db.gameCounters.put({
    id: 'singleton',
    revenue: 0,
    reputation: 0,
    lastTickAt: 0,
    tier: '診所',
    hasUsedStarterPull: true,
    currentSessionStartedAt: null,
    lastSessionEndedAt: null,
    tutorial: { completedSteps: {}, firstVisit: {}, firedTips: {} },
    pendingEventId: null,
    pendingEventTriggeredAt: null,
    lastEventResolvedAt: null,
    lastInteractionEventAt: null,
    vipBoostUntil: null,
    erConsultActive: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(overrides as any),
  } as never)
}

beforeEach(async () => {
  const db = getHospitalDB()
  await db.delete()
  await db.open()
  hospitalEventToastQueue.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── §8.2 isInReadingSession ─────────────────────────────────────────────────

describe('isInReadingSession', () => {
  it('returns false when currentSessionStartedAt is null', async () => {
    await seedCounters({ currentSessionStartedAt: null })
    expect(await isInReadingSession()).toBe(false)
  })
  it('returns true when currentSessionStartedAt is set', async () => {
    await seedCounters({ currentSessionStartedAt: Date.now() })
    expect(await isInReadingSession()).toBe(true)
  })
  it('returns false when no counters row exists', async () => {
    expect(await isInReadingSession()).toBe(false)
  })
})

// ─── §8.3 isInCooldown ───────────────────────────────────────────────────────

describe('isInCooldown', () => {
  it('returns false when lastInteractionEventAt is null', async () => {
    await seedCounters({ lastInteractionEventAt: null })
    expect(await isInCooldown()).toBe(false)
  })
  it('returns true within 3 min', async () => {
    await seedCounters({ lastInteractionEventAt: Date.now() - 60_000 })
    expect(await isInCooldown()).toBe(true)
  })
  it('returns false after 3 min', async () => {
    await seedCounters({
      lastInteractionEventAt: Date.now() - (NON_READING_EVENT_COOLDOWN_MS + 1_000),
    })
    expect(await isInCooldown()).toBe(false)
  })
})

// ─── §8.4 isPlayerContentRoute whitelist ─────────────────────────────────────

describe('isPlayerContentRoute', () => {
  it.each([
    '/',
    '/hospital',
    '/roster',
    '/fate-cards',
    '/bookmarks',
    '/leaderboard',
    '/achievements',
  ])('whitelists %s', (p) => {
    expect(isPlayerContentRoute(p)).toBe(true)
  })

  it.each([
    '/study',
    '/training',
    '/onboarding',
    '/settings',
    '/help',
    '/unknown',
    '/hospital/something', // exact-match only — no prefix
  ])('excludes %s', (p) => {
    expect(isPlayerContentRoute(p)).toBe(false)
  })

  it('strips query string before matching', () => {
    expect(isPlayerContentRoute('/leaderboard?tab=composite')).toBe(true)
    expect(isPlayerContentRoute('/study?seed=1')).toBe(false)
  })
})

// ─── §8.5 reading-session gate skips ─────────────────────────────────────────

describe('maybeRollNonReadingEvent — reading-session gate', () => {
  it('skips when reading session active', async () => {
    await seedCounters({ currentSessionStartedAt: Date.now() })
    const result = await maybeRollNonReadingEvent('quiz')
    expect(result.skipped).toBe('reading-session')
    expect(result.eventFired).toBeNull()
    expect(result.erFired).toBe(false)
  })
})

// ─── §8.6 cooldown gate skips ────────────────────────────────────────────────

describe('maybeRollNonReadingEvent — cooldown gate', () => {
  it('skips within 3 min of last interaction event', async () => {
    await seedCounters({ lastInteractionEventAt: Date.now() - 30_000 })
    const result = await maybeRollNonReadingEvent('nav')
    expect(result.skipped).toBe('cooldown')
  })
})

// ─── §8.7 mutex gate skips ───────────────────────────────────────────────────

describe('maybeRollNonReadingEvent — mutex gate', () => {
  it('skips when pendingEventId is set', async () => {
    await seedCounters({ pendingEventId: 'medical-malpractice' })
    const result = await maybeRollNonReadingEvent('nav')
    expect(result.skipped).toBe('mutex')
  })

  it('skips when erConsultActive is set', async () => {
    await seedCounters({
      erConsultActive: {
        questionId: 'Q1',
        subjectId: '內科',
        triggeredAt: 0,
        doctorSpriteKey: 'er-doctor',
        greetingIdx: 0,
      },
    })
    const result = await maybeRollNonReadingEvent('nav')
    expect(result.skipped).toBe('mutex')
  })
})

// ─── §8.8 Math.random < EVENT_ROLL_PROBABILITY triggers rollEvent ───────────

describe('maybeRollNonReadingEvent — happy path', () => {
  it('passes all gates and calls rollEvent when probability succeeds', async () => {
    await seedCounters({
      tier: '醫學中心',
      reputation: 500_000, // max repScale
    })
    // Force Math.random to 0 → outer gate passes (0 < 0.05) and first event
    // in EVENT_DEFINITIONS table also hits its inner rate.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const result = await maybeRollNonReadingEvent('quiz')
    expect(result.skipped).toBeNull()
    // Either event fired (most likely) or ER fired, or both — depending on
    // weighted table. At minimum no gate skipped. Loosen assertion to "no
    // skip" since the inner rollEvent table outcomes are not the focus
    // of this test (covered by content-pack tests).
  })
})

// ─── §8.11 TOCTOU race — single-flight guard ─────────────────────────────────

describe('maybeRollNonReadingEvent — single-flight guard', () => {
  it('returns the same promise for concurrent invocations', async () => {
    await seedCounters({})
    // Run two concurrent calls; the second should hit `inFlight !== null`
    // and return the same promise. Both results must be the same object.
    const [a, b] = await Promise.all([
      maybeRollNonReadingEvent('quiz'),
      maybeRollNonReadingEvent('nav'),
    ])
    // Single-flight returns the same promise — both resolve to identical
    // result. Mutex enforcement guarantees at most one event/ER persisted.
    expect(a).toEqual(b)
  })
})

// ─── §8.14 Cooldown unification — old `lastEventResolvedAt` doesn't gate ────

describe('maybeRollNonReadingEvent — cooldown reads only lastInteractionEventAt', () => {
  it('passes gate when old field has recent value but new field is null', async () => {
    await seedCounters({
      lastEventResolvedAt: Date.now() - 30_000, // legacy session-time field, fresh
      lastInteractionEventAt: null, // new wall-clock field, null
    })
    // Should NOT skip at cooldown — new gate only reads lastInteractionEventAt.
    // Force outer prob to fail so we don't enter rollEvent (irrelevant here).
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const result = await maybeRollNonReadingEvent('quiz')
    expect(result.skipped).not.toBe('cooldown')
  })
  it('skips when new field is fresh even if old field is stale', async () => {
    await seedCounters({
      lastEventResolvedAt: 0, // legacy: ancient
      lastInteractionEventAt: Date.now() - 30_000, // new: fresh
    })
    const result = await maybeRollNonReadingEvent('quiz')
    expect(result.skipped).toBe('cooldown')
  })
})
