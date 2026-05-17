import { useCallback, useEffect, useRef, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import {
  TIER_ROOMS,
  type HospitalTier,
  type Room,
} from '@study-rpg/content-medexam2-tw'
import { ensureSeed, getHospitalDB, refreshDailyTickets, type GameCountersRow } from './db/schema'
import { HomePage } from './pages/HomePage'
import { DoctorRoster } from './pages/DoctorRoster'
import { Hospital } from './pages/Hospital'
import { StudySessionPage } from './pages/StudySessionPage'
import { TrainingPage } from './pages/TrainingPage'
import { FateCardPage } from './pages/FateCardPage'
import { useStudySessionTick } from './lib/tick'
import { checkAssignmentInvariants } from './lib/assignment'
import { useSync } from './lib/sync/useSync'
import { AuthButton } from './components/AuthButton'
import { MigrationUploadPrompt } from './components/MigrationUploadPrompt'
import { ConflictChooserModal } from './components/ConflictChooserModal'
import { V6MigrationModal } from './components/V6MigrationModal'
import { TutorialOnboarding } from './components/TutorialOnboarding'
import { MilestoneTipToast } from './components/MilestoneTipToast'
import { HelpMenu } from './components/HelpMenu'
import { EventModal } from './components/EventModal'
import { EventToast } from './components/EventToast'
import { useMilestoneTips } from './lib/useMilestoneTips'
import {
  TUTORIAL_STEPS,
  type EventDefinition,
  type ToastEventOutcome,
} from '@study-rpg/content-medexam2-tw'
import { useAuth } from './lib/auth/AuthContext'
import type { TickEventToastInfo } from './lib/tick'

const TIER_DELTA_LABEL: Record<Room['type'], string> = {
  outpatient: '門診',
  surgery: '手術房',
  ward: '病房',
}

function describeTierJump(prevTier: HospitalTier, newTier: HospitalTier): string {
  const prev = TIER_ROOMS[prevTier]
  const next = TIER_ROOMS[newTier]
  const delta: Record<Room['type'], number> = { outpatient: 0, surgery: 0, ward: 0 }
  const prevIds = new Set(prev.map((r) => r.id))
  for (const r of next) {
    if (!prevIds.has(r.id)) delta[r.type] += 1
  }
  const parts: string[] = []
  for (const type of ['outpatient', 'surgery', 'ward'] as const) {
    if (delta[type] > 0) parts.push(`+${delta[type]} ${TIER_DELTA_LABEL[type]}`)
  }
  return `🎉 升級為 ${newTier}！${parts.join(' ')}`
}

function App() {
  const [ready, setReady] = useState(false)
  const [cappedNotice, setCappedNotice] = useState(false)
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null)
  const [v6Migration, setV6Migration] = useState<GameCountersRow | null>(null)
  const [onboarding, setOnboarding] = useState<GameCountersRow | null>(null)
  const [eventToast, setEventToast] = useState<{
    event: EventDefinition
    outcome: ToastEventOutcome
  } | null>(null)
  const lastNoticeAtRef = useRef<number>(0)
  const prevTierRef = useRef<HospitalTier>('診所')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await ensureSeed()
      await refreshDailyTickets()
      await checkAssignmentInvariants()
      // Initialise prev-tier so the first upgrade banner shows the correct room delta
      const counters = await getHospitalDB().gameCounters.get('singleton')
      if (counters) {
        prevTierRef.current = counters.tier
        // §9.5.8 v6 migration modal — fires once for upgraded saves that have
        // played past 診所 and haven't seen the welcome yet
        if (counters.tier !== '診所' && counters.tutorial?.firedTips?.v6_welcome !== true) {
          if (!cancelled) setV6Migration(counters)
        }
        // §9.5.1 onboarding modal — fires for fresh saves where the final
        // 'done' step is not yet complete. Mutually exclusive with v6 migration
        // (only fresh 診所 saves enter this branch).
        else if (
          counters.tier === '診所' &&
          counters.tutorial?.completedSteps?.[TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].id] !== true
        ) {
          if (!cancelled) setOnboarding(counters)
        }
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleCapped = useCallback(() => {
    const now = Date.now()
    // throttle: at most one notice per 60s
    if (now - lastNoticeAtRef.current < 60_000) return
    lastNoticeAtRef.current = now
    setCappedNotice(true)
    setTimeout(() => setCappedNotice(false), 5000)
  }, [])

  const handleUpgrade = useCallback((newTier: HospitalTier) => {
    const prev = prevTierRef.current
    prevTierRef.current = newTier
    setUpgradeNotice(describeTierJump(prev, newTier))
    setTimeout(() => setUpgradeNotice(null), 8000)
  }, [])

  const handleToastEvent = useCallback((info: TickEventToastInfo) => {
    setEventToast({ event: info.event, outcome: info.outcome })
  }, [])

  // modal-event trigger relies on Dexie liveQuery in <EventModal/>; no React
  // state needed here, but accept the callback to flush console logs in dev.
  const handleModalEvent = useCallback((_event: EventDefinition) => {
    // Modal renders via liveQuery on gameCounters.pendingEventId
  }, [])

  useStudySessionTick(
    ready ? handleCapped : undefined,
    ready ? handleUpgrade : undefined,
    ready ? handleToastEvent : undefined,
    ready ? handleModalEvent : undefined,
  )

  // M4 cloud sync: mounts engine on authed + drives migration / conflict modals.
  const sync = useSync()
  const { user } = useAuth()
  const milestoneTip = useMilestoneTips()

  if (!ready) {
    return (
      <main className="app-shell">
        <p className="boot-status">啟動中…</p>
      </main>
    )
  }

  return (
    <HashRouter>
      <AuthButton />
      {sync.gateState === 'migration-upload' && (
        <MigrationUploadPrompt
          email={user?.email ?? null}
          onChoose={sync.resolveUploadPrompt}
        />
      )}
      {sync.gateState === 'conflict-chooser' && (
        <ConflictChooserModal
          email={user?.email ?? null}
          localMaxUpdatedAt={sync.gateSnapshot?.localMaxUpdatedAt ?? null}
          cloudMaxUpdatedAt={sync.gateSnapshot?.cloudMaxUpdatedAt ?? null}
          hasSettingsEntry={false}
          onChoose={sync.resolveConflictChooser}
        />
      )}
      {sync.gateState === 'paused' && (
        <div className="sync-paused-banner" role="status" aria-live="polite">
          <span className="sync-paused-banner__icon" aria-hidden>⏸</span>
          <span className="sync-paused-banner__text">
            雲端同步已暫停（你選擇待會再決定）。
          </span>
          <button
            type="button"
            className="sync-paused-banner__btn"
            onClick={() => void sync.reopenConflictChooser()}
          >
            重新開啟對話
          </button>
        </div>
      )}
      {v6Migration && (
        <V6MigrationModal counters={v6Migration} onDismiss={() => setV6Migration(null)} />
      )}
      {onboarding && (
        <TutorialOnboarding counters={onboarding} onComplete={() => setOnboarding(null)} />
      )}
      {milestoneTip.pending && (
        <MilestoneTipToast
          tipId={milestoneTip.pending.id}
          message={milestoneTip.pending.message}
          onDismiss={() => void milestoneTip.dismiss()}
        />
      )}
      <EventModal />
      {eventToast && (
        <EventToast
          event={eventToast.event}
          outcome={eventToast.outcome}
          onDismiss={() => setEventToast(null)}
        />
      )}
      <HelpMenu />
      {upgradeNotice && (
        <div className="upgrade-notice" role="status">
          {upgradeNotice}
        </div>
      )}
      {cappedNotice && (
        <div className="offline-cap-notice" role="status">
          離線時間超過 5 分鐘，部分時段未計入
        </div>
      )}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/roster" element={<DoctorRoster />} />
        <Route path="/hospital" element={<Hospital />} />
        <Route path="/study" element={<StudySessionPage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/fate-cards" element={<FateCardPage />} />
      </Routes>
    </HashRouter>
  )
}

export default App
