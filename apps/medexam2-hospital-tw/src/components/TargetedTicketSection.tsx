/**
 * Assigned targeted tickets section on HomePage — listed above the banner grid.
 *
 * Renders nothing if zero assigned tickets exist (spec recruitment-gacha "No
 * targeted tickets hides the section"). Each row shows subject, floor badge,
 * source tier; consume button triggers confirm modal → service call → reveal
 * via parent-supplied onConsumed callback (parent owns the doctor reveal UI).
 */

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Subject } from '@study-rpg/core'
import { getHospitalDB, type DoctorRow, type TargetedTicketRow } from '../db/schema'
import { consumeTargetedTicket } from '../services/targeted-ticket'
import { tierLabel } from './TargetedDrawTutorialOverlay'

interface TargetedTicketSectionProps {
  subjects: Subject[]
  onConsumed: (doctor: DoctorRow) => void
  onError: (msg: string) => void
}

export function TargetedTicketSection({
  subjects,
  onConsumed,
  onError,
}: TargetedTicketSectionProps) {
  const db = getHospitalDB()
  const assigned = useLiveQuery(
    () => db.targetedTickets.where('status').equals('assigned').toArray(),
    [],
  )
  const [confirmTicket, setConfirmTicket] = useState<TargetedTicketRow | null>(null)
  const [busy, setBusy] = useState(false)

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  if (!assigned || assigned.length === 0) return null

  async function handleConfirmConsume() {
    if (!confirmTicket || !confirmTicket.subjectId) return
    const subject = subjectMap.get(confirmTicket.subjectId)
    if (!subject) {
      onError(`未知科別：${confirmTicket.subjectId}`)
      setConfirmTicket(null)
      return
    }
    setBusy(true)
    try {
      const result = await consumeTargetedTicket(confirmTicket.id, subject)
      if (result.ok) {
        setConfirmTicket(null)
        onConsumed(result.doctor)
      } else {
        onError(`使用失敗：${result.reason}`)
        setConfirmTicket(null)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="targeted-ticket-section" aria-label="指定科招募券">
        <h2 className="targeted-ticket-section__title">🎫 指定科招募券</h2>
        <ul className="targeted-ticket-section__list">
          {assigned.map((ticket) => {
            const subject = subjectMap.get(ticket.subjectId ?? '')
            const displayName = subject?.displayName ?? ticket.subjectId ?? '未知科別'
            return (
              <li key={ticket.id} className="targeted-ticket-section__row">
                <div className="targeted-ticket-section__info">
                  <span className="targeted-ticket-section__subject">{displayName}</span>
                  <span className="targeted-ticket-section__floor">
                    保證 {ticket.minRarity}+
                  </span>
                  <span className="targeted-ticket-section__tier">
                    {tierLabel(ticket.sourceFateCardTier)}
                  </span>
                </div>
                <button
                  type="button"
                  className="targeted-ticket-section__consume"
                  onClick={() => setConfirmTicket(ticket)}
                >
                  使用
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {confirmTicket && (
        <div className="modal-backdrop" onClick={() => !busy && setConfirmTicket(null)}>
          <div
            className="modal frame targeted-ticket-confirm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="確認使用 targeted ticket"
          >
            <header className="targeted-ticket-confirm__head">
              <h2>確認使用招募券</h2>
            </header>
            <div className="targeted-ticket-confirm__body">
              <p>
                確定使用 <strong>{subjectMap.get(confirmTicket.subjectId ?? '')?.displayName}</strong> 的{' '}
                {tierLabel(confirmTicket.sourceFateCardTier)} targeted ticket？
              </p>
              <p className="muted">保證 {confirmTicket.minRarity}+ 等級。</p>
            </div>
            <footer className="targeted-ticket-confirm__foot">
              <button
                type="button"
                className="event-modal__secondary-btn"
                disabled={busy}
                onClick={() => setConfirmTicket(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="event-modal__primary-btn"
                disabled={busy}
                onClick={() => void handleConfirmConsume()}
              >
                {busy ? '使用中…' : '確認使用'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
