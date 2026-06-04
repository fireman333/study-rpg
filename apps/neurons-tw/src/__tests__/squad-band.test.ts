import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { resolveBandSquad } from '../components/MazeExpedition'
import { getExpeditionHidden, setExpeditionHiddenPref } from '../lib/expedition-visibility'
import type { NeuronVariantRow } from '../lib/db'

/**
 * rework-neurons-squads §5.1 + §5.2 — squad-source resolution + hide-preference.
 */

function row(familyId: string, slotIndex: number): NeuronVariantRow {
  return {
    familyId,
    slotIndex,
    rarity: 'P3',
    displayName: `${familyId}-${slotIndex}`,
    spriteKey: `variant:${familyId}:${slotIndex}`,
    rolledAt: 0,
    wasPityFloor: false,
  }
}

describe('resolveBandSquad', () => {
  it('uses the active squad when it is non-empty', () => {
    const active = [row('a', 0)]
    const fallback = [row('b', 0), row('c', 0)]
    expect(resolveBandSquad(active, fallback)).toBe(active)
  })

  it('falls back to the rarest collected set when the active squad is empty', () => {
    const fallback = [row('b', 0)]
    expect(resolveBandSquad([], fallback)).toBe(fallback)
  })

  it('returns empty when both are empty (→ growth-cone marchers downstream)', () => {
    expect(resolveBandSquad([], [])).toEqual([])
  })
})

describe('expedition-visibility preference (opt-out hide)', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to shown (not hidden)', () => {
    expect(getExpeditionHidden()).toBe(false)
  })

  it('persists a hide choice and reads it back across a fresh read', () => {
    setExpeditionHiddenPref(true)
    expect(getExpeditionHidden()).toBe(true)
    setExpeditionHiddenPref(false)
    expect(getExpeditionHidden()).toBe(false)
  })
})
