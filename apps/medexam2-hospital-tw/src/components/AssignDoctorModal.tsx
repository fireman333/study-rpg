import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  FACILITY_LEVEL_TO_FACILITY,
  FACILITY_MAX_LEVEL,
  FACILITY_UPGRADE_COSTS,
  RARITY_LABELS,
  ROOM_TYPE_LABELS,
  computeThroughput,
  type Room,
} from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { lookupSprite } from '../lib/sprite-lookup'
import { getHospitalDB, type DoctorRow } from '../db/schema'
import { assignDoctor, unassignDoctor, getUnassignedDoctors } from '../lib/assignment'
import { upgradeFacility } from '../services/facility'

interface AssignDoctorModalProps {
  room: Room
  currentDoctor: DoctorRow | null
  onClose: () => void
}

export function AssignDoctorModal({ room: initialRoom, currentDoctor, onClose }: AssignDoctorModalProps) {
  const db = getHospitalDB()
  // Live-track the room so facility upgrades reflect immediately in the modal
  const liveRoom = useLiveQuery(() => db.rooms.get(initialRoom.id), [initialRoom.id])
  const room = liveRoom ?? initialRoom
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const [candidates, setCandidates] = useState<DoctorRow[]>([])
  const [busy, setBusy] = useState(false)
  const [facilityError, setFacilityError] = useState<string | null>(null)

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

  async function handleUpgradeFacility() {
    if (busy) return
    setBusy(true)
    setFacilityError(null)
    try {
      const result = await upgradeFacility(room.id)
      if (result.kind === 'aborted') {
        setFacilityError(
          result.reason === 'max-level'
            ? '已達最高等級'
            : `營收不足（需要 ${result.requiredRevenue.toLocaleString('zh-TW')} 💰）`,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const currentLevel = room.facilityLevel ?? 1
  const nextLevel = currentLevel + 1
  const isMaxed = currentLevel >= FACILITY_MAX_LEVEL
  const upgradeCost = isMaxed ? 0 : FACILITY_UPGRADE_COSTS[nextLevel]
  const nextMultiplier = isMaxed ? room.roomFacility : FACILITY_LEVEL_TO_FACILITY[nextLevel]
  const canAffordUpgrade = (counters?.revenue ?? 0) >= upgradeCost
  const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })

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

        <section className="assign-modal__facility" aria-label="設施升級">
          <h3 className="assign-modal__facility-title">設施升級</h3>
          <p className="assign-modal__facility-current">
            目前等級：<strong>Lv.{currentLevel}</strong>（×{room.roomFacility.toFixed(1)}）
            {isMaxed && <span className="muted">{' '}— 已達 Lv.{FACILITY_MAX_LEVEL} 上限</span>}
          </p>
          {!isMaxed && (
            <>
              <p className="assign-modal__facility-next">
                升級至 <strong>Lv.{nextLevel}</strong>（×{nextMultiplier.toFixed(1)}）
                {'　成本 '}
                <strong>{fmt(upgradeCost)} 💰</strong>
              </p>
              <button
                type="button"
                className="primary-btn assign-modal__facility-btn"
                onClick={() => void handleUpgradeFacility()}
                disabled={busy || !canAffordUpgrade}
                title={canAffordUpgrade ? '' : `營收不足（需要 ${fmt(upgradeCost)} 💰）`}
              >
                {canAffordUpgrade ? '升級設施' : `需要 ${fmt(upgradeCost)} 💰`}
              </button>
              {facilityError && <p className="assign-modal__facility-error">{facilityError}</p>}
            </>
          )}
        </section>

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

