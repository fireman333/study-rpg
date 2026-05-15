import type { Subject } from '@study-rpg/core'

interface Props {
  subjects: Subject[]
  onAffinityIncrement: (subjectId: string) => void
}

export function DevAffinityControls({ subjects, onAffinityIncrement }: Props) {
  if (!import.meta.env.DEV) return null
  return (
    <section className="dev-panel">
      <header className="dev-panel__head">
        <span className="dev-panel__badge">DEV</span>
        <span>練習答對 (mock — wire-quiz-runner-medexam2 接好後拔掉)</span>
      </header>
      <div className="dev-panel__grid">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            className="dev-panel__btn"
            onClick={() => onAffinityIncrement(s.id)}
          >
            +1 {s.displayName}
          </button>
        ))}
      </div>
    </section>
  )
}
