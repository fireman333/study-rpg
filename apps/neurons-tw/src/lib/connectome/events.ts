import type { SynapseState } from '../db'

export interface SynapseFormedPayload {
  pairKey: string
  state: 'dormant'
}

export interface SynapseStrengthenedPayload {
  pairKey: string
  fromState: SynapseState
  toState: SynapseState
}

export interface SynapseDecayedPayload {
  pairKey: string
  fromState: SynapseState
  toState: SynapseState
}

export interface VariantSlotUnlockedPayload {
  familyId: string
  slotIndex: number
  apAtUnlock: number
  /**
   * Mint-time context of the triggering correct answer: `true` when that
   * answer's question had `everWrong === true` before the answer (flags a 救贖
   * individual). Forwarded from `recordCorrectAnswer`'s optional context arg;
   * defaults to `false` when the caller omits it. (add-neurons-variant-provenance)
   */
  wasRedemption: boolean
}

export type ConnectomeEventMap = {
  'connectome.synapseFormed': SynapseFormedPayload
  'connectome.synapseStrengthened': SynapseStrengthenedPayload
  'connectome.synapseDecayed': SynapseDecayedPayload
  'connectome.variantSlotUnlocked': VariantSlotUnlockedPayload
}

export type ConnectomeEventName = keyof ConnectomeEventMap

export type ConnectomeListener<E extends ConnectomeEventName> = (
  payload: ConnectomeEventMap[E],
) => void

export class ConnectomeEventEmitter {
  private listeners = new Map<ConnectomeEventName, Set<ConnectomeListener<ConnectomeEventName>>>()

  on<E extends ConnectomeEventName>(event: E, listener: ConnectomeListener<E>): void {
    const set = this.listeners.get(event) ?? new Set()
    set.add(listener as ConnectomeListener<ConnectomeEventName>)
    this.listeners.set(event, set)
  }

  off<E extends ConnectomeEventName>(event: E, listener: ConnectomeListener<E>): void {
    this.listeners.get(event)?.delete(listener as ConnectomeListener<ConnectomeEventName>)
  }

  emit<E extends ConnectomeEventName>(event: E, payload: ConnectomeEventMap[E]): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        ;(listener as ConnectomeListener<E>)(payload)
      } catch (err) {
        console.error(`[connectome] listener for ${event} threw:`, err)
      }
    })
  }

  dispose(): void {
    this.listeners.clear()
  }
}
