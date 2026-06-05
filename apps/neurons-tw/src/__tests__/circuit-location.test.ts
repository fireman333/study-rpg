import { describe, it, expect } from 'vitest'
import { CIRCUIT_LOCATIONS } from '@study-rpg/content-neurons-tw'
import { synapseLocationFor, nodesInRouteOrder } from '../lib/maze/graph'
import { variantBirthCaption } from '../lib/variant-caption'
import type { NeuronVariantRow } from '../lib/db'

const FAM = '藥理學'
const poolZh = new Set(CIRCUIT_LOCATIONS.map((c) => c.zh))

describe('circuit-location provenance (name-neurons-maze-circuit-locations)', () => {
  it('every synapse-node slot resolves to a real pool name', () => {
    const synapseSlots = nodesInRouteOrder(FAM)
      .filter((n) => n.synapse)
      .map((n) => n.slotIndex)
    expect(synapseSlots.length).toBeGreaterThan(0)
    for (const slot of synapseSlots) {
      const loc = synapseLocationFor(FAM, slot)
      expect(loc).not.toBeNull()
      expect(poolZh.has(loc as string)).toBe(true)
    }
  })

  it('out-of-range and padded non-synapse slots return null', () => {
    expect(synapseLocationFor(FAM, 9999)).toBeNull()
    expect(synapseLocationFor('not-a-family', 0)).toBeNull()
    const padded = nodesInRouteOrder(FAM).find((n) => !n.synapse)
    if (padded) expect(synapseLocationFor(FAM, padded.slotIndex)).toBeNull()
  })

  it('caption weaves 「在 <location> 尋獲」 for a located slot', () => {
    const slot = nodesInRouteOrder(FAM).find((n) => n.synapse)?.slotIndex ?? 0
    const row = {
      familyId: FAM,
      slotIndex: slot,
      rarity: 'N',
      rolledAt: Date.UTC(2026, 5, 1),
      instanceId: 'x',
      persona: 'p',
      displayName: 'd',
    } as unknown as NeuronVariantRow
    expect(variantBirthCaption(row)).toContain('尋獲')
  })
})
