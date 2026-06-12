import { describe, it, expect } from 'vitest'
import {
  NEURONS_ACHIEVEMENTS,
  NEURONS_ACHIEVEMENT_CATEGORIES,
  type NeuronsAchievementCategory,
  type NeuronsAchievementTier,
} from '@study-rpg/content-neurons-tw'
import { resolveBadgeLabel } from '../components/BadgeSprite'

/**
 * add-neurons-leaderboard-badge-tooltip — the leaderboard badge hover tooltip
 * resolves a representative achievement name (or `/`-joined names) per
 * (category, tier) from the catalog, falling back to a generic label.
 */

const TIERS: NeuronsAchievementTier[] = ['P1', 'P2', 'P3', 'P4']

function catalogNames(
  category: NeuronsAchievementCategory,
  tier: NeuronsAchievementTier,
): string[] {
  return NEURONS_ACHIEVEMENTS.filter(
    (a) => a.category === category && a.tier === tier,
  ).map((a) => a.name)
}

describe('resolveBadgeLabel', () => {
  it('returns the catalog achievement name for a single-entry (category, tier)', () => {
    // study:P4 has exactly one achievement in the catalog.
    const names = catalogNames('study', 'P4')
    expect(names.length).toBe(1)
    expect(resolveBadgeLabel('study', 'P4')).toBe(names[0])
  })

  it('joins multiple achievement names at the same (category, tier) with " / "', () => {
    // quiz:P2 has two distinct achievements sharing the badge cell.
    const names = catalogNames('quiz', 'P2')
    expect(names.length).toBeGreaterThan(1)
    const label = resolveBadgeLabel('quiz', 'P2')
    expect(label).toBe(names.join(' / '))
    expect(label.split(' / ').length).toBe(names.length)
  })

  it('resolves the catalog-derived label for every populated (category, tier) pair', () => {
    for (const category of NEURONS_ACHIEVEMENT_CATEGORIES) {
      for (const tier of TIERS) {
        const names = catalogNames(category, tier)
        if (names.length === 0) continue
        const label = resolveBadgeLabel(category, tier)
        expect(label).toBe(names.join(' / '))
        expect(label.length).toBeGreaterThan(0)
      }
    }
  })
})
