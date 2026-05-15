import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ensureSeed, refreshDailyTickets } from './db/schema'
import { HomePage } from './pages/HomePage'
import { DoctorRoster } from './pages/DoctorRoster'

function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await ensureSeed()
      await refreshDailyTickets()
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/roster" element={<DoctorRoster />} />
      </Routes>
    </HashRouter>
  )
}

export default App
