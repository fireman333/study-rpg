import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  getGuidedComplete,
  setGuidedComplete,
  getExpeditionSpotlightSeen,
  setExpeditionSpotlightSeen,
  maybeAutoCompleteForExistingPlayer,
  cleanupLegacyOnboardingKeys,
  onReplayGuided,
  requestReplayGuided,
  ONBOARDING_KEYS,
  ONBOARDING_LEGACY_KEYS,
} from '../lib/services/onboarding'
import {
  advanceTourStep,
  resolveTourAnchor,
  resolveTourAnchorElement,
  domAnchorQuery,
  domVisibleElement,
  placeSpotlightCard,
  TOUR_ORDER,
  TOUR_STEPS,
  WELCOME_LINES,
  type TourStepId,
  type AnchorBox,
} from '../lib/services/onboarding-tour'

/**
 * rebuild-neurons-onboarding-as-guided-tour — device-local onboarding flags +
 * existing-player auto-complete backstop + reset clear (kept from
 * improve-neurons-onboarding) + the NEW pure tour step machine and
 * layout-agnostic anchor resolution (graceful degrade).
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function seedAnsweredQuestion(everWrong: boolean): Promise<void> {
  await db.questionHistory.put({
    questionId: 'q1',
    family: '藥理學',
    lastResult: everWrong ? 'wrong' : 'correct',
    everWrong,
    lastAnsweredAt: 1,
    updatedAt: 1,
  })
}

describe('onboarding flag get/set', () => {
  it('flags default to false on a fresh save', async () => {
    expect(await getGuidedComplete()).toBe(false)
    expect(await getExpeditionSpotlightSeen()).toBe(false)
  })

  it('set then get round-trips each flag', async () => {
    await setGuidedComplete()
    await setExpeditionSpotlightSeen()
    expect(await getGuidedComplete()).toBe(true)
    expect(await getExpeditionSpotlightSeen()).toBe(true)
  })
})

describe('maybeAutoCompleteForExistingPlayer', () => {
  it('leaves a brand-new save (no history) unmarked so the tour shows', async () => {
    await maybeAutoCompleteForExistingPlayer()
    expect(await getGuidedComplete()).toBe(false)
  })

  it('marks an existing player (any answered history) as complete', async () => {
    await seedAnsweredQuestion(false)
    await maybeAutoCompleteForExistingPlayer()
    expect(await getGuidedComplete()).toBe(true)
  })

  it('is idempotent and never un-sets an already-complete flag', async () => {
    await setGuidedComplete()
    await maybeAutoCompleteForExistingPlayer() // no history, already complete
    expect(await getGuidedComplete()).toBe(true)
  })
})

describe('account reset clears onboarding flags (resetConnectomeForDebug pattern)', () => {
  it('deleting ONBOARDING_KEYS re-surfaces onboarding', async () => {
    await setGuidedComplete()
    await setExpeditionSpotlightSeen()
    // Mirror the in-transaction reset loop in resetConnectomeForDebug.
    for (const key of ONBOARDING_KEYS) await db.meta.delete(key)
    for (const key of ONBOARDING_KEYS) {
      expect(await db.meta.get(key)).toBeUndefined()
    }
    expect(await getGuidedComplete()).toBe(false)
  })
})

describe('legacy onboarding key cleanup (orphaned expeditionRevealed)', () => {
  it('deletes orphaned legacy keys on the best-effort startup pass', async () => {
    for (const key of ONBOARDING_LEGACY_KEYS) await db.meta.put({ key, value: 'true' })
    await cleanupLegacyOnboardingKeys()
    for (const key of ONBOARDING_LEGACY_KEYS) {
      expect(await db.meta.get(key)).toBeUndefined()
    }
  })

  it('is a no-op (no throw) when the legacy keys are already absent', async () => {
    await expect(cleanupLegacyOnboardingKeys()).resolves.toBeUndefined()
  })

  it('does not touch the current onboarding flags', async () => {
    await setGuidedComplete()
    for (const key of ONBOARDING_LEGACY_KEYS) await db.meta.put({ key, value: 'true' })
    await cleanupLegacyOnboardingKeys()
    expect(await getGuidedComplete()).toBe(true)
  })
})

describe('replay bus (HelpMenu 重看新手引導)', () => {
  it('requestReplayGuided notifies subscribers; unsubscribe stops it', () => {
    const listener = vi.fn()
    const off = onReplayGuided(listener)
    requestReplayGuided()
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    requestReplayGuided()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

// --- Guided-tour step machine (pure) ------------------------------------------

describe('guided tour step machine', () => {
  it('walks the happy path: welcome → reading → quiz → maze → focus → dashboard → extract → done', () => {
    let s: TourStepId = 'welcome'
    s = advanceTourStep(s, 'next') // 開始引導
    expect(s).toBe('reading')
    s = advanceTourStep(s, 'readingStarted') // player starts a 📖 session
    expect(s).toBe('quiz')
    s = advanceTourStep(s, 'answerCorrect') // first correct answer
    expect(s).toBe('maze')
    s = advanceTourStep(s, 'next')
    expect(s).toBe('focus') // 🔍 聚焦 step (added by polish-neurons-onboarding-quiz-focus-a11y)
    s = advanceTourStep(s, 'next')
    expect(s).toBe('dashboard')
    s = advanceTourStep(s, 'next')
    expect(s).toBe('extract')
    s = advanceTourStep(s, 'variantSlotUnlocked') // first neuron extracted
    expect(s).toBe('done')
  })

  it('every spotlight step also advances via the manual 下一步 (player never trapped)', () => {
    expect(advanceTourStep('reading', 'next')).toBe('quiz')
    expect(advanceTourStep('quiz', 'next')).toBe('maze')
    expect(advanceTourStep('maze', 'next')).toBe('focus')
    expect(advanceTourStep('focus', 'next')).toBe('dashboard')
    expect(advanceTourStep('dashboard', 'next')).toBe('extract')
  })

  it('focus step (🔍 聚焦) is manual-advance and terminates on extraction like every step', () => {
    // focus has no gameplay advance event — only 下一步 / variantSlotUnlocked / skip.
    expect(advanceTourStep('focus', 'answerCorrect')).toBe('focus')
    expect(advanceTourStep('focus', 'readingStarted')).toBe('focus')
    expect(advanceTourStep('focus', 'variantSlotUnlocked')).toBe('done')
    expect(TOUR_ORDER).toContain('focus')
    expect(TOUR_ORDER.indexOf('focus')).toBe(TOUR_ORDER.indexOf('maze') + 1)
    expect(TOUR_ORDER.indexOf('focus')).toBe(TOUR_ORDER.indexOf('dashboard') - 1)
  })

  it('variantSlotUnlocked jumps to the terminal celebration from ANY active step', () => {
    for (const step of TOUR_ORDER) {
      expect(advanceTourStep(step, 'variantSlotUnlocked')).toBe('done')
    }
  })

  it('non-matching gameplay events are no-ops (gated steps stay put)', () => {
    expect(advanceTourStep('welcome', 'answerCorrect')).toBe('welcome')
    expect(advanceTourStep('welcome', 'readingStarted')).toBe('welcome')
    expect(advanceTourStep('reading', 'answerCorrect')).toBe('reading')
    expect(advanceTourStep('quiz', 'readingStarted')).toBe('quiz')
    // extract is event-gated: no manual advance, only the terminal event.
    expect(advanceTourStep('extract', 'next')).toBe('extract')
    expect(advanceTourStep('extract', 'answerCorrect')).toBe('extract')
  })

  it('done is terminal (absorbing)', () => {
    expect(advanceTourStep('done', 'next')).toBe('done')
    expect(advanceTourStep('done', 'variantSlotUnlocked')).toBe('done')
  })

  it('step definitions consume the data-tutorial anchor contract with family-card fallback', () => {
    expect(TOUR_STEPS.reading.anchors[0]).toBe('[data-tutorial="reading"]')
    expect(TOUR_STEPS.reading.anchors).toContain('[id^="family-card-"]')
    // quiz: 3-tier — answer grid (modal open) → 🆕 新題 entry (modal closed) → card last resort.
    expect(TOUR_STEPS.quiz.anchors).toEqual([
      '[data-tutorial="quiz-answer"]',
      '[data-tutorial="quiz-start"]',
      '[id^="family-card-"]',
    ])
    expect(TOUR_STEPS.maze.anchors).toEqual(['[data-tutorial="maze"]'])
    expect(TOUR_STEPS.focus.anchors).toEqual(['[data-tutorial="maze-focus"]'])
    expect(TOUR_STEPS.dashboard.anchors).toEqual(['[data-tutorial="connectome-status"]'])
    // welcome + extract are intentionally anchor-free (centered card / wait strip).
    expect(TOUR_STEPS.welcome.anchors).toEqual([])
    expect(TOUR_STEPS.extract.anchors).toEqual([])
  })

  it('welcome card copy stays within 3 short plain-語 lines', () => {
    expect(WELCOME_LINES.length).toBeLessThanOrEqual(3)
    for (const line of WELCOME_LINES) expect(line.text.length).toBeGreaterThan(0)
  })
})

// --- Anchor resolution (layout-agnostic, graceful degrade) ---------------------

describe('resolveTourAnchor graceful degrade', () => {
  const box: AnchorBox = { left: 10, top: 20, width: 100, height: 40 }

  it('returns the first selector that resolves', () => {
    const query = vi.fn((sel: string) => (sel === 'a' ? box : null))
    expect(resolveTourAnchor(['a', 'b'], query)).toEqual(box)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('falls through missing selectors to a later hit (fallback priority)', () => {
    const query = (sel: string): AnchorBox | null => (sel === '[id^="family-card-"]' ? box : null)
    expect(resolveTourAnchor(['[data-tutorial="reading"]', '[id^="family-card-"]'], query)).toEqual(
      box,
    )
  })

  it('quiz step resolves 3-tier: answer grid → 🆕 新題 entry → card', () => {
    const answer: AnchorBox = { left: 1, top: 1, width: 10, height: 10 }
    const start: AnchorBox = { left: 2, top: 2, width: 20, height: 20 }
    const card: AnchorBox = { left: 3, top: 3, width: 30, height: 30 }
    const anchors = TOUR_STEPS.quiz.anchors
    // modal open → answer grid wins
    expect(
      resolveTourAnchor(anchors, (s) =>
        s === '[data-tutorial="quiz-answer"]' ? answer : s === '[data-tutorial="quiz-start"]' ? start : card,
      ),
    ).toEqual(answer)
    // modal closed → 🆕 新題 entry frames the answer-opening control
    expect(
      resolveTourAnchor(anchors, (s) => (s === '[data-tutorial="quiz-start"]' ? start : s === '[id^="family-card-"]' ? card : null)),
    ).toEqual(start)
    // neither present → whole-card last resort
    expect(resolveTourAnchor(anchors, (s) => (s === '[id^="family-card-"]' ? card : null))).toEqual(card)
  })

  it('returns null when NO anchor resolves (centered-card fallback, no crash)', () => {
    expect(resolveTourAnchor(['[data-tutorial="missing"]'], () => null)).toBeNull()
    expect(resolveTourAnchor([], () => box)).toBeNull()
  })

  it('a throwing query degrades to null instead of crashing', () => {
    const query = (): AnchorBox | null => {
      throw new Error('bad selector')
    }
    expect(resolveTourAnchor(['[data-tutorial="maze"]'], query)).toBeNull()
  })

  it('domAnchorQuery returns null in a DOM-less environment (never throws)', () => {
    // vitest environment is `node` — no `document`, so the default query must
    // degrade silently rather than crash.
    expect(domAnchorQuery('[data-tutorial="maze"]')).toBeNull()
  })
})

// --- Visible-first DOM anchor resolution ---------------------------------------
// A general safeguard: if a [data-tutorial="…"] anchor has a display:none / zero-
// size DOM-first duplicate, visible-first scanning must skip the hidden one and
// land on the visible element, instead of nulling out the selector and degrading
// to the whole-card fallback.

interface FakeRect {
  left: number
  top: number
  width: number
  height: number
}

function fakeEl(rect: FakeRect, name: string): { getBoundingClientRect: () => FakeRect; name: string } {
  return { getBoundingClientRect: () => rect, name }
}

function stubDocument(bySelector: Record<string, ReturnType<typeof fakeEl>[]>): void {
  vi.stubGlobal('document', {
    querySelectorAll: (sel: string) => bySelector[sel] ?? [],
  })
}

describe('visible-first anchor resolution (mobile hidden-duplicate skip)', () => {
  const hidden = fakeEl({ left: 0, top: 0, width: 0, height: 0 }, 'dock-header-📖 (display:none)')
  const visible = fakeEl({ left: 20, top: 400, width: 280, height: 36 }, 'family-card-📖')

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('domVisibleElement skips a zero-size DOM-first duplicate and returns the visible match', () => {
    stubDocument({ '[data-tutorial="reading"]': [hidden, visible] })
    expect(domVisibleElement('[data-tutorial="reading"]')).toBe(visible)
  })

  it('domAnchorQuery returns the VISIBLE match box (not null from the hidden first match)', () => {
    stubDocument({ '[data-tutorial="reading"]': [hidden, visible] })
    expect(domAnchorQuery('[data-tutorial="reading"]')).toEqual({
      left: 20,
      top: 400,
      width: 280,
      height: 36,
    })
  })

  it('all-hidden matches resolve to null (selector falls through to the next anchor)', () => {
    stubDocument({
      '[data-tutorial="reading"]': [hidden],
      '[id^="family-card-"]': [visible],
    })
    expect(domVisibleElement('[data-tutorial="reading"]')).toBeNull()
    expect(
      resolveTourAnchorElement(['[data-tutorial="reading"]', '[id^="family-card-"]']),
    ).toBe(visible)
  })

  it('resolveTourAnchorElement honours selector priority order before document order', () => {
    const cardEl = fakeEl({ left: 10, top: 100, width: 300, height: 200 }, 'whole-card')
    stubDocument({
      '[data-tutorial="reading"]': [hidden, visible],
      '[id^="family-card-"]': [cardEl],
    })
    expect(
      resolveTourAnchorElement(['[data-tutorial="reading"]', '[id^="family-card-"]']),
    ).toBe(visible)
  })

  it('returns null without a document and never throws (node env)', () => {
    vi.unstubAllGlobals()
    expect(domVisibleElement('[data-tutorial="maze"]')).toBeNull()
    expect(resolveTourAnchorElement(['[data-tutorial="maze"]'])).toBeNull()
  })
})

// --- Spotlight card placement (pure, viewport-clamped) ---------------------------
// jsdom/node has no real layout, so the geometry is exercised as pure math; the
// overlay feeds the MEASURED card height into this helper at runtime.

describe('placeSpotlightCard', () => {
  const viewportDesktop = { width: 1440, height: 900 }
  const phonePortrait = { width: 375, height: 667 }
  const phoneLandscape = { width: 667, height: 375 }
  const CARD_W = 340

  it('places below the hole when the measured height fits', () => {
    const p = placeSpotlightCard({
      hole: { left: 500, top: 100, width: 200, height: 40 },
      viewport: viewportDesktop,
      cardHeight: 180,
      cardWidth: CARD_W,
    })
    expect(p.top).toBe(150) // hole bottom 140 + 10 gap
    expect(p.width).toBe(CARD_W)
    expect(p.left).toBe(500 + 100 - CARD_W / 2) // centered on the hole
  })

  it('flips above when the card would not fit below', () => {
    const p = placeSpotlightCard({
      hole: { left: 500, top: 760, width: 200, height: 40 },
      viewport: viewportDesktop,
      cardHeight: 180,
      cardWidth: CARD_W,
    })
    expect(p.top).toBe(760 - 180 - 10)
  })

  it('never clips the button row past the viewport bottom (the mobile stuck-tour bug)', () => {
    // Real measured card ~200px on a narrow column. Sweep the hole down the
    // short landscape viewport — the card must stay fully on-screen for EVERY
    // position (the old fixed 150px estimate let "below" pass, clipping the
    // fixed-position card's buttons with no way to scroll them into view).
    for (let holeTop = -700; holeTop <= 700; holeTop += 25) {
      const p = placeSpotlightCard({
        hole: { left: 100, top: holeTop, width: 200, height: 44 },
        viewport: phoneLandscape,
        cardHeight: 200,
        cardWidth: CARD_W,
      })
      expect(p.top).toBeGreaterThanOrEqual(8)
      expect(p.top + 200).toBeLessThanOrEqual(phoneLandscape.height - 8)
    }
  })

  it('a tall anchor (maze hole bigger than the viewport) pins the card at the top margin', () => {
    const p = placeSpotlightCard({
      hole: { left: 0, top: -200, width: 375, height: 1100 },
      viewport: phonePortrait,
      cardHeight: 190,
      cardWidth: CARD_W,
    })
    expect(p.top).toBe(8)
    expect(p.top + 190).toBeLessThanOrEqual(phonePortrait.height)
  })

  it('a card taller than a very short viewport pins to the top margin (lead stays readable)', () => {
    const p = placeSpotlightCard({
      hole: { left: 0, top: 10, width: 100, height: 30 },
      viewport: { width: 640, height: 180 },
      cardHeight: 240,
      cardWidth: CARD_W,
    })
    expect(p.top).toBe(8)
  })

  it('clamps width and left on a narrow portrait phone', () => {
    const p = placeSpotlightCard({
      hole: { left: 300, top: 200, width: 60, height: 40 },
      viewport: { width: 320, height: 667 },
      cardHeight: 200,
      cardWidth: CARD_W,
    })
    expect(p.width).toBe(320 - 16) // vw - 2 * margin
    expect(p.left).toBe(8) // hole near the right edge → clamped inside
    expect(p.left + p.width).toBeLessThanOrEqual(320 - 8)
  })

  it('keeps the card horizontally inside the viewport at the left edge too', () => {
    const p = placeSpotlightCard({
      hole: { left: 0, top: 200, width: 40, height: 40 },
      viewport: phonePortrait,
      cardHeight: 200,
      cardWidth: CARD_W,
    })
    expect(p.left).toBe(8)
  })
})
