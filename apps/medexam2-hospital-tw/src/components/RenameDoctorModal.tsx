import { useState } from 'react'
import type { DoctorRow } from '../db/schema'
import {
  DOCTOR_NAME_MAX_LENGTH,
  renameDoctor,
  restoreDefaultDoctorName,
} from '../services/rename-doctor'

interface Props {
  doctor: DoctorRow
  onClose: () => void
}

export function RenameDoctorModal({ doctor, onClose }: Props) {
  const [value, setValue] = useState(doctor.name)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const charCount = value.trim().length
  const overLimit = charCount > DOCTOR_NAME_MAX_LENGTH

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await renameDoctor(doctor.id, value)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '改名失敗')
      setSubmitting(false)
    }
  }

  async function handleReset() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await restoreDefaultDoctorName(doctor.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '還原失敗')
      setSubmitting(false)
      setConfirmingReset(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="改名"
      onClick={onClose}
    >
      <form
        className="modal frame rename-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <h2>✏️ 為醫師改名</h2>
          <button
            type="button"
            className="rename-modal__close"
            onClick={onClose}
            aria-label="關閉"
          >
            ✕
          </button>
        </div>

        <p className="rename-modal__subject">
          {doctor.rarity} · {doctor.subjectId} · 目前：<strong>{doctor.name}</strong>
        </p>

        <label className="rename-modal__field">
          <span>新名字</span>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
              setConfirmingReset(false)
            }}
            maxLength={DOCTOR_NAME_MAX_LENGTH * 2}
            autoFocus
            disabled={submitting}
          />
          <span className={`rename-modal__counter${overLimit ? ' rename-modal__counter--over' : ''}`}>
            {charCount} / {DOCTOR_NAME_MAX_LENGTH}
          </span>
        </label>

        {error && <p className="rename-modal__error">⚠️ {error}</p>}

        <div className="rename-modal__actions">
          <button
            type="submit"
            className="rename-modal__primary"
            disabled={submitting || charCount === 0 || overLimit}
          >
            {submitting ? '處理中…' : '確認改名'}
          </button>
          <button
            type="button"
            className="rename-modal__secondary"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </button>
        </div>

        <div className="rename-modal__reset-row">
          {confirmingReset ? (
            <>
              <span className="rename-modal__reset-hint">確定還原成預設名？</span>
              <button
                type="button"
                className="rename-modal__reset-confirm"
                onClick={handleReset}
                disabled={submitting}
              >
                是，還原
              </button>
              <button
                type="button"
                className="rename-modal__reset-cancel"
                onClick={() => setConfirmingReset(false)}
                disabled={submitting}
              >
                算了
              </button>
            </>
          ) : (
            <button
              type="button"
              className="rename-modal__reset"
              onClick={() => setConfirmingReset(true)}
              disabled={submitting}
            >
              還原預設名
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
