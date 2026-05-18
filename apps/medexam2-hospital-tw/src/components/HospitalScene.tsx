import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { type HospitalTier } from '@study-rpg/content-medexam2-tw'
import type { SlotPosition } from '@study-rpg/core'
import { getHospitalDB } from '../db/schema'
import { UpgradeModal } from './UpgradeModal'

const TIER_TO_KEY: Record<HospitalTier, 'tier1' | 'tier2' | 'tier3' | 'tier4'> = {
  診所: 'tier1',
  區域醫院: 'tier2',
  醫學中心: 'tier3',
  國家級教學醫院: 'tier4',
}

const SCENE_WIDTH = 768
const SCENE_HEIGHT = 384

const ROOM_LABEL: Record<SlotPosition['room'], string> = {
  ward: '病房',
  outpatient: '門診',
  surgery: '開刀房',
}

// Shelf is laid out in 2 visual rows. Row 1 = outpatient alone (largest single
// group); Row 2 = ward + surgery side by side. Sized so each row roughly
// matches the other in cell count for a balanced look.
const SHELF_ROW_LAYOUT: SlotPosition['room'][][] = [
  ['outpatient'],
  ['ward', 'surgery'],
]

export function HospitalScene() {
  const db = getHospitalDB()
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const doctors = useLiveQuery(() => db.doctors.toArray(), []) ?? []
  const rooms = useLiveQuery(() => db.rooms.toArray(), []) ?? []
  const [modalOpen, setModalOpen] = useState(false)

  const sceneEnabled = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('scene') !== 'off'
  }, [])

  const renderState = useMemo(() => {
    if (!sceneEnabled) return null
    if (!counters) return null
    const scenes = THEME_PIXEL_HOSPITAL.scenes
    const slotPositions = THEME_PIXEL_HOSPITAL.doctorSlotPositions
    if (!scenes || !slotPositions) return null

    const tier = counters.tier
    const tierKey = TIER_TO_KEY[tier]
    const sceneUrl = scenes[tierKey]
    const slots = slotPositions[tierKey] ?? []

    // Group slots by room type, preserving order
    const slotsByRoom: Record<SlotPosition['room'], SlotPosition[]> = {
      ward: [],
      outpatient: [],
      surgery: [],
    }
    for (const slot of slots) slotsByRoom[slot.room].push(slot)

    // Assigned doctors only, sorted by obtainedAt (deterministic first-assigned-first-rendered)
    const assignedDoctors = doctors
      .filter((d) => d.assignedRoom !== null)
      .sort((a, b) => a.obtainedAt - b.obtainedAt)

    const roomById = new Map(rooms.map((r) => [r.id, r]))

    // Build per-room-type shelves: for each room slot in the current tier,
    // either fill with an assigned doctor or leave as a "?" placeholder so the
    // capacity ceiling is visible. Each room type renders as its own scrollable
    // group so visually-grouped semantics replace the per-cell room chip.
    type ShelfCell =
      | { kind: 'doctor'; key: string; spriteUrl: string; name: string; subjectId: string; rarity: string }
      | { kind: 'empty'; key: string }

    const slotCursor: Record<SlotPosition['room'], number> = { ward: 0, outpatient: 0, surgery: 0 }
    const shelfByRoom: Record<SlotPosition['room'], ShelfCell[]> = { ward: [], outpatient: [], surgery: [] }

    for (const doctor of assignedDoctors) {
      if (!doctor.assignedRoom) continue
      const room = roomById.get(doctor.assignedRoom)
      if (!room) continue
      const roomType = room.type
      const idx = slotCursor[roomType]
      if (idx >= slotsByRoom[roomType].length) continue
      const spriteUrl = THEME_PIXEL_HOSPITAL.sprites[doctor.spriteKey]
      if (!spriteUrl) continue
      shelfByRoom[roomType].push({
        kind: 'doctor',
        key: doctor.id,
        spriteUrl,
        name: doctor.name,
        subjectId: doctor.subjectId,
        rarity: doctor.rarity,
      })
      slotCursor[roomType] += 1
    }

    // Pad each room's group with empty cells up to its slot count
    const ROOM_ORDER: SlotPosition['room'][] = ['ward', 'outpatient', 'surgery']
    for (const rt of ROOM_ORDER) {
      const total = slotsByRoom[rt].length
      for (let i = shelfByRoom[rt].length; i < total; i++) {
        shelfByRoom[rt].push({ kind: 'empty', key: `empty-${rt}-${i}` })
      }
    }

    const groups = ROOM_ORDER.map((rt) => ({
      roomType: rt,
      cells: shelfByRoom[rt],
      filledCount: slotCursor[rt],
      totalCount: slotsByRoom[rt].length,
    })).filter((g) => g.totalCount > 0)

    return { tier, sceneUrl, groups, reputation: counters.reputation }
  }, [counters, doctors, rooms, sceneEnabled])

  if (!renderState) return null

  const { tier, sceneUrl, groups, reputation } = renderState

  return (
    <>
      <section
        className="hospital-scene"
        aria-label={`醫院場景：${tier}`}
      >
        <div
          className="hospital-scene__canvas"
          onClick={() => setModalOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setModalOpen(true)
            }
          }}
        >
          <img
            className="hospital-scene__bg"
            src={sceneUrl}
            alt={`Hospital scene: ${tier}`}
            width={SCENE_WIDTH}
            height={SCENE_HEIGHT}
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
            }}
          />
        </div>

        <div className="doctor-shelf" aria-label="醫院員工名牌">
          {SHELF_ROW_LAYOUT.map((rowRoomTypes, rowIdx) => {
            const rowGroups = rowRoomTypes
              .map((rt) => groups.find((g) => g.roomType === rt))
              .filter((g): g is NonNullable<typeof g> => g !== undefined)
            if (rowGroups.length === 0) return null
            return (
              <div key={rowIdx} className="doctor-shelf__rank">
                {rowGroups.map((group) => (
                  <div key={group.roomType} className="doctor-shelf__group">
                    <div className="doctor-shelf__group-header">
                      <span className="doctor-shelf__group-label">{ROOM_LABEL[group.roomType]}</span>
                      <span className="doctor-shelf__group-count">
                        {group.filledCount} / {group.totalCount}
                      </span>
                    </div>
                    <div className="doctor-shelf__row">
                      {group.cells.map((cell) =>
                        cell.kind === 'doctor' ? (
                          <div
                            key={cell.key}
                            className={`doctor-shelf__cell doctor-shelf__cell--filled doctor-shelf__cell--${cell.rarity.toLowerCase()}`}
                            title={`${cell.name}・${cell.subjectId}・${cell.rarity}`}
                          >
                            <div className="doctor-shelf__sprite-frame">
                              <img
                                className="doctor-shelf__sprite"
                                src={cell.spriteUrl}
                                alt={`${cell.name} (${cell.subjectId})`}
                              />
                            </div>
                            <span className="doctor-shelf__name">{cell.name}</span>
                            <span className="doctor-shelf__subject">{cell.subjectId}</span>
                          </div>
                        ) : (
                          <div
                            key={cell.key}
                            className="doctor-shelf__cell doctor-shelf__cell--empty"
                            title={`空缺：${ROOM_LABEL[group.roomType]}`}
                          >
                            <div className="doctor-shelf__sprite-frame doctor-shelf__sprite-frame--empty">
                              <span className="doctor-shelf__placeholder">?</span>
                            </div>
                            <span className="doctor-shelf__name doctor-shelf__name--empty">空缺</span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </section>

      <UpgradeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        tier={tier}
        reputation={reputation}
      />
    </>
  )
}
