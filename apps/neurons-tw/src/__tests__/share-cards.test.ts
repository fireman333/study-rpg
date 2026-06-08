/**
 * enhance-neurons-share-cards — pure selection + payload builders for the
 * 變體 / 連結 share-hub tabs. DOM-free (the Canvas render + the Dexie reads are
 * covered by the Chrome MCP smoke); here we lock the default-featured logic and
 * payload shape.
 */

import { describe, expect, it } from 'vitest'
import { NEURON_VARIANT_TOTAL, CONNECTOR_TOTAL } from '@study-rpg/content-neurons-tw'
import type { ConnectorNeuronRow, NeuronVariantRow, VariantRarity } from '../lib/db'
import {
  buildConnectorCardPayload,
  buildVariantCardPayload,
  pickDefaultConnector,
  pickDefaultVariant,
  variantCardKey,
} from '../lib/services/character-card'

function variant(
  familyId: string,
  slotIndex: number,
  rarity: VariantRarity,
  rolledAt: number,
): NeuronVariantRow {
  return {
    familyId,
    slotIndex,
    rarity,
    displayName: `${familyId} ${rarity}`,
    spriteKey: `variant:${familyId}:${slotIndex}`,
    rolledAt,
    wasPityFloor: false,
    copies: 1,
  }
}

function connector(pairKey: string, unlockedAt: number): ConnectorNeuronRow {
  const [familyA, familyB] = pairKey.split('|')
  return { pairKey, familyA, familyB, unlockedAt, updatedAt: unlockedAt }
}

describe('pickDefaultVariant', () => {
  it('returns null for an empty collection', () => {
    expect(pickDefaultVariant([])).toBeNull()
  })

  it('prefers the rarest variant (lowest rarity rank)', () => {
    const rows = [
      variant('藥理學', 1, 'P3', 100),
      variant('解剖學', 0, 'P0', 50),
      variant('生理學', 2, 'P1', 200),
    ]
    expect(pickDefaultVariant(rows)?.rarity).toBe('P0')
  })

  it('breaks ties on most-recent roll', () => {
    const rows = [
      variant('藥理學', 1, 'P1', 100),
      variant('解剖學', 2, 'P1', 300),
      variant('生理學', 3, 'P1', 200),
    ]
    expect(pickDefaultVariant(rows)?.rolledAt).toBe(300)
  })
})

describe('pickDefaultConnector', () => {
  it('returns null when none unlocked', () => {
    expect(pickDefaultConnector([])).toBeNull()
  })

  it('returns the most-recently unlocked connector', () => {
    const rows = [
      connector('免疫學|公共衛生學', 100),
      connector('藥理學|解剖學', 500),
      connector('生理學|病理學', 300),
    ]
    expect(pickDefaultConnector(rows)?.pairKey).toBe('藥理學|解剖學')
  })
})

describe('buildVariantCardPayload', () => {
  it('maps the row + meta into a complete payload', () => {
    const row = variant('藥理學', 1, 'P1', 100)
    const payload = buildVariantCardPayload(row, {
      nickname: '阿神',
      title: '突觸大師',
      variantCount: 7,
    })
    expect(payload.displayName).toBe('藥理學 P1')
    expect(payload.familyId).toBe('藥理學')
    expect(payload.rarity).toBe('P1')
    expect(payload.rarityLabel).toBe('P1 夯')
    expect(payload.spriteKey).toBe('variant:藥理學:1')
    expect(payload.nickname).toBe('阿神')
    expect(payload.variantCount).toBe(7)
    expect(payload.variantTotal).toBe(NEURON_VARIANT_TOTAL)
    expect(typeof payload.caption).toBe('string')
    expect(payload.caption.length).toBeGreaterThan(0)
  })
})

describe('buildConnectorCardPayload', () => {
  it('derives families, colors, sprite key, and totals', () => {
    const row = connector('免疫學|公共衛生學', 4242)
    const payload = buildConnectorCardPayload(row, { nickname: '阿神', connectorCount: 3 })
    expect(payload.familyA).toBe('免疫學')
    expect(payload.familyB).toBe('公共衛生學')
    expect(payload.colorA).toMatch(/^#/)
    expect(payload.colorB).toMatch(/^#/)
    expect(payload.spriteKey).toBe('connector:免疫學|公共衛生學')
    expect(payload.unlockedAt).toBe(4242)
    expect(payload.connectorCount).toBe(3)
    expect(payload.connectorTotal).toBe(CONNECTOR_TOTAL)
  })
})

describe('variantCardKey', () => {
  it('is the familyId:slotIndex identity', () => {
    expect(variantCardKey({ familyId: '藥理學', slotIndex: 2 })).toBe('藥理學:2')
  })
})
