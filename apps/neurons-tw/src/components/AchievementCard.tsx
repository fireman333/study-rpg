/**
 * Single achievement card on `/achievements` page. Locked entries show as
 * silhouette (greyscale + 「未解鎖」). Hidden entries are filtered upstream
 * — they never reach this component unless unlocked.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import type { NeuronsAchievement } from '@study-rpg/content-neurons-tw'
import { TIER_LABEL, CATEGORY_LABEL } from '@study-rpg/content-neurons-tw'
import { BadgeSprite } from './BadgeSprite'

export interface AchievementCardProps {
  achievement: NeuronsAchievement
  unlocked: boolean
  unlockedAt?: number
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-CA')
}

export function AchievementCard({
  achievement,
  unlocked,
  unlockedAt,
}: AchievementCardProps): JSX.Element {
  const rewardChip =
    unlocked && achievement.reward.kind === 'title'
      ? `稱號：${achievement.reward.title}`
      : null

  return (
    <article
      style={{
        background: unlocked ? '#f4ecd8' : '#e8dfc6',
        border: `2px solid ${unlocked ? '#b58900' : '#5a4d3a'}`,
        boxShadow: unlocked ? '4px 4px 0 #5a3f29' : '4px 4px 0 #3a3128',
        padding: '0.85rem 1rem',
        display: 'flex',
        gap: '0.85rem',
        alignItems: 'flex-start',
        opacity: unlocked ? 1 : 0.7,
        fontFamily: 'var(--font-pixel-cjk)',
        color: '#5a3f29',
      }}
    >
      <BadgeSprite
        category={achievement.category}
        tier={achievement.tier}
        size={64}
        locked={!unlocked}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {unlocked ? achievement.name : '????'}
          </span>
          <span style={{ fontSize: 11, opacity: 0.75 }}>
            {TIER_LABEL[achievement.tier]} · {CATEGORY_LABEL[achievement.category]}
          </span>
        </div>
        <p style={{ fontSize: 13, margin: '0.3rem 0 0.4rem 0', lineHeight: 1.45 }}>
          {unlocked ? achievement.description : '未解鎖 — 達成條件後揭曉。'}
        </p>
        <div style={{ fontSize: 11, opacity: 0.7 }}>
          {unlocked && unlockedAt
            ? `🏆 ${formatDate(unlockedAt)} 解鎖`
            : '🔒 未解鎖'}
          {rewardChip ? <span style={{ marginLeft: '0.6rem' }}>· {rewardChip}</span> : null}
        </div>
      </div>
    </article>
  )
}
