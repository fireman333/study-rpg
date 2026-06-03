/**
 * Correct-answer squad celebration — a row of the active squad's variants that
 * bounces in sync when the player answers correctly in QuizModal
 * (add-neurons-study-squad). Renders nothing for an empty squad.
 *
 * The bounce is a CSS class (`.squad-celebrate`) guarded by
 * `prefers-reduced-motion: reduce` (static under reduced motion). Remount via a
 * `key` at the call site replays the animation per correct answer.
 *
 * Capability spec: openspec/specs/neurons-study-squad/spec.md
 */

import type { NeuronVariantRow } from '../lib/db'
import { variantKey } from '../lib/services/study-squad'
import VariantSprite from './VariantSprite'

interface Props {
  squad: NeuronVariantRow[]
  size?: number
}

export default function SquadCelebration({ squad, size = 44 }: Props): JSX.Element | null {
  if (squad.length === 0) return null
  return (
    <div style={rowStyle} aria-label="出戰隊伍歡呼" aria-hidden>
      {squad.map((row, i) => (
        <span
          key={variantKey(row.familyId, row.slotIndex)}
          className="squad-celebrate"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <VariantSprite row={row} size={size} />
        </span>
      ))}
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-end',
  gap: '0.3rem',
  marginTop: '0.4rem',
}
