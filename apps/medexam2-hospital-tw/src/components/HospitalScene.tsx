import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { SUBJECT_TO_ROOM, type HospitalTier } from '@study-rpg/content-medexam2-tw'
import type { SlotPosition } from '@study-rpg/core'
import { getHospitalDB } from '../db/schema'
import { UpgradeModal } from './UpgradeModal'

const TIER_TO_KEY: Record<HospitalTier, 'tier1' | 'tier2' | 'tier3'> = {
  診所: 'tier1',
  區域醫院: 'tier2',
  醫學中心: 'tier3',
}

const SCENE_WIDTH = 768
const SCENE_HEIGHT = 384
const DOCTOR_SPRITE_SIZE = 96

export function HospitalScene() {
  const db = getHospitalDB()
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const doctors = useLiveQuery(() => db.doctors.toArray(), []) ?? []
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

    const filled: Array<{ slot: SlotPosition; spriteUrl: string; key: string; alt: string }> = []
    const slotCursor: Record<SlotPosition['room'], number> = { ward: 0, outpatient: 0, surgery: 0 }

    for (const doctor of assignedDoctors) {
      const roomType = SUBJECT_TO_ROOM[doctor.subjectId]
      if (!roomType) continue
      const idx = slotCursor[roomType]
      const slot = slotsByRoom[roomType][idx]
      if (!slot) continue
      const spriteUrl = THEME_PIXEL_HOSPITAL.sprites[doctor.spriteKey]
      if (!spriteUrl) continue
      filled.push({
        slot,
        spriteUrl,
        key: doctor.id,
        alt: `${doctor.name} (${doctor.subjectId})`,
      })
      slotCursor[roomType] += 1
    }

    return { tier, sceneUrl, filled, reputation: counters.reputation }
  }, [counters, doctors, sceneEnabled])

  if (!renderState) return null

  const { tier, sceneUrl, filled, reputation } = renderState

  return (
    <>
      <section
        className="hospital-scene"
        aria-label={`醫院場景：${tier}`}
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
        <div className="hospital-scene__canvas">
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
          {filled.map(({ slot, spriteUrl, key, alt }) => (
            <img
              key={key}
              className="hospital-scene__doctor"
              src={spriteUrl}
              alt={alt}
              style={{
                left: `${(slot.x / SCENE_WIDTH) * 100}%`,
                top: `${(slot.y / SCENE_HEIGHT) * 100}%`,
              }}
              width={DOCTOR_SPRITE_SIZE}
              height={DOCTOR_SPRITE_SIZE}
            />
          ))}
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
