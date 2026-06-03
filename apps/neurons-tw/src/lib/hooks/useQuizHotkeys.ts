/**
 * QuizModal keyboard hotkey hook — neurons-tw flavor.
 *
 * Ported from 二階 medexam2-hospital-tw `use-quiz-hotkeys.ts` with scope-down:
 * KEEP: highlight / submit / advance / scroll / phase cooldown / input-focus guard.
 * DROP (now): bookmark / quality (太簡單 / 我亂猜的) — reserved as noop union
 *             variants so sibling changes (add-neurons-question-bookmarks,
 *             add-neurons-srs-binary-modifiers) can wire them without
 *             touching this hook's contract.
 *
 * Two-phase contract:
 * - Asking phase: 1/2/3/4 highlight A/B/C/D; Enter submits highlighted choice.
 * - Answered phase: Enter or Space advances; 1/2/3 reserved (noop until siblings).
 * - Both phases share scroll bindings (Space / Shift+Space / ↓↑ / Home / End)
 *   EXCEPT answered-phase Space which is intercepted as advance.
 *
 * Decision logic lives in `dispatchKey` (pure, fully unit-testable under node
 * vitest env). The hook itself only manages refs + the document listener +
 * action execution against the scroll container ref + the injected callbacks.
 *
 * Spec: openspec/specs/neurons-mode/spec.md
 *   "QuizModal SHALL accept keyboard hotkeys for option highlight / submit / advance / scroll"
 */

import { useEffect, useRef, type RefObject } from 'react'

export type QuizPhase = 'asking' | 'answered'

export type HotkeyAction =
  | { kind: 'highlight'; key: string }
  | { kind: 'submit'; key: string }
  | { kind: 'advance' }
  // Reserved for follow-up changes; current dispatcher never returns these.
  | { kind: 'toggle-bookmark' }
  | { kind: 'toggle-easy' }
  | { kind: 'toggle-guessed' }
  | {
      kind: 'scroll'
      direction: 'up' | 'down'
      amount: 'page' | 'step' | 'edge-top' | 'edge-bottom'
    }
  | { kind: 'skip' }
  | { kind: 'noop' }

export interface DispatchContext {
  phase: QuizPhase
  optionKeys: string[]
  highlightedKey: string | null
  isInputFocused: boolean
  msSincePhaseChange: number
}

export const PHASE_COOLDOWN_MS = 150
export const ARROW_STEP_PX = 40
export const PAGE_FRACTION = 0.8

/**
 * Pure dispatcher. Maps a keypress + context to an intended action.
 * No DOM access, no React state mutation — caller executes the returned action.
 */
export function dispatchKey(
  key: string,
  shift: boolean,
  ctx: DispatchContext,
): HotkeyAction {
  // Hard guard: focused input/textarea passes keys through to native handling.
  if (ctx.isInputFocused) return { kind: 'skip' }

  // Phase-aware overrides FIRST so answered-phase Space wins over scroll-Space.
  // Asking-phase Space falls through to the scroll branch below.
  if (ctx.phase === 'answered' && key === ' ' && !shift) {
    if (ctx.msSincePhaseChange < PHASE_COOLDOWN_MS) return { kind: 'noop' }
    return { kind: 'advance' }
  }

  // Scroll bindings (both phases except answered-Space handled above).
  if (key === ' ') {
    return shift
      ? { kind: 'scroll', direction: 'up', amount: 'page' }
      : { kind: 'scroll', direction: 'down', amount: 'page' }
  }
  if (key === 'ArrowDown') return { kind: 'scroll', direction: 'down', amount: 'step' }
  if (key === 'ArrowUp') return { kind: 'scroll', direction: 'up', amount: 'step' }
  if (key === 'Home') return { kind: 'scroll', direction: 'up', amount: 'edge-top' }
  if (key === 'End') return { kind: 'scroll', direction: 'down', amount: 'edge-bottom' }

  if (ctx.phase === 'asking') {
    if (key === '1' || key === '2' || key === '3' || key === '4') {
      const idx = Number(key) - 1
      if (idx < ctx.optionKeys.length) {
        return { kind: 'highlight', key: ctx.optionKeys[idx]! }
      }
      return { kind: 'noop' }
    }
    if (key === '0' || key === '5' || key === '6' || key === '7' || key === '8' || key === '9') {
      return { kind: 'noop' }
    }
    if (key === 'Enter') {
      if (ctx.highlightedKey !== null) {
        return { kind: 'submit', key: ctx.highlightedKey }
      }
      return { kind: 'noop' }
    }
    return { kind: 'noop' }
  }

  // Answered phase.
  if (key === 'Enter') {
    if (ctx.msSincePhaseChange < PHASE_COOLDOWN_MS) return { kind: 'noop' }
    return { kind: 'advance' }
  }
  // Bookmark toggle — wired by add-neurons-question-bookmarks.
  if (key === '1') return { kind: 'toggle-bookmark' }
  // SRS binary modifiers — wired by add-neurons-srs-binary-modifiers.
  if (key === '2') return { kind: 'toggle-easy' }
  if (key === '3') return { kind: 'toggle-guessed' }
  return { kind: 'noop' }
}

