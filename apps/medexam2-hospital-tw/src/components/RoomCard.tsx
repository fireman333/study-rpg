import { ROOM_TYPE_LABELS, computeThroughput, type Room } from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { lookupSprite } from '../lib/sprite-lookup'
import type { DoctorRow } from '../db/schema'

interface RoomCardProps {
  room: Room
  doctor: DoctorRow | null
  onClick: () => void
}

export function RoomCard({ room, doctor, onClick }: RoomCardProps) {
  const throughput = computeThroughput(room, doctor)
  const spriteUrl = doctor
    ? lookupSprite(doctor.spriteKey, THEME_PIXEL_HOSPITAL.sprites, doctor.rarity)
    : undefined

  return (
    <button
      type="button"
      onClick={onClick}
      className={`room-card ${doctor ? 'room-card--assigned' : 'room-card--empty'}`}
      style={
        doctor
          ? ({ ['--rarity-color' as string]: `var(--rarity-${doctor.rarity.toLowerCase()})` } as React.CSSProperties)
          : undefined
      }
      aria-label={doctor ? `${ROOM_TYPE_LABELS[room.type]} #${room.slot}，已指派 ${doctor.name}` : `${ROOM_TYPE_LABELS[room.type]} #${room.slot}，空著`}
    >
      <header className="room-card__head">
        <span className="room-card__type">{ROOM_TYPE_LABELS[room.type]}</span>
        <span className="room-card__slot">#{room.slot}</span>
      </header>

      <div className="room-card__sprite">
        {doctor && spriteUrl ? (
          <img src={spriteUrl} alt="" className="room-card__sprite-img" />
        ) : doctor ? (
          <span aria-hidden>🩺</span>
        ) : (
          <span className="room-card__empty-icon" aria-hidden>＋</span>
        )}
      </div>

      <div className="room-card__name">
        {doctor ? doctor.name : '指派醫師'}
      </div>

      <div className="room-card__throughput">
        {throughput.toFixed(1)} 患者/分
      </div>
    </button>
  )
}
