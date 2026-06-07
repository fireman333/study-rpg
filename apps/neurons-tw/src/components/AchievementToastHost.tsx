/**
 * Subscriber bridge between achievement toast queue and the motion library
 * `<Toast>` primitive. Renders P2 / P3 / P4 unlocks (P1 routes through the
 * full-screen modal instead).
 *
 * Visual stack: top-right vertical, mirrors `ConnectomeToastHost` placement
 * but uses motion library `<Toast>` (which is top-center). Keep one toast
 * visible at a time per shipping spec — first in, first out.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import { useEffect, useState } from 'react'
import { Toast } from '../lib/motion'
import {
  dismissToast,
  subscribeAchievementToasts,
  type QueuedAchievement,
} from '../lib/achievement-toast-queue'
import { BadgeSprite } from './BadgeSprite'
import { EmojiIcon } from './EmojiIcon'
import { TIER_LABEL } from '@study-rpg/content-neurons-tw'

export default function AchievementToastHost(): JSX.Element | null {
  const [queue, setQueue] = useState<QueuedAchievement[]>([])

  useEffect(() => {
    return subscribeAchievementToasts((snap) => setQueue(snap.toasts))
  }, [])

  const visible = queue[0]
  if (!visible) return null

  const { achievement } = visible
  return (
    <Toast variant="celebratory" onDismiss={() => dismissToast(achievement.id)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <BadgeSprite category={achievement.category} tier={achievement.tier} size={48} />
        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 2 }}>
            <EmojiIcon char="🏆" size={12} /> 解鎖成就 · {TIER_LABEL[achievement.tier]}
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{achievement.name}</div>
          <div style={{ fontSize: 13, marginTop: 2, opacity: 0.9 }}>
            {achievement.description}
          </div>
        </div>
      </div>
    </Toast>
  )
}
