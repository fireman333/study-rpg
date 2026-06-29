/**
 * Guided-tour step machine + anchor resolution
 * (rebuild-neurons-onboarding-as-guided-tour).
 *
 * Pure, node-safe module so the tour's behaviour is unit-testable without a
 * DOM: the step DEFINITIONS (order / anchors / 繁中 copy / advance triggers)
 * and the TRANSITION function live here; React rendering, event subscription
 * and spotlight measurement live in `components/onboarding/`.
 *
 * Design rules (mirrors openspec/specs/neurons-onboarding/spec.md):
 *   - Steps advance by OBSERVING existing gameplay events ('readingStarted' /
 *     'answerCorrect' / 'variantSlotUnlocked') or by the explicit 「下一步」
 *     control — the tour never modifies walker / energy / gacha logic.
 *   - `variantSlotUnlocked` (first neuron extracted) from ANY active step
 *     jumps straight to the terminal 'done' celebration.
 *   - Anchors are runtime `document.querySelector` selectors tried in order;
 *     ALL-miss → null → the step degrades to a centered card (never a
 *     spotlight over nothing, never a crash).
 */

export type TourStepId = 'welcome' | 'reading' | 'quiz' | 'maze' | 'dashboard' | 'extract' | 'done'

/** Events that can advance the tour. 'next' = the manual 「下一步」 button. */
export type TourAdvanceEvent = 'next' | 'readingStarted' | 'answerCorrect' | 'variantSlotUnlocked'

export interface TourStepDef {
  id: Exclude<TourStepId, 'done'>
  /**
   * Selectors tried in order at runtime; first visible match wins. Empty =
   * intentionally anchor-free (centered welcome card / bottom wait strip).
   * The `data-tutorial` anchors are stamped by the homepage layout (a parallel
   * change) — every one of them MIGHT be missing, so each consumer degrades.
   */
  anchors: readonly string[]
  /** One-line 繁中 instruction headline. */
  lead: string
  /** Short plain-語 body copy. */
  body: string
  /** Label for the manual advance button; null = no manual advance (event-gated). */
  nextLabel: string | null
  /** Gameplay events (besides the global terminal) that auto-advance this step. */
  advanceOn: readonly TourAdvanceEvent[]
}

/** Linear step order; 'done' (terminal celebration) is reached by transition only. */
export const TOUR_ORDER = ['welcome', 'reading', 'quiz', 'maze', 'dashboard', 'extract'] as const

export const TOUR_STEPS: Record<Exclude<TourStepId, 'done'>, TourStepDef> = {
  welcome: {
    id: 'welcome',
    anchors: [],
    lead: '歡迎來到神經元！',
    body: '', // welcome renders its own 3-line loop card; see WELCOME_LINES.
    nextLabel: '開始引導',
    advanceOn: [],
  },
  reading: {
    id: 'reading',
    anchors: ['[data-tutorial="reading"]', '[id^="family-card-"]'],
    lead: '第一步：無阻力閱讀',
    body: '在科目卡點 📖 閱讀此科，唸書的每一分鐘都自動變成能量 — 不用守著計時器，唸就對了。',
    nextLabel: '下一步',
    advanceOn: ['readingStarted'],
  },
  quiz: {
    id: 'quiz',
    anchors: ['[data-tutorial="quiz-answer"]', '[id^="family-card-"]'],
    lead: '第二步：答一題試試',
    body: '從科目卡開始答題（打 boss）。答對會餵能量 — 選一個答案吧！',
    nextLabel: '下一步',
    advanceOn: ['answerCorrect'],
  },
  maze: {
    id: 'maze',
    anchors: ['[data-tutorial="maze"]'],
    lead: '能量推著神經元前進',
    body: '閱讀＋答對的能量，讓你的神經元在腦圖上走。走到腦區節點，就會抽出神經元。',
    nextLabel: '下一步',
    advanceOn: [],
  },
  dashboard: {
    id: 'dashboard',
    anchors: ['[data-tutorial="connectome-status"]'],
    lead: '你的每日儀表板',
    body: '今天的能量、連線進度、DMN 抽卡都在這裡。之後每天打開先看一眼。',
    nextLabel: '下一步',
    advanceOn: [],
  },
  extract: {
    id: 'extract',
    anchors: [],
    lead: '目標：抽出第一隻神經元',
    body: '繼續答題＋閱讀累積能量，走到腦區節點就會自動抽出！',
    nextLabel: null, // event-gated terminal wait (skip is still always available).
    advanceOn: [],
  },
}

/** Welcome card body — the core loop in ≤3 short plain-語 lines. */
export const WELCOME_LINES: readonly { icon: string; text: string }[] = [
  { icon: '📖', text: '點科目卡的「閱讀此科」或直接答題 — 每分鐘閱讀、每題答對都變成能量。' },
  { icon: '⚡', text: '能量推著你的神經元在腦圖上前進，走到腦區節點就抽出一隻神經元。' },
  { icon: '⚔️', text: '答錯不是壞事 — 錯題會進「錯題出征」，重新答對＝修復連線、還能抽 DMN 命運卡。' },
]

/**
 * Pure transition function. Unknown / non-matching events are no-ops.
 * 'variantSlotUnlocked' (first neuron) terminates from ANY active step.
 */
