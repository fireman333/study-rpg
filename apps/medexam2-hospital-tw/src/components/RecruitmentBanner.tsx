import type { Subject } from '@study-rpg/core'
import type { MasteryRow } from '../db/schema'
import { formatMasteryPercent } from '../lib/mastery'

interface Props {
  subject: Subject
  affinity: number
  threshold: number
  ticketsAvailable: number
  mastery?: MasteryRow
  onRoll: () => void
  onStartQuiz: () => void
}

export function RecruitmentBanner({
  subject,
  affinity,
  threshold,
  ticketsAvailable,
  mastery,
  onRoll,
  onStartQuiz,
}: Props) {
  const unlocked = affinity >= threshold
  const missing = Math.max(0, threshold - affinity)
  const canRoll = unlocked && ticketsAvailable > 0
  const progressPct = Math.min(100, Math.round((affinity / threshold) * 100))

  return (
    <article
      className={`banner ${unlocked ? 'banner--unlocked' : 'banner--locked'}`}
      style={{ ['--banner-color' as string]: subject.color }}
    >
      <header className="banner__head">
        <h3 className="banner__title">{subject.displayName}</h3>
        <span className="banner__group">{subject.group}</span>
      </header>

      <div className="banner__progress">
        <div className="banner__progress-bar" style={{ width: `${progressPct}%` }} aria-hidden />
        <span className="banner__progress-text">
          {affinity} / {threshold}
        </span>
      </div>

      <div className="banner__mastery">{formatMasteryPercent(mastery)}</div>

      <div className="banner__actions">
        <button type="button" className="banner__study" onClick={onStartQuiz}>
          📚 學習
        </button>
        <button
          type="button"
          className="banner__roll"
          disabled={!canRoll}
          onClick={onRoll}
          title={
            unlocked
              ? ticketsAvailable > 0
                ? '消耗 1 張券抽一位醫師'
                : '招募券不足'
              : `再答對 ${missing} 題${subject.displayName}解鎖`
          }
        >
          🎫 招募
        </button>
      </div>
      {!unlocked && (
        <p className="banner__locked-msg">
          再答對 <strong>{missing}</strong> 題{subject.displayName}解鎖招募
        </p>
      )}
    </article>
  )
}
