/**
 * Study Session page — the player-initiated "reading mode" surface added by
 * `redesign-hospital-economy`. While a session is active, the global tick loop
 * accumulates revenue / reputation / totalStudyMinutes. Outside a session,
 * the hospital is idle (no auto-tick).
 *
 * Visibility-hidden auto-pause + visibility-return auto-resume are handled by
 * the content-pack `StudySessionController` (subscribed via `useStudySessionTick`).
 *
 * MVP slice today: text-based scene (no sprites yet). Doctor-scene overlay
 * sprites and per-room-type backgrounds deferred to follow-up change after
 * codex sprite generation.
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  computeSalaryDrain,
  computeThroughput,
  ROOM_TYPE_LABELS,
} from '@study-rpg/content-medexam2-tw'
import { ROOM_SCENES } from '@study-rpg/theme-pixel-hospital'
import { getHospitalDB } from '../db/schema'
import { getStudySessionController, useStudySessionTick } from '../lib/tick'
import { SurfaceHint } from '../components/SurfaceHint'

export function StudySessionPage() {
  const db = getHospitalDB()
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const mono = useLiveQuery(() => db.monotonicCounters.get('singleton'), [])
  const rooms = useLiveQuery(() => db.rooms.toArray(), []) ?? []
  const doctors = useLiveQuery(() => db.doctors.toArray(), []) ?? []

  const controller = getStudySessionController()
  const state = useStudySessionTick()

  const doctorMap = useMemo(() => new Map(doctors.map((d) => [d.id, d])), [doctors])

  const totalThroughput = useMemo(() => {
    let t = 0
    for (const room of rooms) {
      const doctor = room.assignedDoctorId ? doctorMap.get(room.assignedDoctorId) ?? null : null
      t += computeThroughput(room, doctor)
    }
    return t
  }, [rooms, doctorMap])

  const salaryDrain = useMemo(() => {
    if (!counters) return 0
    return computeSalaryDrain(doctors, counters.tier)
  }, [doctors, counters])

  const netPerMin = totalThroughput - salaryDrain

  const assignedRooms = useMemo(
    () => rooms.filter((r) => r.assignedDoctorId !== null),
    [rooms],
  )

  // §10 follow-up: pick a room-scene backdrop based on the most-represented
  // assigned room type. Falls back to outpatient (the default first-tier room)
  // when nothing is assigned. ROOM_SCENES is undefined until codex sprites
  // ship — hero panel hides gracefully in that case.
  const heroScene = useMemo(() => {
    if (!ROOM_SCENES) return null
    if (assignedRooms.length === 0) return ROOM_SCENES.outpatient
    const counts: Record<string, number> = { outpatient: 0, surgery: 0, ward: 0 }
    for (const r of assignedRooms) counts[r.type] = (counts[r.type] ?? 0) + 1
    let topType: 'outpatient' | 'surgery' | 'ward' = 'outpatient'
    let topCount = -1
    for (const t of ['outpatient', 'surgery', 'ward'] as const) {
      if (counts[t] > topCount) {
        topType = t
        topCount = counts[t]
      }
    }
    return ROOM_SCENES[topType]
  }, [assignedRooms])

  function fmt(n: number, digits = 0): string {
    return n.toLocaleString('zh-TW', { maximumFractionDigits: digits })
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>唸書 Session</h1>
        <div className="app-header__meta">
          <Link to="/" className="nav-link">
            ← 回首頁
          </Link>
        </div>
      </header>

      <SurfaceHint surfaceId="study" />

      {heroScene && (
        <section className="study-session__hero" aria-label="當前主要看診類型場景">
          <img
            src={heroScene}
            alt="目前主要看診類型場景"
            className="study-session__hero-img"
          />
        </section>
      )}

      <section className="study-session__banner" aria-label="Session 狀態">
        <div className={`study-session__state study-session__state--${state}`}>
          {state === 'idle' && '🌙 醫院休息中（沒有念書，零產出）'}
          {state === 'active' && '📖 念書中 — 醫師看診、聲望累積中'}
          {state === 'paused' && '⏸️ 已暫停（離開分頁，回來會自動繼續）'}
        </div>

        <div className="study-session__controls">
          {state === 'idle' && (
            <button className="primary-btn" onClick={() => controller.start()}>
              開始唸書
            </button>
          )}
          {state === 'active' && (
            <>
              <button className="ghost-btn" onClick={() => controller.pause('manual')}>
                暫停
              </button>
              <button className="ghost-btn" onClick={() => controller.stop()}>
                結束 Session
              </button>
            </>
          )}
          {state === 'paused' && (
            <>
              <button className="primary-btn" onClick={() => controller.resume('manual')}>
                繼續唸書
              </button>
              <button className="ghost-btn" onClick={() => controller.stop()}>
                結束 Session
              </button>
            </>
          )}
        </div>

        {state === 'paused' && (
          <p className="study-session__hint">
            離開分頁造成的暫停會在回到分頁時自動繼續；若是你手動按下暫停，請點「繼續唸書」回到 active。
          </p>
        )}
      </section>

      <section className="study-session__counters" aria-label="當前產出">
        <div className="home-counters-banner__cell">
          <span className="home-counters-banner__label">累積唸書</span>
          <span className="home-counters-banner__value">
            {fmt(mono?.totalStudyMinutes ?? 0, 1)} min
          </span>
        </div>
        <div className="home-counters-banner__cell">
          <span className="home-counters-banner__label">營收（毛/分鐘）</span>
          <span className="home-counters-banner__value">{fmt(totalThroughput)}</span>
        </div>
        <div className="home-counters-banner__cell">
          <span className="home-counters-banner__label">薪水（扣/分鐘）</span>
          <span className="home-counters-banner__value">{fmt(salaryDrain)}</span>
        </div>
        <div className="home-counters-banner__cell">
          <span className="home-counters-banner__label">淨收（/分鐘）</span>
          <span
            className="home-counters-banner__value"
            style={{ color: netPerMin >= 0 ? 'inherit' : 'crimson' }}
          >
            {fmt(netPerMin)}
          </span>
        </div>
      </section>

      <section className="study-session__rooms" aria-label="看診中診間">
        <h2 className="section-heading">看診中診間（{assignedRooms.length} / {rooms.length}）</h2>
        {assignedRooms.length === 0 ? (
          <p className="study-session__empty">
            尚未指派任何醫師。<Link to="/hospital">前往醫院</Link>指派醫師後再來唸書。
          </p>
        ) : (
          <ul className="study-session__room-list">
            {assignedRooms.map((room) => {
              const d = room.assignedDoctorId ? doctorMap.get(room.assignedDoctorId) : null
              const throughput = computeThroughput(room, d ?? null)
              return (
                <li key={room.id} className="study-session__room-item">
                  <span className="room-type-label">{ROOM_TYPE_LABELS[room.type]} #{room.slot}</span>
                  <span className="doctor-name">{d?.name ?? '（未指派）'}</span>
                  <span className="throughput">{fmt(throughput, 1)} / 分</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
