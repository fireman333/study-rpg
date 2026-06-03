/**
 * Unit tests for the pure `dispatchKey` function from useQuizHotkeys.
 *
 * Covers the asking / answered phase split, scroll branch, phase cooldown,
 * input-focus guard, out-of-bounds bounds-check, and reserved-noop slots.
 */

import { describe, it, expect } from 'vitest'
import { dispatchKey, PHASE_COOLDOWN_MS, type DispatchContext } from '../lib/hooks/useQuizHotkeys'

const baseAsking: DispatchContext = {
  phase: 'asking',
  optionKeys: ['A', 'B', 'C', 'D'],
  highlightedKey: null,
  isInputFocused: false,
  msSincePhaseChange: 1000,
}

const baseAnswered: DispatchContext = {
  phase: 'answered',
  optionKeys: ['A', 'B', 'C', 'D'],
  highlightedKey: null,
  isInputFocused: false,
  msSincePhaseChange: 1000,
}

describe('dispatchKey — asking phase', () => {
  it('1 highlights option A', () => {
    expect(dispatchKey('1', false, baseAsking)).toEqual({ kind: 'highlight', key: 'A' })
  })

  it('4 highlights option D', () => {
    expect(dispatchKey('4', false, baseAsking)).toEqual({ kind: 'highlight', key: 'D' })
  })

  it('5 (out of standard 4) is noop', () => {
    expect(dispatchKey('5', false, baseAsking)).toEqual({ kind: 'noop' })
  })

  it('3 with only 2 options (out of bounds) is noop', () => {
    expect(dispatchKey('3', false, { ...baseAsking, optionKeys: ['A', 'B'] })).toEqual({ kind: 'noop' })
  })

  it('Enter with highlight submits', () => {
    expect(dispatchKey('Enter', false, { ...baseAsking, highlightedKey: 'C' })).toEqual({
      kind: 'submit',
      key: 'C',
    })
  })

  it('Enter without highlight is noop', () => {
    expect(dispatchKey('Enter', false, baseAsking)).toEqual({ kind: 'noop' })
  })

  it('Space scrolls page down', () => {
    expect(dispatchKey(' ', false, baseAsking)).toEqual({
      kind: 'scroll',
      direction: 'down',
      amount: 'page',
    })
  })

  it('unknown letter key is noop', () => {
    expect(dispatchKey('q', false, baseAsking)).toEqual({ kind: 'noop' })
  })
})

describe('dispatchKey — answered phase', () => {
  it('Enter with cooldown OK advances', () => {
    expect(dispatchKey('Enter', false, baseAnswered)).toEqual({ kind: 'advance' })
  })

  it('Enter blocked by cooldown returns noop', () => {
    expect(
      dispatchKey('Enter', false, { ...baseAnswered, msSincePhaseChange: 50 }),
    ).toEqual({ kind: 'noop' })
  })

  it('Enter exactly at cooldown threshold is noop (strict <)', () => {
    expect(
      dispatchKey('Enter', false, { ...baseAnswered, msSincePhaseChange: PHASE_COOLDOWN_MS - 1 }),
    ).toEqual({ kind: 'noop' })
  })

  it('Space with cooldown OK advances (not scroll — phase override)', () => {
    expect(dispatchKey(' ', false, baseAnswered)).toEqual({ kind: 'advance' })
  })

  it('Space blocked by cooldown returns noop', () => {
    expect(
      dispatchKey(' ', false, { ...baseAnswered, msSincePhaseChange: 100 }),
    ).toEqual({ kind: 'noop' })
  })

  it('answered-phase 1 returns toggle-bookmark (wired by add-neurons-question-bookmarks)', () => {
    expect(dispatchKey('1', false, baseAnswered)).toEqual({ kind: 'toggle-bookmark' })
  })

  it('answered-phase 2 returns toggle-easy (wired by add-neurons-srs-binary-modifiers)', () => {
    expect(dispatchKey('2', false, baseAnswered)).toEqual({ kind: 'toggle-easy' })
  })

  it('answered-phase 3 returns toggle-guessed (wired by add-neurons-srs-binary-modifiers)', () => {
    expect(dispatchKey('3', false, baseAnswered)).toEqual({ kind: 'toggle-guessed' })
  })
})

describe('dispatchKey — scroll branch (both phases)', () => {
  it('Shift+Space scrolls page up in asking phase', () => {
    expect(dispatchKey(' ', true, baseAsking)).toEqual({
      kind: 'scroll',
      direction: 'up',
      amount: 'page',
    })
  })

  it('Shift+Space scrolls page up in answered phase (overrides answered-Space override)', () => {
    // Shift+Space is NOT intercepted by the answered-phase advance override
    // since that override only matches `key === ' ' && !shift`.
    expect(dispatchKey(' ', true, baseAnswered)).toEqual({
      kind: 'scroll',
      direction: 'up',
      amount: 'page',
    })
  })

  it('ArrowDown scrolls step-down', () => {
    expect(dispatchKey('ArrowDown', false, baseAsking)).toEqual({
      kind: 'scroll',
      direction: 'down',
      amount: 'step',
    })
  })

  it('ArrowUp scrolls step-up in answered phase too', () => {
    expect(dispatchKey('ArrowUp', false, baseAnswered)).toEqual({
      kind: 'scroll',
      direction: 'up',
      amount: 'step',
    })
  })

  it('Home jumps to top', () => {
    expect(dispatchKey('Home', false, baseAsking)).toEqual({
      kind: 'scroll',
      direction: 'up',
      amount: 'edge-top',
    })
  })

  it('End jumps to bottom', () => {
    expect(dispatchKey('End', false, baseAnswered)).toEqual({
      kind: 'scroll',
      direction: 'down',
      amount: 'edge-bottom',
    })
  })
})

describe('dispatchKey — guards', () => {
  it('input focus skips any key in any phase', () => {
    const ctx = { ...baseAsking, isInputFocused: true }
    expect(dispatchKey('1', false, ctx)).toEqual({ kind: 'skip' })
    expect(dispatchKey('Enter', false, ctx)).toEqual({ kind: 'skip' })
    expect(dispatchKey(' ', false, ctx)).toEqual({ kind: 'skip' })
    expect(dispatchKey('ArrowDown', false, ctx)).toEqual({ kind: 'skip' })
  })

  it('input focus skips in answered phase too', () => {
    expect(
      dispatchKey('Enter', false, { ...baseAnswered, isInputFocused: true }),
    ).toEqual({ kind: 'skip' })
  })

  it('Escape is noop (handled by modal-level listener, not the hook)', () => {
    expect(dispatchKey('Escape', false, baseAsking)).toEqual({ kind: 'noop' })
    expect(dispatchKey('Escape', false, baseAnswered)).toEqual({ kind: 'noop' })
  })
})
