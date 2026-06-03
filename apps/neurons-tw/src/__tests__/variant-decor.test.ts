import { describe, it, expect } from 'vitest'
import { MILESTONE_STREAK_THRESHOLD, FAMILY_NT_BRANCH, type NtBranchId } from '@study-rpg/content-neurons-tw'
import type { NeuronVariantRow, NeuronVariantProvenance } from '../lib/db'
import { variantContextArt, brainwaveBand, BAND_META, type BandKey } from '../lib/variant-decor'

/**
 * context-driven-variant-art §8 — pure helper tests.
 * Covers decor mapping (標準 / 救贖 / 里程碑 / stack / 元老) and the birth-hour →
 * brain-wave band (Asia/Taipei fixed tz → cross-device deterministic; every row,
 * incl. 元老, gets a band). Band↔state canon grounded via OpenEvidence (NEJM
 * Brown 2010; Constant 2012). No DB — the helper is pure.
 */

function makeRow(
  provenance: NeuronVariantProvenance | undefined,
  rolledAt = Date.UTC(2026, 5, 2, 1, 0, 0), // Taipei 09:00 → beta by default
  familyId = '藥理學',
): NeuronVariantRow {
  return {
    familyId,
    slotIndex: 1,
    rarity: 'P3',
    displayName: '初代代謝師 · 穩態突觸',
    spriteKey: `variant:${familyId}:1`,
    rolledAt,
    wasPityFloor: false,
    ...(provenance ? { provenance } : {}),
  }
}

const prov = (over: Partial<NeuronVariantProvenance> = {}): NeuronVariantProvenance => ({
  bornAtISO: '2026-06-02',
  apAtUnlock: 10,
  wasRedemption: false,
  streakAtMint: 3,
  ...over,
})

describe('variantContextArt — decor mapping', () => {
  it('標準 (provenance, no redemption, streak < threshold) → no decor badge', () => {
    expect(variantContextArt(makeRow(prov())).decor).toEqual([])
  })

  it('救贖 (wasRedemption) → decor:redemption only', () => {
    const { decor } = variantContextArt(makeRow(prov({ wasRedemption: true })))
    expect(decor).toContain('decor:redemption')
    expect(decor).not.toContain('decor:milestone')
    expect(decor).not.toContain('decor:elder')
  })

  it('里程碑 (streakAtMint >= threshold) → decor:milestone only', () => {
    const { decor } = variantContextArt(makeRow(prov({ streakAtMint: MILESTONE_STREAK_THRESHOLD })))
    expect(decor).toContain('decor:milestone')
    expect(decor).not.toContain('decor:redemption')
    expect(decor).not.toContain('decor:elder')
  })

  it('救贖 + 里程碑 stack → both, milestone leads the row', () => {
    const { decor } = variantContextArt(
      makeRow(prov({ wasRedemption: true, streakAtMint: MILESTONE_STREAK_THRESHOLD })),
    )
    expect(decor).toEqual(['decor:milestone', 'decor:redemption'])
  })

  it('元老 (no provenance) → decor:elder only, mutually exclusive', () => {
    expect(variantContextArt(makeRow(undefined)).decor).toEqual(['decor:elder'])
  })
})

describe('brainwaveBand — birth hour (Asia/Taipei) → circadian band', () => {
  // Taipei = UTC+8 (no DST). Pick UTC epochs that land on a known Taipei hour.
  const cases: Array<[string, number, BandKey]> = [
    ['Taipei 00:00', Date.UTC(2026, 5, 1, 16, 0, 0), 'delta'],
    ['Taipei 03:00', Date.UTC(2026, 5, 1, 19, 0, 0), 'delta'],
    ['Taipei 06:00', Date.UTC(2026, 5, 1, 22, 0, 0), 'beta'],
    ['Taipei 09:00', Date.UTC(2026, 5, 2, 1, 0, 0), 'beta'],
    ['Taipei 12:00', Date.UTC(2026, 5, 2, 4, 0, 0), 'alpha'],
    ['Taipei 15:00', Date.UTC(2026, 5, 2, 7, 0, 0), 'alpha'],
    ['Taipei 18:00', Date.UTC(2026, 5, 2, 10, 0, 0), 'theta'],
    ['Taipei 21:00', Date.UTC(2026, 5, 2, 13, 0, 0), 'theta'],
  ]
  it.each(cases)('%s → %s', (_label, rolledAt, expected) => {
    expect(brainwaveBand(rolledAt)).toBe(expected)
  })

  it('variantContextArt derives band from rolledAt for a normal row', () => {
    const row = makeRow(prov(), Date.UTC(2026, 5, 1, 19, 0, 0)) // Taipei 03:00 → delta
    expect(variantContextArt(row).band).toBe('delta')
  })

  it('元老 (no provenance) still gets a band from rolledAt', () => {
    const row = makeRow(undefined, Date.UTC(2026, 5, 2, 13, 0, 0)) // Taipei 21:00 → theta
    const art = variantContextArt(row)
    expect(art.decor).toEqual(['decor:elder'])
    expect(art.band).toBe('theta')
  })

  it('BAND_META defines all four bands with a colour + frequency range', () => {
    expect(Object.keys(BAND_META).sort()).toEqual(['alpha', 'beta', 'delta', 'theta'])
    for (const m of Object.values(BAND_META)) {
      expect(m.color).toMatch(/^#/)
      expect(m.hz).toMatch(/Hz/)
    }
  })
})

describe('variantContextArt — NT-branch derivation (add-neurons-per-branch-decor)', () => {
  // Hardcoded canonical expectation (NOT derived from FAMILY_NT_BRANCH) so an
  // accidental edit to the map is caught. Mirrors the spec scenario.
  const EXPECTED: Record<string, NtBranchId> = {
    藥理學: 'DA',
    公共衛生學: 'DA',
    寄生蟲學: '5HT',
    組織學: '5HT',
    生物化學: 'GABA',
    病理學: 'GABA',
    免疫學: 'GABA',
    解剖學: 'Glu',
    生理學: 'Glu',
    胚胎學: 'Glu',
    微生物學: 'Glu',
  }

  it('every one of the 11 families resolves to its canonical NT branch', () => {
    for (const [familyId, branch] of Object.entries(EXPECTED)) {
      const art = variantContextArt(makeRow(prov(), undefined, familyId))
      expect(art.branch, familyId).toBe(branch)
    }
  })

  it('FAMILY_NT_BRANCH (the single source) matches the canonical expectation exactly', () => {
    expect(FAMILY_NT_BRANCH).toEqual(EXPECTED)
  })

  it('an unknown familyId yields a null branch (composer falls back to universal)', () => {
    const art = variantContextArt(makeRow(prov(), undefined, '不存在的科目'))
    expect(art.branch).toBeNull()
  })

  it('branch derivation does not disturb the decor or band channels', () => {
    // 救贖 + 里程碑 Glu family → same decor + band as the family-agnostic case.
    const art = variantContextArt(
      makeRow(
        prov({ wasRedemption: true, streakAtMint: MILESTONE_STREAK_THRESHOLD }),
        Date.UTC(2026, 5, 1, 19, 0, 0), // Taipei 03:00 → delta
        '解剖學',
      ),
    )
    expect(art.decor).toEqual(['decor:milestone', 'decor:redemption'])
    expect(art.band).toBe('delta')
    expect(art.branch).toBe('Glu')
  })
})
