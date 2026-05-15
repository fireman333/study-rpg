import { useCallback, useEffect, useRef, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import {
  TIER_ROOMS,
  createPerQReputationListener,
  type HospitalTier,
  type Room,
} from '@study-rpg/content-medexam2-tw'
import { ensureSeed, getHospitalDB, refreshDailyTickets } from './db/schema'
import { HomePage } from './pages/HomePage'
import { DoctorRoster } from './pages/DoctorRoster'
import { Hospital } from './pages/Hospital'
import { useTickLoop } from './lib/tick'
import { checkAssignmentInvariants } from './lib/assignment'

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
      if (counters) prevTierRef.current = counters.tier
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const db = getHospitalDB()
    const unsubscribe = createPerQReputationListener({
      getRooms: () => db.rooms.toArray(),
      getDoctors: () => db.doctors.toArray(),
      updateCounters: async ({ reputation }) =>
        db.transaction('rw', db.gameCounters, async () => {
          const counters = await db.gameCounters.get('singleton')
          if (!counters) return
          await db.gameCounters.put({
            ...counters,
            reputation: counters.reputation + reputation,
          })
        }),
    })
    return unsubscribe
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

  useTickLoop(
    ready ? handleCapped : undefined,
    ready ? handleUpgrade : undefined,
  )

  if (!ready) {
    return (
      <main className="app-shell">
        <p className="boot-status">啟動中…</p>
      </main>
    )
  }

  return (
    <HashRouter>
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
      </Routes>
    </HashRouter>
  )
}

export default App
