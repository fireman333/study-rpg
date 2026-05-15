import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeThroughput, type Room } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'
import { RoomCard } from '../components/RoomCard'
import { AssignDoctorModal } from '../components/AssignDoctorModal'

export function Hospital() {
  const db = getHospitalDB()
  const rooms = useLiveQuery(() => db.rooms.orderBy('slot').toArray(), []) ?? []
  const doctors = useLiveQuery(() => db.doctors.toArray(), []) ?? []
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)

  const doctorById = useMemo(() => {
    const m = new Map<string, (typeof doctors)[number]>()
    for (const d of doctors) m.set(d.id, d)
    return m
  }, [doctors])

  const totalThroughput = useMemo(() => {
    let sum = 0
    for (const room of rooms) {
      const doctor = room.assignedDoctorId ? doctorById.get(room.assignedDoctorId) ?? null : null
      sum += computeThroughput(room, doctor)
    }
    return sum
  }, [rooms, doctorById])

  const activeDoctor = activeRoom?.assignedDoctorId
    ? doctorById.get(activeRoom.assignedDoctorId) ?? null
    : null

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>醫院</h1>
        <div className="app-header__meta">
          <span className="hospital-throughput">
            總產能 {totalThroughput.toFixed(1)} 患者/分
          </span>
          <Link to="/" className="nav-link">
            ← 回主畫面
          </Link>
        </div>
      </header>

      <p className="hospital-hint">
        指派招募來的醫師到診間。每 5 秒結算一次：產能 = 基礎 × 醫師 ×力 × 設施。
      </p>

      <section className="hospital-grid">
        {rooms.map((room) => {
          const doctor = room.assignedDoctorId ? doctorById.get(room.assignedDoctorId) ?? null : null
          return (
            <RoomCard key={room.id} room={room} doctor={doctor} onClick={() => setActiveRoom(room)} />
          )
        })}
      </section>

      {activeRoom && (
        <AssignDoctorModal
          room={activeRoom}
          currentDoctor={activeDoctor}
          onClose={() => setActiveRoom(null)}
        />
      )}
    </main>
  )
}
