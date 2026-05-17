import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ROOM_EXTENSION_COSTS,
  ROOM_EXTENSION_UNLOCKED_TIERS,
  ROOM_TYPE_LABELS,
  computeThroughput,
  type Room,
  type RoomType,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'
import { RoomCard } from '../components/RoomCard'
import { AssignDoctorModal } from '../components/AssignDoctorModal'
import { purchaseRoomExtension, type ExtensionResult } from '../services/room-extension'
import { SurfaceHint } from '../components/SurfaceHint'

const EXTRA_PREFIX = 'extra-'
const ROOM_TYPES_ORDERED: ReadonlyArray<RoomType> = ['outpatient', 'surgery', 'ward']

function countExtras(rooms: ReadonlyArray<Room>, type: RoomType): number {
  return rooms.filter((r) => r.type === type && r.id.startsWith(`${EXTRA_PREFIX}${type}-`)).length
}

export function Hospital() {
  const db = getHospitalDB()
  const rooms = useLiveQuery(() => db.rooms.orderBy('slot').toArray(), []) ?? []
  const doctors = useLiveQuery(() => db.doctors.toArray(), []) ?? []
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [extOutcome, setExtOutcome] = useState<{ type: RoomType; result: ExtensionResult } | null>(null)
  const [extBusy, setExtBusy] = useState(false)

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

  const assignedCount = rooms.filter((r) => r.assignedDoctorId !== null).length

  const activeDoctor = activeRoom?.assignedDoctorId
    ? doctorById.get(activeRoom.assignedDoctorId) ?? null
    : null

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>醫院</h1>
        <div className="app-header__meta">
          <span className="hospital-throughput">
            {counters?.tier ?? '診所'} · 總產能 {totalThroughput.toFixed(1)} 患者/分 · 房間 {assignedCount}/{rooms.length}
          </span>
          <Link to="/" className="nav-link">
            ← 回主畫面
          </Link>
        </div>
      </header>

      <SurfaceHint surfaceId="hospital" />

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

      {(() => {
        const tier = counters?.tier ?? '診所'
        const tierUnlocked = ROOM_EXTENSION_UNLOCKED_TIERS.includes(tier)
        const revenue = counters?.revenue ?? 0
        const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
        async function handlePurchase(type: RoomType) {
          if (extBusy) return
          setExtBusy(true)
          try {
            const result = await purchaseRoomExtension(type)
            setExtOutcome({ type, result })
          } finally {
            setExtBusy(false)
          }
        }
        return (
          <section className="room-extension-panel" aria-label="房間擴建">
            <h2 className="section-heading">
              房間擴建
              {!tierUnlocked && (
                <span className="muted">（{tier} 階段未開放，升級至 區域醫院 解鎖）</span>
              )}
            </h2>
            <div className="room-extension-grid">
              {ROOM_TYPES_ORDERED.map((type) => {
                const config = ROOM_EXTENSION_COSTS[type]
                const current = countExtras(rooms, type)
                const maxedOut = current >= config.maxExtras
                const cantAfford = revenue < config.cost
                const disabled = !tierUnlocked || maxedOut || cantAfford || extBusy
                let title = ''
                if (!tierUnlocked) title = '需升級至 區域醫院 以上'
                else if (maxedOut) title = `已達上限 ${config.maxExtras}`
                else if (cantAfford) title = `營收不足（需要 ${fmt(config.cost)} 💰）`
                return (
                  <div key={type} className="room-extension-card">
                    <div className="room-extension-card__head">
                      <span>{ROOM_TYPE_LABELS[type]}</span>
                      <span className="muted">擴建 {current} / {config.maxExtras}</span>
                    </div>
                    <p className="room-extension-card__cost">成本：{fmt(config.cost)} 💰</p>
                    <button
                      className="primary-btn"
                      onClick={() => void handlePurchase(type)}
                      disabled={disabled}
                      title={title}
                    >
                      {maxedOut ? '已達上限' : '購買新房間'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })()}

      {extOutcome && (
        <div className="modal-backdrop" onClick={() => setExtOutcome(null)}>
          <div
            className={`modal frame training-outcome-modal training-outcome-modal--${
              extOutcome.result.kind === 'success' ? 'success' : 'failure'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {extOutcome.result.kind === 'success' && (
              <>
                <h2 className="modal__title">🏗️ 房間擴建完成</h2>
                <p>
                  新{ROOM_TYPE_LABELS[extOutcome.type]}（{extOutcome.result.roomId}）已加入醫院
                </p>
                <p className="muted">-{extOutcome.result.cost.toLocaleString('zh-TW')} 💰</p>
              </>
            )}
            {extOutcome.result.kind === 'aborted' && (
              <>
                <h2 className="modal__title">擴建失敗</h2>
                {extOutcome.result.reason === 'tier-locked' && (
                  <p>需先升級至 區域醫院 以上才能擴建。</p>
                )}
                {extOutcome.result.reason === 'max-extras' && (
                  <p>
                    {ROOM_TYPE_LABELS[extOutcome.type]} 已達擴建上限（
                    {extOutcome.result.maxExtras} 間）。
                  </p>
                )}
                {extOutcome.result.reason === 'insufficient-revenue' && (
                  <p>營收不足，需要 {extOutcome.result.requiredRevenue.toLocaleString('zh-TW')} 💰。</p>
                )}
              </>
            )}
            <div className="modal__actions">
              <button className="primary-btn" onClick={() => setExtOutcome(null)}>好</button>
            </div>
          </div>
        </div>
      )}

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
