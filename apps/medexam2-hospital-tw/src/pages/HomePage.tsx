import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Subject } from '@study-rpg/core'
import {
  RECRUITMENT_THRESHOLDS,
  TICKET_CAP,
} from '@study-rpg/content-medexam2-tw'
import { getContentPack } from '@study-rpg/content-medexam2-tw'
import {
  getHospitalDB,
  incrementAffinity,
} from '../db/schema'
import { attemptRoll, type RollOutcome } from '../services/recruitment'
import { RecruitmentBanner } from '../components/RecruitmentBanner'
import { RecruitmentResultModal } from '../components/RecruitmentResultModal'
import { DevAffinityControls } from '../components/DevAffinityControls'

type Toast = { id: number; text: string; kind: 'unlock' | 'error' }

export function HomePage() {
  const db = getHospitalDB()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [modal, setModal] = useState<{ outcome: Extract<RollOutcome, { ok: true }> } | null>(null)

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    getContentPack(`${base}/content/medexam2-tw`).then((pack) => setSubjects(pack.subjects))
  }, [])

  const affinityRows = useLiveQuery(() => db.affinity.toArray(), []) ?? []
  const ticketsRow = useLiveQuery(() => db.tickets.get('global'), [])
  const ticketsAvailable = ticketsRow?.available ?? 0
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const rooms = useLiveQuery(() => db.rooms.toArray(), []) ?? []
  const anyAssigned = rooms.some((r) => r.assignedDoctorId !== null)

  const affinityMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of affinityRows) m[r.subjectId] = r.correctCount
    return m
  }, [affinityRows])

  function pushToast(text: string, kind: Toast['kind'] = 'unlock') {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, text, kind }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }

  async function handleAffinityIncrement(subjectId: string) {
    const after = await incrementAffinity(subjectId)
    const threshold = RECRUITMENT_THRESHOLDS[subjectId]
    if (threshold !== undefined && after === threshold) {
      pushToast(`${subjectId} 招募解鎖！`, 'unlock')
    }
  }

  async function handleRoll(subject: Subject) {
    const outcome = await attemptRoll(subject)
    if (outcome.ok) {
      setModal({ outcome })
    } else if (outcome.reason === 'no-tickets') {
      pushToast('招募券不足，明天再來', 'error')
    } else if (outcome.reason === 'banner-locked') {
      pushToast(`還需答對 ${outcome.missing} 題 ${subject.displayName}`, 'error')
    } else if (outcome.reason === 'unknown-subject') {
      pushToast(`未知科別：${subject.id}`, 'error')
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>二階國考經營 RPG</h1>
        <div className="app-header__meta">
          <span className="ticket-counter">
            🎟️ {ticketsAvailable} / {TICKET_CAP}
          </span>
          <Link to="/hospital" className="nav-link">
            醫院 →
          </Link>
          <Link to="/roster" className="nav-link">
            醫師名冊 →
          </Link>
        </div>
      </header>

      <section className="home-counters-banner" aria-label="醫院經營狀態">
        <div className="home-counters-banner__cell">
          <span className="home-counters-banner__label">營收</span>
          <span className="home-counters-banner__value">
            {(counters?.revenue ?? 0).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="home-counters-banner__cell">
          <span className="home-counters-banner__label">聲望</span>
          <span className="home-counters-banner__value">
            {(counters?.reputation ?? 0).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
          </span>
        </div>
        {!anyAssigned && (counters?.revenue ?? 0) === 0 && (
          <p className="home-counters-banner__hint">
            指派招募來的醫師到診間開始累積營收與聲望
          </p>
        )}
      </section>

      <section className="banners">
        {subjects.map((s) => (
          <RecruitmentBanner
            key={s.id}
            subject={s}
            affinity={affinityMap[s.id] ?? 0}
            threshold={RECRUITMENT_THRESHOLDS[s.id] ?? 0}
            ticketsAvailable={ticketsAvailable}
            onRoll={() => void handleRoll(s)}
          />
        ))}
      </section>

      <DevAffinityControls subjects={subjects} onAffinityIncrement={(id) => void handleAffinityIncrement(id)} />

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>{t.text}</div>
        ))}
      </div>

      <RecruitmentResultModal
        doctor={modal?.outcome.doctor ?? null}
        wasPity={modal?.outcome.wasPity ?? false}
        onClose={() => setModal(null)}
      />
    </main>
  )
}
