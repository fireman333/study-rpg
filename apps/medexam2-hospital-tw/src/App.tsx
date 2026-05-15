import { useCallback, useEffect, useRef, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ensureSeed, refreshDailyTickets } from './db/schema'
import { HomePage } from './pages/HomePage'
import { DoctorRoster } from './pages/DoctorRoster'
import { Hospital } from './pages/Hospital'
import { useTickLoop } from './lib/tick'
import { checkAssignmentInvariants } from './lib/assignment'

function App() {
  const [ready, setReady] = useState(false)
  const [cappedNotice, setCappedNotice] = useState(false)
  const lastNoticeAtRef = useRef<number>(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await ensureSeed()
      await refreshDailyTickets()
      await checkAssignmentInvariants()
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

  useTickLoop(ready ? handleCapped : undefined)

  if (!ready) {
    return (
      <main className="app-shell">
        <p className="boot-status">啟動中…</p>
      </main>
    )
  }

  return (
    <HashRouter>
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
