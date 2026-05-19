import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Subject, SubjectId } from '@study-rpg/core'
import {
  RECRUITMENT_THRESHOLDS,
  TICKET_CAP,
  READING_IDLE_RATE_REDUCTION,
  READING_SESSION_BUFF_MULTIPLIER,
  TIER_DIVERSIFICATION_REQUIREMENTS,
  TIER_UPGRADE_THRESHOLDS,
  computeSalaryDrain,
  computeThroughput,
  countDistinctSubjectsAtRarity,
  getNextTier,
  rarityIsAtLeast,
} from '@study-rpg/content-medexam2-tw'
import { getContentPack } from '@study-rpg/content-medexam2-tw'
import {
  getHospitalDB,
  incrementAffinity,
  type DoctorRow,
} from '../db/schema'
import { attemptRoll, type RollOutcome } from '../services/recruitment'
import { allocateDailyCap, getDueQueueAllSubjects } from '../lib/srs-scheduler'
import { useCompletionMap } from '../lib/completion'
import { getNextDailyRefreshLabel } from '../lib/daily-ticket'
import { RecruitmentBanner } from '../components/RecruitmentBanner'
import { RecruitmentResultModal } from '../components/RecruitmentResultModal'
import { DevAffinityControls } from '../components/DevAffinityControls'
import { HospitalScene } from '../components/HospitalScene'
import { buildDoctorByRoom, getAssignedDoctor } from '../lib/room-doctor-map'
import { QuizModal } from '../components/QuizModal'
import { StarterPullCard } from '../components/StarterPullCard'
import { StarterPullModal } from '../components/StarterPullModal'
import { TargetedTicketSection } from '../components/TargetedTicketSection'

type Toast = { id: number; text: string; kind: 'unlock' | 'error' }

