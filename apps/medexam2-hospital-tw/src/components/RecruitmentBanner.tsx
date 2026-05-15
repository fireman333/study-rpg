import type { Subject } from '@study-rpg/core'

interface Props {
  subject: Subject
  affinity: number
  threshold: number
  ticketsAvailable: number
  onRoll: () => void
}

export function RecruitmentBanner({ subject, affinity, threshold, ticketsAvailable, onRoll }: Props) {
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

      {unlocked ? (
        <button type="button" className="banner__roll" disabled={!canRoll} onClick={onRoll}>
          {ticketsAvailable > 0 ? '招募一次' : '招募券不足'}
        </button>
      ) : (
        <p className="banner__locked-msg">
          再答對 <strong>{missing}</strong> 題{subject.displayName}解鎖
        </p>
      )}
    </article>
  )
}
