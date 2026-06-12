/**
 * Category × tier achievement badge — atlas-mode rendering.
 *
 * Atlas: `apps/neurons-tw/src/assets/achievements/badge-atlas.png`
 * Layout: 896×512 px = 7 columns × 4 rows × 128 px cells (16-color GBA palette,
 * transparent bg). Column index = category, row index = tier (P4 top → P1
 * bottom). Atlas generated via codex CLI per `generate-neurons-achievement-
 * atlases` change.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import {
  NEURONS_ACHIEVEMENTS,
  CATEGORY_LABEL,
  TIER_LABEL,
  type NeuronsAchievementCategory,
  type NeuronsAchievementTier,
} from '@study-rpg/content-neurons-tw'
import badgeAtlasUrl from '../assets/achievements/badge-atlas.png'

export interface BadgeSpriteProps {
  category: NeuronsAchievementCategory
  tier: NeuronsAchievementTier
  size?: number
  locked?: boolean
  /**
   * Accessible label / hover tooltip override. Defaults to the representative
   * achievement name(s) for this (category, tier) resolved from the catalog.
   */
  ariaLabel?: string
}

/**
 * Resolve a hover-tooltip label for a badge from the achievement catalog.
 *
 * A leaderboard badge encodes only `<category>:<tier>` (the highest tier
 * unlocked per category), so it cannot point at one specific achievement.
 * When more than one achievement shares that (category, tier) — e.g. two
 * different `quiz P2` achievements — we join all their names with " / " so the
 * viewer can recognise whichever one they actually unlocked. The badge art and
 * tier semantics are identical regardless of which achievement triggered it.
 *
 * Falls back to a generic「<tier>級<category>成就」label if the catalog has no
 * match (e.g. a future category not yet populated).
 */
export function resolveBadgeLabel(
  category: NeuronsAchievementCategory,
  tier: NeuronsAchievementTier,
): string {
  const names = NEURONS_ACHIEVEMENTS.filter(
    (a) => a.category === category && a.tier === tier,
  ).map((a) => a.name)
  if (names.length > 0) return names.join(' / ')
  return `${TIER_LABEL[tier]}級${CATEGORY_LABEL[category]}成就`
}

// Column index per category (atlas left-to-right ordering).
const CATEGORY_COL: Record<NeuronsAchievementCategory, number> = {
  study: 0,
  quiz: 1,
  variant: 2,
  synapse: 3,
  mastery: 4,
  fortune: 5,
  hidden: 6,
}

// Row index per tier (atlas top-to-bottom ordering — bronze P4 first, diamond P1 last).
const TIER_ROW: Record<NeuronsAchievementTier, number> = {
  P4: 0,
  P3: 1,
  P2: 2,
  P1: 3,
}

const NUM_COLS = 7
const NUM_ROWS = 4

export function BadgeSprite({
  category,
  tier,
  size = 48,
  locked = false,
  ariaLabel,
}: BadgeSpriteProps): JSX.Element {
  const col = CATEGORY_COL[category]
  const row = TIER_ROW[tier]
  // CSS background-position percentage formula for sprite atlas: when
  // background-size is N*100% (atlas spans N container widths), cell K is at
  //   bg-position-x = K / (N-1) * 100%   (positive — NOT negative).
  // For N=1 single cell, position = 0%. Guard against div-by-zero.
  const xPct = NUM_COLS > 1 ? (col * 100) / (NUM_COLS - 1) : 0
  const yPct = NUM_ROWS > 1 ? (row * 100) / (NUM_ROWS - 1) : 0
  // Locked badges must NOT reveal the achievement name — the achievements page
  // masks locked names as「????」on purpose. Tier + category are already shown
  // openly on the card, so the generic locked label exposes only those.
  const label =
    ariaLabel ??
    (locked
      ? `${TIER_LABEL[tier]}級${CATEGORY_LABEL[category]}成就（尚未解鎖）`
      : resolveBadgeLabel(category, tier))

  return (
    <div
      role="img"
      aria-label={label}
      // `data-tooltip` is picked up by <CustomTooltipHost> for a fast, styled
      // hover tooltip (mirrors 二階). No-op on touch devices.
      data-tooltip={label}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${badgeAtlasUrl})`,
        backgroundPosition: `${xPct}% ${yPct}%`,
        backgroundSize: `${NUM_COLS * 100}% ${NUM_ROWS * 100}%`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        flexShrink: 0,
        userSelect: 'none',
        filter: locked ? 'grayscale(80%) opacity(0.6)' : undefined,
      }}
    />
  )
}
