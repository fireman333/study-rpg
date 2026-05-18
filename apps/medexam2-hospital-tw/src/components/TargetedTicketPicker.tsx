/**
 * Targeted ticket subject picker — two-stage modal:
 *
 *   Stage 1 (picker): list unlocked banners; tap a subject → go to Stage 2.
 *                     "Save for later" footer action → close, ticket stays pending.
 *                     If 0 banners unlocked, render empty state with "了解" close.
 *
 *   Stage 2 (confirm): double-step confirmation per design.md Decision #2.
 *                      "確認指派" → call assignTargetedTicket + onClose.
 *                      "我再想想" → back to Stage 1, ticket still pending.
 *
 * Reused from two surfaces:
 *   1. FateCardPage — opened immediately after a draw resolves to targeted reward.
 *   2. Pending ticket chip (Section 6) — re-opens picker for an existing pending row.
 */

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  RECRUITMENT_THRESHOLDS,
  getContentPack,
} from '@study-rpg/content-medexam2-tw'
import type { Subject } from '@study-rpg/core'
import { getHospitalDB, type TargetedTicketRow } from '../db/schema'
import { assignTargetedTicket } from '../services/targeted-ticket'
import { tierLabel } from './TargetedDrawTutorialOverlay'

interface TargetedTicketPickerProps {
  ticketId: string
  onClose: () => void
  /** Optional toast hook — caller-provided so each host page can use its own queue. */
  onAssigned?: (subjectDisplayName: string) => void
}

export function TargetedTicketPicker({
  ticketId,
  onClose,
  onAssigned,
}: TargetedTicketPickerProps) {
  const db = getHospitalDB()
  const ticket: TargetedTicketRow | undefined = useLiveQuery(
    () => db.targetedTickets.get(ticketId),
    [ticketId],
  )
  const affinityRows = useLiveQuery(() => db.affinity.toArray(), []) ?? []
  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [confirmSubject, setConfirmSubject] = useState<Subject | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    getContentPack(`${base}/content/medexam2-tw`).then((pack) =>
      setSubjects(pack.subjects),
    )
  }, [])

  if (!ticket) {
    // Ticket no longer exists (already consumed elsewhere, or invalid id).
    return null
  }

  const affinityBySubject = new Map(affinityRows.map((r) => [r.subjectId, r.correctCount]))
  const unlockedSubjects = (subjects ?? []).filter((s) => {
    const threshold = RECRUITMENT_THRESHOLDS[s.id] ?? Infinity
    return (affinityBySubject.get(s.id) ?? 0) >= threshold
  })

  async function handleConfirmAssign() {
    if (!confirmSubject || !ticket) return
    setBusy(true)
    try {
      const result = await assignTargetedTicket(ticket.id, confirmSubject.id)
      if (result.ok) {
        onAssigned?.(confirmSubject.displayName)
        onClose()
      } else {
        // Wrong-status or not-found — close without committing.
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  // Stage 2: confirm modal (overlays Stage 1)
  if (confirmSubject) {
    return (
      <div className="modal-backdrop" onClick={() => !busy && setConfirmSubject(null)}>
        <div
          className="modal frame targeted-ticket-confirm"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="確認指派 targeted ticket"
        >
          <header className="targeted-ticket-confirm__head">
            <h2>確認指派</h2>
          </header>
          <div className="targeted-ticket-confirm__body">
            <p>
              確定要把這張 <strong>{tierLabel(ticket.sourceFateCardTier)}</strong>{' '}
              targeted ticket 指派給 <strong>{confirmSubject.displayName}</strong>？
            </p>
            <p className="muted">
              此操作不可逆。後續消耗時保證 <strong>{ticket.minRarity}+</strong> 等級。
            </p>
          </div>
          <footer className="targeted-ticket-confirm__foot">
            <button
              type="button"
              className="event-modal__secondary-btn"
              disabled={busy}
              onClick={() => setConfirmSubject(null)}
            >
              我再想想
            </button>
            <button
              type="button"
              className="event-modal__primary-btn"
              disabled={busy}
              onClick={() => void handleConfirmAssign()}
            >
              {busy ? '指派中…' : '確認指派'}
            </button>
          </footer>
        </div>
      </div>
    )
  }

  // Stage 1: picker
  const hasUnlocked = unlockedSubjects.length > 0
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal frame targeted-ticket-picker"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="選擇 targeted ticket 指派科別"
      >
        <header className="targeted-ticket-picker__head">
          <h2>選擇要指派的科別</h2>
          <p className="targeted-ticket-picker__subtitle">
            {tierLabel(ticket.sourceFateCardTier)} targeted ticket — 保證{' '}
            <strong>{ticket.minRarity}+</strong> 等級
          </p>
        </header>

        {!subjects && <p className="boot-status">載入科別中…</p>}

        {subjects && !hasUnlocked && (
          <div className="targeted-ticket-picker__empty">
            <p>
              目前沒有解鎖中的 banner — ticket 已存為 <strong>pending</strong>，
              解鎖任一科後即可指派。
            </p>
            <footer className="targeted-ticket-picker__foot">
              <button
                type="button"
                className="event-modal__primary-btn"
                onClick={onClose}
              >
                了解
              </button>
            </footer>
          </div>
        )}

        {subjects && hasUnlocked && (
          <>
            <ul className="targeted-ticket-picker__list">
              {unlockedSubjects.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="targeted-ticket-picker__option"
                    onClick={() => setConfirmSubject(s)}
                  >
                    <span className="targeted-ticket-picker__option-name">
                      {s.displayName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <footer className="targeted-ticket-picker__foot">
              <button
                type="button"
                className="event-modal__secondary-btn"
                onClick={onClose}
              >
                稍後再決定
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