export function HomePage() {
  const db = getHospitalDB()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [modal, setModal] = useState<{ outcome: Extract<RollOutcome, { ok: true }> } | null>(null)
  const [starterResult, setStarterResult] = useState<{ doctor: DoctorRow } | null>(null)
  const [starterOpen, setStarterOpen] = useState(false)
  const [activeQuizSubject, setActiveQuizSubject] = useState<SubjectId | null>(null)
  const completionMap = useCompletionMap()

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    getContentPack(`${base}/content/medexam2-tw`).then((pack) => setSubjects(pack.subjects))
  }, [])

  const affinityRows = useLiveQuery(() => db.affinity.toArray(), []) ?? []
  const ticketsRow = useLiveQuery(() => db.tickets.get('global'), [])
  const ticketsAvailable = ticketsRow?.available ?? 0
  const refreshLabel = getNextDailyRefreshLabel(new Date(), ticketsAvailable, TICKET_CAP)
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const mono = useLiveQuery(() => db.monotonicCounters.get('singleton'), [])
  const rooms = useLiveQuery(() => db.rooms.toArray(), []) ?? []
  const allDoctors = useLiveQuery(() => db.doctors.toArray(), []) ?? []
  const anyAssigned = allDoctors.some((d) => d.assignedRoom !== null)
  const masteryRows = useLiveQuery(() => db.mastery.toArray(), []) ?? []
  const dueCountMap = useLiveQuery(async () => {
    // useLiveQuery re-runs whenever questionHistory changes (Dexie observes
    // the tables touched inside the query function). One pass per quiz answer
    // is acceptable — full table read is <10ms even at 6066Q corpus dogfood
    // scale because questionHistory only contains rows the user has answered.
    const grouped = await getDueQueueAllSubjects()
    const allocated = allocateDailyCap(grouped)
    const m: Record<string, number> = {}
    for (const [subject, rows] of allocated.entries()) {
      m[subject] = rows.length
    }
    return m
  }, []) ?? {}

  const affinityMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of affinityRows) m[r.subjectId] = r.correctCount
    return m
  }, [affinityRows])

  const masteryMap = useMemo(() => {
    const m: Record<string, { subjectId: string; correct: number; total: number }> = {}
    for (const r of masteryRows) m[r.subjectId] = r
    return m
  }, [masteryRows])

  const showStarterCard = counters?.hasUsedStarterPull === false

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
          <Link to="/study" className="nav-link nav-link--primary">
            唸書 →
          </Link>
          <Link to="/hospital" className="nav-link">
            醫院 →
          </Link>
          <Link to="/training" className="nav-link">
            進修 →
          </Link>
          <Link to="/fate-cards" className="nav-link">
            命運 →
          </Link>
          <Link to="/roster" className="nav-link">
            醫師 →
          </Link>
          <Link to="/bookmarks" className="nav-link">
            收藏 →
          </Link>
        </div>
      </header>

      <div className="ticket-counter-row">
        <span
          className="ticket-counter"
          title="每日台灣早上 08:00 自動發放 +1 張免費招募券，持有上限 99 張"
        >
          🎟️ {ticketsAvailable} / {TICKET_CAP}
          <span className="ticket-counter__refill"> · {refreshLabel}</span>
        </span>
      </div>

      <HospitalScene />

      {counters && (() => {
        const tier = counters.tier
        const reputation = counters.reputation
        const threshold = TIER_UPGRADE_THRESHOLDS[tier]
        const next = getNextTier(tier)
        const req =
          tier === '國家級教學醫院' ? undefined : TIER_DIVERSIFICATION_REQUIREMENTS[tier]
        const distinctAtMin = req ? countDistinctSubjectsAtRarity(allDoctors, req.minRarity) : 0
        const hasP1 = allDoctors.some((d) => rarityIsAtLeast(d.rarity, 'P1'))
        return (
          <>
            <p className="home-tier-line">
              醫院：<strong>{tier}</strong>
              {threshold !== null && next ? (
                <>
                  {'　'}
                  (聲望 {reputation.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
                  {' / '}
                  {threshold.toLocaleString('zh-TW')}
                  {' → '}
                  {next})
                </>
              ) : (
                <> ⭐ 已達頂峰</>
              )}
            </p>
            {req && (
              <p className="home-tier-line home-tier-line--diversity">
                升級門檻：科別多樣性 <strong>{distinctAtMin} / {req.requiredCount}</strong>
                {`（${req.minRarity}+）`}
                {req.requireP1 && (
                  <>
                    {' + '}
                    <strong>{hasP1 ? '✓' : '✗'}</strong>
                    {' 至少 1 位 P1'}
                  </>
                )}
              </p>
            )}
          </>
        )
      })()}

      {(() => {
        const doctorByRoom = buildDoctorByRoom(allDoctors)
        let throughput = 0
        for (const room of rooms) {
          const d = getAssignedDoctor(room.id, doctorByRoom)
          throughput += computeThroughput(room, d)
        }
        const salary = counters ? computeSalaryDrain(allDoctors, counters.tier) : 0
        // Inactive branch shows a counterfactual baseline (tick paused, no actual
        // accrual) so the chip surfaces the 5× value of starting a session.
        const sessionActive = (counters?.currentSessionStartedAt ?? null) !== null
        const sessionMultiplier = sessionActive
          ? READING_SESSION_BUFF_MULTIPLIER
          : READING_IDLE_RATE_REDUCTION
        const idleThroughput = throughput * sessionMultiplier
        const net = idleThroughput - salary
        return (
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
            <div className="home-counters-banner__cell">
              <span className="home-counters-banner__label">累積唸書</span>
              <span className="home-counters-banner__value">
                {(mono?.totalStudyMinutes ?? 0).toLocaleString('zh-TW', { maximumFractionDigits: 1 })} min
              </span>
            </div>
            <div className="home-counters-banner__cell">
              <span className="home-counters-banner__label">淨收 / 分鐘</span>
              <span
                className="home-counters-banner__value"
                style={{ color: net >= 0 ? 'inherit' : 'crimson' }}
              >
                {net.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
              </span>
              {salary > 0 && (
                <span className="home-counters-banner__sublabel">
                  毛 {idleThroughput.toFixed(0)} − 薪 {salary.toFixed(0)}
                </span>
              )}
            </div>
            {!anyAssigned && (counters?.revenue ?? 0) === 0 && (
              <p className="home-counters-banner__hint">
                指派招募來的醫師到診間後，前往「唸書」開始累積營收與聲望
              </p>
            )}
            {anyAssigned && counters?.currentSessionStartedAt === null && (
              <p className="home-counters-banner__hint">
                目前沒有唸書 session — 點擊上方「📖 唸書」開始累積進度
              </p>
            )}
          </section>
        )
      })()}

      {showStarterCard && (
        <StarterPullCard onOpen={() => setStarterOpen(true)} />
      )}

      <TargetedTicketSection
        subjects={subjects}
        onConsumed={(doctor) =>
          setModal({ outcome: { ok: true, doctor, wasPity: false } })
        }
        onError={(msg) => pushToast(msg, 'error')}
      />

      <section className="banners">
        {subjects.map((s) => (
          <RecruitmentBanner
            key={s.id}
            subject={s}
            affinity={affinityMap[s.id] ?? 0}
            threshold={RECRUITMENT_THRESHOLDS[s.id] ?? 0}
            ticketsAvailable={ticketsAvailable}
            mastery={masteryMap[s.id]}
            dueCount={dueCountMap[s.id] ?? 0}
            completion={completionMap?.get(s.id as SubjectId)}
            onRoll={() => void handleRoll(s)}
            onStartQuiz={() => setActiveQuizSubject(s.id as SubjectId)}
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

      <RecruitmentResultModal
        doctor={starterResult?.doctor ?? null}
        wasPity={false}
        onClose={() => setStarterResult(null)}
      />

      {starterOpen && (
        <StarterPullModal
          subjects={subjects}
          onClose={() => setStarterOpen(false)}
          onResult={(out) => {
            setStarterOpen(false)
            setStarterResult({ doctor: out.doctor })
          }}
        />
      )}

      {activeQuizSubject !== null && (
        <QuizModal
          initialSubject={activeQuizSubject}
          onClose={() => setActiveQuizSubject(null)}
        />
      )}
    </main>
  )
}
