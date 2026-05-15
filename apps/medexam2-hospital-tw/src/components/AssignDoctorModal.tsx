import { useEffect, useState } from 'react'
import {
  RARITY_LABELS,
  ROOM_TYPE_LABELS,
  computeThroughput,
  type Room,
} from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { lookupSprite } from '../lib/sprite-lookup'
import type { DoctorRow } from '../db/schema'
import { assignDoctor, unassignDoctor, getUnassignedDoctors } from '../lib/assignment'

interface AssignDoctorModalProps {
  room: Room
  currentDoctor: DoctorRow | null
  onClose: () => void
}

export function AssignDoctorModal({ room, currentDoctor, onClose }: AssignDoctorModalProps) {
  const [candidates, setCandidates] = useState<DoctorRow[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const unassigned = await getUnassignedDoctors()
      // Include the room's current doctor at the top so swap UX is one click
      const ordered = currentDoctor ? [currentDoctor, ...unassigned] : unassigned
      if (!cancelled) setCandidates(ordered)
    })()
    return () => {
      cancelled = true
    }
  }, [currentDoctor])

  async function handlePick(doctor: DoctorRow) {
    if (busy) return
    setBusy(true)
    try {
      if (doctor.id === currentDoctor?.id) {
        // No-op: re-selecting the already-assigned doctor; just close
      } else {
        await assignDoctor(room.id, doctor.id)
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function handleUnassign() {
    if (busy) return
    setBusy(true)
    try {
      await unassignDoctor(room.id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--assign" onClick={(e) => e.stopPropagation()}>
        <header className="assign-modal__head">
          <h2 className="assign-modal__title">
            {ROOM_TYPE_LABELS[room.type]} #{room.slot}
          </h2>
          <p className="assign-modal__subtitle">
            選擇醫師指派（基礎產能 {room.baseRate}/分，設施 ×{room.roomFacility.toFixed(1)}）
          </p>
        </header>

        {candidates.length === 0 ? (
          <p className="assign-modal__empty">
            目前沒有可指派的醫師。回主畫面累積親和值招募吧！
          </p>
        ) : (
          <ul className="assign-modal__list">
            {candidates.map((d) => {
              const isCurrent = d.id === currentDoctor?.id
              const throughput = computeThroughput(room, d)
              const spriteUrl = lookupSprite(d.spriteKey, THEME_PIXEL_HOSPITAL.sprites, d.rarity)
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    className={`assign-modal__row ${isCurrent ? 'assign-modal__row--current' : ''}`}
                    onClick={() => void handlePick(d)}
                    disabled={busy}
                    style={{ ['--rarity-color' as string]: `var(--rarity-${d.rarity.toLowerCase()})` } as React.CSSProperties}
                  >
                    <span className="assign-modal__sprite">
                      {spriteUrl ? <img src={spriteUrl} alt="" /> : <span aria-hidden>🩺</span>}
                    </span>
                    <span className="assign-modal__info">
                      <span className="assign-modal__name">{d.name}</span>
                      <span className="assign-modal__meta">
                        {d.rarity} {RARITY_LABELS[d.rarity]} · ×{d.powerMultiplier.toFixed(1)}
                      </span>
                    </span>
                    <span className="assign-modal__throughput">
                      {throughput.toFixed(1)}/分
                      {isCurrent && <small>（目前）</small>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="assign-modal__actions">
          {currentDoctor && (
            <button
              type="button"
              className="assign-modal__unassign"
              onClick={() => void handleUnassign()}
              disabled={busy}
            >
              取消指派
            </button>
          )}
          <button type="button" className="modal-card__close" onClick={onClose} disabled={busy}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}

