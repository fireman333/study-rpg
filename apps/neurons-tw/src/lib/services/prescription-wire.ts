/**
 * Prescription synapse-wire listener (add-neurons-prescription-tiers-and-sync).
 *
 * Boot-time registration (mirrors `initializeDmnTrigger`; idempotent on React
 * StrictMode double-mount) on the existing expedition co-repair emitter events
 * `connectome.synapseFormed` / `connectome.synapseStrengthened`. Each qualifying
 * event writes a write-once `prescription:v1:wire:{date}:{pairKey}` key (per-pair-
 * per-day dedup for free) and recomputes the tier ladder — today's synapse count
 * for the T3/T4 objectives is the number of distinct wire keys today. NO new
 * synapse emitter: these events fire only at wrong-pool expedition settlement
 * (`creditConnectomeFromExpedition`), already behind the effective-completion
 * gate and the daily pair cap.
 *
 * Anti-farm gate (design D6 — settlement-hook intersection, the CHOSEN
 * mechanism): the event payloads carry no repair provenance, so the settlement
 * hook (OverviewPage's `creditConnectomeFromExpedition` call site, where the
 * flipped question ids ARE known) arms/disarms this listener via
 * `armPrescriptionWireCredit(await hasPreTodayWrongBasis(correctIds))` BEFORE
 * crediting. A settlement whose counted repairs include NO pre-today wrong
 * (i.e. no intersection with the plan's frozen `wrongEligibleQuestionIds`)
 * leaves the listener disarmed → deliberately failing fresh questions today and
 * immediately repairing them mints NO tier-countable synapse credit.
 *
 * Capability spec: openspec/specs/neurons-daily-prescription/spec.md
 */

import { events as connectomeEvents } from './connectome'
import { recordSynapseWire } from './prescription'

/**
 * The exact event names the listener subscribes to — pinned by a Vitest lock so
 * a rename on the emitter side breaks visibly instead of silently un-wiring the
 * T3/T4 objectives.
 */
export const PRESCRIPTION_WIRE_EVENTS = [
  'connectome.synapseFormed',
  'connectome.synapseStrengthened',
] as const

let initialized = false
let armed = false

/**
 * Arm (or disarm) wire-key credit for the settlement about to be credited.
 * Called at the settlement hook point with the pre-today-wrong basis result;
 * the connectome events are emitted synchronously inside
 * `creditConnectomeFromExpedition`, so the flag set immediately before the
 * credit call is the one the listener observes. Callers disarm in a `finally`.
 */
export function armPrescriptionWireCredit(hasBasis: boolean): void {
  armed = hasBasis
}

/**
 * Register the wire-key listener on the connectome event bus. Idempotent
 * (StrictMode double-mount safe). Call once at app boot, next to
 * `initializeDmnTrigger`.
 */
export function initializePrescriptionWireListener(): void {
  if (initialized) return
  initialized = true

  const handler = (payload: { pairKey: string }): void => {
    // Anti-farm: only settlements armed with a pre-today-wrong basis mint
    // tier-countable wire keys (see module header).
    if (!armed) return
    void recordSynapseWire(payload.pairKey).catch((err) => {
      console.error('[prescription-wire] wire-key record failed:', err)
    })
  }
  connectomeEvents.on(PRESCRIPTION_WIRE_EVENTS[0], handler)
  connectomeEvents.on(PRESCRIPTION_WIRE_EVENTS[1], handler)
}

/** Test-only: reset singleton state. Not exported from any barrel. */
export function __resetPrescriptionWireForTests(): void {
  initialized = false
  armed = false
}
