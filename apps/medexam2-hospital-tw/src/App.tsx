import { useCallback, useEffect, useRef, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  TIER_ROOMS,
  type HospitalTier,
  type Room,
} from '@study-rpg/content-medexam2-tw'
import { ensureSeed, getHospitalDB, refreshDailyTickets, refreshDailyEquipmentTickets, type GameCountersRow } from './db/schema'
import { getFontMode, DEFAULT_FONT_MODE } from './services/font-mode'
import { seedLeaderboardProfileFromServer } from './services/leaderboard-profile'
import { HomePage } from './pages/HomePage'
import { DoctorRoster } from './pages/DoctorRoster'
import { Hospital } from './pages/Hospital'
import { StudySessionPage } from './pages/StudySessionPage'
import { FateCardPage } from './pages/FateCardPage'
import { BookmarksPage } from './pages/BookmarksPage'
import { EquipmentPage } from './pages/EquipmentPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { CustomTooltipHost } from './components/CustomTooltipHost'
import { AchievementsPage } from './pages/AchievementsPage'
import { useStudySessionTick } from './lib/tick'
import { checkAssignmentInvariants } from './lib/assignment'
import { useSync } from './lib/sync/useSync'
import { AuthButton } from './components/AuthButton'
import { MigrationUploadPrompt } from './components/MigrationUploadPrompt'
import { MigrationBanner } from './components/MigrationBanner'
import { DomainMigrationBanner } from './components/DomainMigrationBanner'
import { getSupabase } from './lib/auth/client'
import { getBackendConfig } from './lib/sync/backend-config'
import { ConflictChooserModal } from './components/ConflictChooserModal'
import { AccountSwitchPrompt } from './components/AccountSwitchPrompt'
import { SyncStatusChip } from './components/SyncStatusChip'
import { SyncErrorToast } from './components/SyncErrorToast'
import { V6MigrationModal } from './components/V6MigrationModal'
import { GraceToastContainer } from './components/GraceToastContainer'
import { TutorialOnboarding } from './components/TutorialOnboarding'
import { MilestoneTipToast } from './components/MilestoneTipToast'
import { AchievementUnlockToast } from './components/AchievementUnlockToast'
import { AchievementUnlockModal } from './components/AchievementUnlockModal'
import { useAchievementToasts } from './lib/useAchievementToasts'
import { HelpMenu } from './components/HelpMenu'
import { EventModal } from './components/EventModal'
import { EventToast } from './components/EventToast'
import { ERConsultDialog } from './components/ERConsultDialog'
import { useMilestoneTips } from './lib/useMilestoneTips'
import {
  TUTORIAL_STEPS,
  type EventDefinition,
  type ToastEventOutcome,
} from '@study-rpg/content-medexam2-tw'
import { useAuth } from './lib/auth/AuthContext'
import {
  hospitalEventToastQueue,
  type HospitalToastEntry,
} from './lib/hospital-event-toast-queue'
import {
  isPlayerContentRoute,
  maybeRollNonReadingEvent,
} from './services/non-reading-event-trigger'
import { useLocation } from 'react-router-dom'

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

/**
 * Hook B for `rewire-hospital-events-to-non-reading-trigger`:
 * fires `maybeRollNonReadingEvent('nav')` when the pathname changes and the
 * new path is a player-content route. Lives inside `<HashRouter>` so
 * `useLocation` resolves correctly. Skips initial mount (no synthetic nav
 * roll on cold open) and skips same-path re-renders.
 */