export function advanceTourStep(current: TourStepId, event: TourAdvanceEvent): TourStepId {
  if (current === 'done') return 'done'
  if (event === 'variantSlotUnlocked') return 'done'
  const def = TOUR_STEPS[current]
  const accepts = event === 'next' ? def.nextLabel !== null : def.advanceOn.includes(event)
  if (!accepts) return current
  const idx = TOUR_ORDER.indexOf(current as (typeof TOUR_ORDER)[number])
  const next = TOUR_ORDER[idx + 1]
  return next ?? 'done'
}

// --- Anchor resolution (layout-agnostic, defensive) ---------------------------

export interface AnchorBox {
  left: number
  top: number
  width: number
  height: number
}

export type AnchorQuery = (selector: string) => AnchorBox | null

/**
 * First VISIBLE (positive-size) element matching `selector`, scanning ALL
 * matches in document order — NOT just the first. A general safeguard against any
 * `display:none` / zero-size DOM-first duplicate of a `[data-tutorial="…"]` anchor
 * (a plain querySelector would hit the hidden one, read a zero-size rect, and
 * wrongly null out the whole selector even though a visible match exists further
 * down). Returns null when nothing visible matches, the selector throws, or there
 * is no `document` (node test env). NEVER throws.
 */
export function domVisibleElement(selector: string): HTMLElement | null {
  try {
    if (typeof document === 'undefined') return null
    const els = document.querySelectorAll(selector)
    for (let i = 0; i < els.length; i++) {
      const el = els[i] as HTMLElement
      const r = el.getBoundingClientRect()
      if (r && r.width > 0 && r.height > 0) return el
    }
    return null
  } catch {
    return null
  }
}

/**
 * First visible element across a step's anchor list (selector priority order,
 * then document order within each selector). Used by the overlay's
 * scroll-into-view pass so the SAME element the spotlight frames is the one
 * scrolled to. NEVER throws.
 */
export function resolveTourAnchorElement(anchors: readonly string[]): HTMLElement | null {
  for (const selector of anchors) {
    const el = domVisibleElement(selector)
    if (el) return el
  }
  return null
}

/**
 * Default DOM query: first VISIBLE match → getBoundingClientRect (see
 * `domVisibleElement` for why all matches are scanned). NEVER throws.
 */
export function domAnchorQuery(selector: string): AnchorBox | null {
  const el = domVisibleElement(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * Resolve a step's spotlight box: try each selector in order, first hit wins.
 * All-miss (or a throwing query) → null, which the overlay renders as a
 * CENTERED instruction card (graceful degrade — never a spotlight over
 * nothing, never a crash).
 */
export function resolveTourAnchor(
  anchors: readonly string[],
  query: AnchorQuery = domAnchorQuery,
): AnchorBox | null {
  for (const selector of anchors) {
    try {
      const box = query(selector)
      if (box) return box
    } catch {
      // Defensive: a bad selector / query error degrades, never crashes.
    }
  }
  return null
}

// --- Spotlight card placement (pure, viewport-clamped) -------------------------

export interface SpotlightCardPlacement {
  top: number
  left: number
  width: number
}

/**
 * Place the instruction card adjacent to the spotlight hole — below when the
 * card fits between the hole bottom and the viewport floor, else above — and
 * HARD-CLAMP it fully on-screen. Pure math so the mobile-critical bits are
 * unit-testable (jsdom has no real layout):
 *
 *   - `cardHeight` is the MEASURED card height (the overlay measures
 *     offsetHeight and re-feeds it). A fixed estimate under-counted wrapped CJK
 *     body lines on a ~320px column, so the "below fits?" test could pass and
 *     the position:fixed card (which does NOT scroll with the page) would clip
 *     its 下一步/跳過 button row past the viewport bottom — a stuck tour on
 *     short/landscape phones.
 *   - The final top is clamped to [margin, vh - cardHeight - margin]; tall
 *     anchors (a maze hole taller than the viewport → negative hole top) pin
 *     the card to the top margin instead of pushing it off-screen. Overlap with
 *     the hole is allowed in that degenerate case (the card z-sits above it and
 *     stays tappable).
 *   - Width/left are clamped so the card never exceeds the viewport width.
 */
export function placeSpotlightCard(args: {
  hole: AnchorBox
  viewport: { width: number; height: number }
  cardHeight: number
  cardWidth: number
  /** Hole↔card spacing (px). */
  gap?: number
  /** Viewport edge margin (px). */
  margin?: number
}): SpotlightCardPlacement {
  const { hole, viewport, cardHeight, cardWidth } = args
  const gap = args.gap ?? 10
  const margin = args.margin ?? 8
  const width = Math.min(cardWidth, viewport.width - margin * 2)
  const holeBottom = hole.top + hole.height
  const fitsBelow = holeBottom + gap + cardHeight + margin <= viewport.height
  let top = fitsBelow ? holeBottom + gap : hole.top - cardHeight - gap
  // Never clip: bottom clamp FIRST, then the top-margin floor wins (keeps the
  // step counter + lead readable even if the card is taller than the viewport).
  top = Math.min(top, viewport.height - cardHeight - margin)
  top = Math.max(margin, top)
  const left = Math.min(
    Math.max(margin, hole.left + hole.width / 2 - width / 2),
    Math.max(margin, viewport.width - width - margin),
  )
  return { top, left, width }
}
