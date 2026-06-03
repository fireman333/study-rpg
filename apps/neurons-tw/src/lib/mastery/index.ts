/**
 * Public API surface for neurons-tw mastery engine.
 *
 * Capability spec: openspec/specs/neuron-family-mastery/spec.md
 */

export {
  deriveMasteryTier,
  TIER_LABELS,
  TIER_COLORS,
  masteryEnergyMultiplier,
  applyMasteryToEnergy,
} from './mastery-tier'
export type { MasteryTier } from './mastery-tier'

export { MasteryEventEmitter } from './events'
export type {
  MasteryEventMap,
  MasteryEventName,
  MasteryListener,
  MasteryUpdatedPayload,
} from './events'