export interface UseQuizHotkeysOptions {
  isOpen: boolean
  phase: QuizPhase
  optionKeys: string[]
  highlightedKey: string | null
  scrollContainerRef: RefObject<HTMLElement | null>
  setHighlightedKey: (key: string | null) => void
  onSubmit: (key: string) => void
  onAdvance: () => void
  /** Wired by add-neurons-question-bookmarks — toggles ⭐ for current question. */
  onToggleBookmark: () => void
  /** Wired by add-neurons-srs-binary-modifiers — toggles ✨ easy flag. */
  onToggleEasy: () => void
  /** Wired by add-neurons-srs-binary-modifiers — toggles 🤔 guessed flag. */
  onToggleGuessed: () => void
}

export function useQuizHotkeys(options: UseQuizHotkeysOptions): void {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const phaseChangedAtRef = useRef<number>(Date.now())
  const prevPhaseRef = useRef<QuizPhase>(options.phase)
  if (prevPhaseRef.current !== options.phase) {
    phaseChangedAtRef.current = Date.now()
    prevPhaseRef.current = options.phase
  }

  useEffect(() => {
    if (!options.isOpen) return

    function handler(event: KeyboardEvent): void {
      const opts = optionsRef.current
      if (!opts.isOpen) return

      const isInputFocused =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement

      const action = dispatchKey(event.key, event.shiftKey, {
        phase: opts.phase,
        optionKeys: opts.optionKeys,
        highlightedKey: opts.highlightedKey,
        isInputFocused,
        msSincePhaseChange: Date.now() - phaseChangedAtRef.current,
      })

      switch (action.kind) {
        case 'skip':
        case 'noop':
          return
        case 'toggle-bookmark':
          event.preventDefault()
          opts.onToggleBookmark()
          return
        case 'toggle-easy':
          event.preventDefault()
          opts.onToggleEasy()
          return
        case 'toggle-guessed':
          event.preventDefault()
          opts.onToggleGuessed()
          return
        case 'highlight':
          opts.setHighlightedKey(action.key)
          return
        case 'submit':
          event.preventDefault()
          opts.onSubmit(action.key)
          return
        case 'advance':
          event.preventDefault()
          opts.onAdvance()
          return
        case 'scroll': {
          event.preventDefault()
          const container = opts.scrollContainerRef.current
          if (!container) return
          if (action.amount === 'page') {
            const delta = container.clientHeight * PAGE_FRACTION
            container.scrollBy({
              top: action.direction === 'down' ? delta : -delta,
              behavior: 'smooth',
            })
          } else if (action.amount === 'step') {
            container.scrollBy({
              top: action.direction === 'down' ? ARROW_STEP_PX : -ARROW_STEP_PX,
              behavior: 'auto',
            })
          } else if (action.amount === 'edge-top') {
            container.scrollTo({ top: 0, behavior: 'smooth' })
          } else {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
          }
          return
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.isOpen])
}