function NonReadingNavListener(): null {
  const location = useLocation()
  const prevPathRef = useRef<string | null>(null)
  useEffect(() => {
    const current = location.pathname
    const prev = prevPathRef.current
    prevPathRef.current = current
    if (prev === null) return // initial mount — not a nav event
    if (prev === current) return
    if (!isPlayerContentRoute(current)) return
    void maybeRollNonReadingEvent('nav')
  }, [location.pathname])
  return null
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
      await refreshDailyEquipmentTickets()
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

  // Subscribe to the hospital-event toast queue. Service-layer events
  // (non-reading-event-trigger) push toast entries here. Modal events
  // continue to render via Dexie liveQuery inside <EventModal />.
  useEffect(() => {
    return hospitalEventToastQueue.subscribe((entry: HospitalToastEntry | null) => {
      if (entry) setEventToast({ event: entry.event, outcome: entry.outcome })
    })
  }, [])

  useStudySessionTick(
    ready ? handleCapped : undefined,
    ready ? handleUpgrade : undefined,
  )

  // M4 cloud sync: mounts engine on authed + drives migration / conflict modals.
  const sync = useSync()
  const { user } = useAuth()
  const milestoneTip = useMilestoneTips()

  // R2 migration banner — dormant unless VITE_CLOUD_SYNC_BACKEND ∈ {dual, r2}.
  const supabase = getSupabase()
  const backendConfig = getBackendConfig()
  const showMigrationBanner = backendConfig.writeR2 && supabase !== null && user !== null

  // Font mode preference — drives `<body data-font-mode>` so CSS can flip the
  // quiz reading area between readable Noto Sans TC (default) and pixel Cubic 11.
  // Per-device only; not cloud-synced. Toggled in HelpMenu「字型偏好」section.
  const fontMode = useLiveQuery(() => getFontMode(), [], DEFAULT_FONT_MODE)
  useEffect(() => {
    document.body.dataset.fontMode = fontMode
  }, [fontMode])

  // Cross-origin seed-back for `leaderboardProfile` — recovers users who
  // migrated BEFORE the m2 bundle adapter for leaderboardProfile shipped
  // (their R2 m2 blob predates the field). One-shot check on sign-in:
  // if Dexie row missing AND server has it, seed from GET /leaderboard/me.
  // Silently no-ops on 404 (old Worker), empty server row, or network
  // error — opt-in modal handles the genuine "never opted in" case.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    seedLeaderboardProfileFromServer(user.id).catch(() => {
      // swallow — seed is best-effort, opt-in modal is the safe fallback
    })
    return () => { cancelled = true; void cancelled }
  }, [user])

  // navigator.onLine for SyncStatusChip + AccountSwitchPrompt awareness.
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  useEffect(() => {
    function update() { setOnline(navigator.onLine) }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!ready) {
    return (
      <main className="app-shell">
        <p className="boot-status">啟動中…</p>
      </main>
    )
  }

  return (
    <HashRouter>
      <CustomTooltipHost />
      <NonReadingNavListener />
      <DomainMigrationBanner />
      <div className="header-controls">
        <AuthButton />
        {user && (
          <SyncStatusChip
            status={sync.status}
            lastPushAt={sync.lastPushAt}
            lastPullAt={sync.lastPullAt}
            gateState={sync.gateState}
            online={online}
            onForcePush={sync.forcePush}
            onForcePull={sync.forcePull}
          />
        )}
      </div>
      {showMigrationBanner && supabase && user && (
        <MigrationBanner supabase={supabase} userId={user.id} />
      )}
      {sync.accountSwitch && (
        <AccountSwitchPrompt
          currentEmail={sync.accountSwitch.currentEmail}
          previousUserIdPreview={sync.accountSwitch.previousUserId.slice(0, 8) + '…'}
          localMaxUpdatedAt={sync.accountSwitch.localMaxUpdatedAt}
          cloudHasRows={sync.accountSwitch.cloudHasRows}
          online={sync.accountSwitch.online}
          onChoose={sync.resolveAccountSwitch}
        />
      )}
      {!sync.accountSwitch && sync.gateState === 'migration-upload' && (
        <MigrationUploadPrompt
          email={user?.email ?? null}
          onChoose={sync.resolveUploadPrompt}
        />
      )}
      {!sync.accountSwitch && sync.gateState === 'conflict-chooser' && (
        <ConflictChooserModal
          email={user?.email ?? null}
          localMaxUpdatedAt={sync.gateSnapshot?.localMaxUpdatedAt ?? null}
          cloudMaxUpdatedAt={sync.gateSnapshot?.cloudMaxUpdatedAt ?? null}
          hasSettingsEntry={false}
          onChoose={sync.resolveConflictChooser}
        />
      )}
      {!sync.accountSwitch && sync.gateState === 'paused' && (
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
      <SyncErrorToast
        info={sync.syncError}
        onDismiss={sync.dismissSyncError}
        onRetry={sync.retrySyncError}
      />
      <GraceToastContainer />
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
      <AchievementUnlockOverlay />

      <EventModal />
      <ERConsultDialog />
      {eventToast && (
        <EventToast
          event={eventToast.event}
          outcome={eventToast.outcome}
          onDismiss={() => {
            setEventToast(null)
            hospitalEventToastQueue.clear()
          }}
        />
      )}
      <HelpMenu onResetProgress={sync.safeResetAccountData} signedIn={!!user} />
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
        {/* /training kept for backward-compat (old share links) — redirects
            to /roster?tab=training where the training panel is now hosted as
            a sub-tab of 醫師. Spec: hospital-management-mode "Legacy /training
            route SHALL redirect to /roster?tab=training". */}
        <Route path="/training" element={<Navigate to="/roster?tab=training" replace />} />
        <Route path="/fate-cards" element={<FateCardPage />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/bookmarks" element={<BookmarksPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/achievements" element={<AchievementsPage />} />
      </Routes>
    </HashRouter>
  )
}

/**
 * Achievement unlock overlay — subscribes to the global queue and routes
 * each unlocked achievement to the appropriate renderer:
 *   - P1 → full-screen AchievementUnlockModal (dismiss-required)
 *   - P2/P3/P4 → AchievementUnlockToast (8s auto-dismiss)
 *
 * Concurrent unlocks: P1 modal blocks the queue (dismiss-required); toasts
 * stack up to 3 visible at once (overflow stays queued). For MVP we render
 * the first item only; UI polish (stacking) deferred.
 */
function AchievementUnlockOverlay() {
  const { queue, dismiss } = useAchievementToasts()
  if (queue.length === 0) return null
  const next = queue[0]
  if (next.tier === 'P1') {
    return <AchievementUnlockModal achievement={next} onDismiss={() => dismiss(next.id)} />
  }
  return <AchievementUnlockToast achievement={next} onDismiss={() => dismiss(next.id)} />
}

export default App
