/**
 * Deferred first-pull reveal queue (add-neurons-first-pull-reveal).
 *
 * Per-family first-pull mints a guaranteed-P5 SILENTLY during the answer (so no
 * reveal modal pops mid-quiz — see first-pull.ts). Instead of vanishing, the
 * minted P5 is captured here and revealed once the player returns to the
 * maze/home (QuizModal unmount → flushFirstPullReveals). Flushing re-emits the
 * standard `variantGachaEvents` 'variantRolled' event, so the existing
 * app-root VariantUnlockModal plays the reveal — no modal change needed.
 *
 * In-memory only (cosmetic): a reload before flush loses just the fanfare; the
 * variant is already collected + set as the family representative.
 *
 * Capability spec: openspec/specs/neuron-path-representative/spec.md
 */

import { variantGachaEvents, type VariantRolledPayload } from './variant-gacha'

const pending: VariantRolledPayload[] = []

/** Queue one first-pull P5 for a deferred reveal (called from grantFirstPullIfNeeded). */
export function enqueueFirstPullReveal(payload: VariantRolledPayload): void {
  pending.push(payload)
}

/**
 * Drain the queue, revealing each first-pull P5 via the standard variant-unlock
 * reveal. Call on return to the maze/home (QuizModal unmount). No-op when empty.
 */
export function flushFirstPullReveals(): void {
  if (pending.length === 0) return
  const batch = pending.splice(0, pending.length)
  for (const payload of batch) {
    variantGachaEvents.emit('variantRolled', payload)
  }
}

/** Test-only: current queued count (no production caller). */
export function _pendingFirstPullRevealCount(): number {
  return pending.length
}

/* DEV-only debug handle for manual smoke (mirrors __firstPull / __variantGacha). */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __firstPullReveal?: unknown }).__firstPullReveal = {
    enqueue: enqueueFirstPullReveal,
    flush: flushFirstPullReveals,
    count: _pendingFirstPullRevealCount,
  }
}
