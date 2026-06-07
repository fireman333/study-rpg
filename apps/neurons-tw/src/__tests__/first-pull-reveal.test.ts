import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  enqueueFirstPullReveal,
  flushFirstPullReveals,
  _pendingFirstPullRevealCount,
} from '../lib/services/first-pull-reveal'
import {
  variantGachaEvents,
  type VariantRolledPayload,
} from '../lib/services/variant-gacha'
import type { NeuronVariantRow } from '../lib/db'

/**
 * Spec (neuron-path-representative → first-pull minted silently with a DEFERRED
 * reveal on return to the maze, add-neurons-first-pull-reveal): the queue holds
 * silently-minted first-pull P5s and flushFirstPullReveals() re-emits the
 * standard 'variantRolled' event so the app-root VariantUnlockModal plays them.
 */

function payload(familyId: string, slotIndex: number): VariantRolledPayload {
  const variant: NeuronVariantRow = {
    familyId,
    slotIndex,
    rarity: 'P5',
    displayName: `${familyId} P5`,
    spriteKey: 'variant:default',
    rolledAt: 1_700_000_000_000,
    wasPityFloor: false,
    copies: 1,
  }
  return { variant, isDupe: false, familyDisplayName: familyId }
}

let received: VariantRolledPayload[]
let sub: { dispose: () => void }

beforeEach(() => {
  received = []
  // Drain any residue from a prior test (module singleton).
  flushFirstPullReveals()
  received = []
  const listener = (p: VariantRolledPayload): void => {
    received.push(p)
  }
  variantGachaEvents.on('variantRolled', listener)
  sub = { dispose: () => variantGachaEvents.off('variantRolled', listener) }
})

afterEach(() => {
  sub.dispose()
})

describe('first-pull deferred reveal queue', () => {
  it('flush emits each enqueued first-pull in order, then drains', () => {
    enqueueFirstPullReveal(payload('解剖學', 0))
    enqueueFirstPullReveal(payload('生化學', 3))
    expect(_pendingFirstPullRevealCount()).toBe(2)
    // Nothing emitted until flush.
    expect(received).toHaveLength(0)

    flushFirstPullReveals()

    expect(received.map((p) => p.variant.familyId)).toEqual(['解剖學', '生化學'])
    expect(received[0].variant.rarity).toBe('P5')
    expect(_pendingFirstPullRevealCount()).toBe(0)
  })

  it('flush on an empty queue emits nothing (no-op)', () => {
    expect(_pendingFirstPullRevealCount()).toBe(0)
    flushFirstPullReveals()
    expect(received).toHaveLength(0)
  })

  it('a second flush after drain emits nothing', () => {
    enqueueFirstPullReveal(payload('藥理學', 1))
    flushFirstPullReveals()
    expect(received).toHaveLength(1)
    flushFirstPullReveals()
    expect(received).toHaveLength(1) // no duplicate emit
  })
})
