import { useState } from 'react'
import type { Subject } from '@study-rpg/core'
import { attemptStarterPull, type StarterPullOutcome } from '../services/starter-pull'

interface Props {
  subjects: Subject[]
  onClose: () => void
  onResult: (outcome: Extract<StarterPullOutcome, { ok: true }>) => void
}

export function StarterPullModal({ subjects, onClose, onResult }: Props) {
  const [picked, setPicked] = useState<Subject | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm(): Promise<void> {
    if (!picked || busy) return
    setBusy(true)
    setError(null)
    const out = await attemptStarterPull(picked)
    setBusy(false)
    if (out.ok) {
      onResult(out)
    } else if (out.reason === 'already-used') {
      setError('首抽已經用過了。')
    } else {
      setError('未知的科別。')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--starter" onClick={(e) => e.stopPropagation()}>
        <header className="starter-modal__head">
          <h2 className="starter-modal__title">⭐ 選擇首抽科別</h2>
          <p className="starter-modal__subtitle">保底 P4+（不消耗券、不需親密度）</p>
        </header>

        <ul className="starter-modal__grid">
          {subjects.map((s) => {
            const isPicked = s.id === picked?.id
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`starter-modal__chip ${isPicked ? 'starter-modal__chip--picked' : ''}`}
                  onClick={() => setPicked(s)}
                  style={{ ['--banner-color' as string]: s.color }}
                  disabled={busy}
                >
                  <span className="starter-modal__chip-name">{s.displayName}</span>
                  <span className="starter-modal__chip-group">{s.group}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {error && <p className="starter-modal__error" role="alert">{error}</p>}

        <footer className="starter-modal__foot">
          <button type="button" className="modal-card__close" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="starter-modal__confirm"
            onClick={() => void handleConfirm()}
            disabled={!picked || busy}
          >
            {busy ? '抽卡中…' : picked ? `確認抽 ${picked.displayName}` : '請先選一科'}
          </button>
        </footer>
      </div>
    </div>
  )
}
