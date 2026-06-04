import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import type { ContentPack } from '@study-rpg/core'
import { getContentPack } from '@study-rpg/content-neurons-tw'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import OverviewPage from './routes/OverviewPage'
import MotionDemoPage from './routes/MotionDemoPage' // dev self-verify only — not linked from prod navbar
import LeaderboardPage from './routes/LeaderboardPage'
import ConnectomeToastHost from './components/SynapseFormationToast'
import VariantUnlockModal from './components/VariantUnlockModal'
import { backfillAchievementsFromCurrentStats } from './lib/services/achievement'
import { initializeDmnTrigger } from './lib/services/dmn-trigger'
import { installConsoleErrorCapture } from './lib/services/console-error-buffer'
import AchievementsPage from './routes/AchievementsPage'
import AchievementToastHost from './components/AchievementToastHost'
import AchievementUnlockModal from './components/AchievementUnlockModal'
import DmnCollectionPage from './routes/DmnCollectionPage'
import DmnDrawButton from './components/DmnDrawButton'
import BookmarksPage from './routes/BookmarksPage'
import CollectionPage from './routes/CollectionPage'
import DmnQuickReviewToast from './components/DmnQuickReviewToast'
import HelpMenu from './components/HelpMenu'
import { AuthProvider } from './lib/auth/AuthContext'
import { AuthGate } from './components/AuthGate'
import { SyncMount } from './lib/sync/SyncMount'

interface AppState {
  loading: boolean
  pack?: ContentPack
  error?: string
}

export default function App(): JSX.Element {
  const [state, setState] = useState<AppState>({ loading: true })

  useEffect(() => {
    // Capture runtime errors early so bug reports can attach the recent ring.
    installConsoleErrorCapture()
    const root = document.documentElement
    for (const [k, v] of Object.entries(THEME_PIXEL_NEURONS.cssVars)) {
      root.style.setProperty(k, v)
    }
    getContentPack(`${import.meta.env.BASE_URL}content/neurons-tw`)
      .then(async (pack) => {
        // Register DMN trigger detector — subscribes to connectome events for
        // behavior-axis bonus draws. Idempotent on StrictMode double-mount.
        // Time-axis (reading-timer) inactive until polish-neurons-pre-ship.
        // (Collection 2.0: no variant-gacha subscriber — variants come from the
        // player-initiated pull on /collection.)
        initializeDmnTrigger()
        // Silent achievement backfill — write rows for predicates already
        // satisfied by current Dexie state (no toast / modal / reward).
        // Idempotent on subsequent boots.
        await backfillAchievementsFromCurrentStats()
        setState({ loading: false, pack })
      })
      .catch((e) => setState({ loading: false, error: String(e) }))
  }, [])

  if (state.loading) return <main style={pageStyle}><p>載入 neurons 內容中…</p></main>
  if (state.error)
    return (
      <main style={pageStyle}>
        <p style={{ color: '#c44d4d' }}>錯誤：{state.error}</p>
      </main>
    )
  const pack = state.pack!

  return (
    <AuthProvider>
      <SyncMount />
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <ConnectomeToastHost pack={pack} />
        <VariantUnlockModal />
        <AchievementToastHost />
        <AchievementUnlockModal />
        <DmnQuickReviewToast />
        <HelpMenu />
        <main style={pageStyle}>
          <header style={topBarStyle}>
            <h1 style={appTitleStyle}>神經元 RPG · LTP</h1>
            <nav className="neurons-nav">
              <NavLink to="/" style={navLinkStyle} end>
                {({ isActive }) => (
                  <span style={isActive ? activeNavBoxStyle : navBoxStyle}>腦圖 →</span>
                )}
              </NavLink>
              <NavLink to="/collection" style={navLinkStyle}>
                {({ isActive }) => (
                  <span style={isActive ? activeNavBoxStyle : navBoxStyle}>圖鑑 →</span>
                )}
              </NavLink>
              <NavLink to="/dmn" style={navLinkStyle}>
                {({ isActive }) => (
                  <span style={isActive ? activeNavBoxStyle : navBoxStyle}>DMN →</span>
                )}
              </NavLink>
              <NavLink to="/bookmarks" style={navLinkStyle}>
                {({ isActive }) => (
                  <span style={isActive ? activeNavBoxStyle : navBoxStyle}>收藏 →</span>
                )}
              </NavLink>
              <NavLink to="/achievements" style={navLinkStyle}>
                {({ isActive }) => (
                  <span style={isActive ? activeNavBoxStyle : navBoxStyle}>成就 →</span>
                )}
              </NavLink>
              <NavLink to="/leaderboard" style={navLinkStyle}>
                {({ isActive }) => (
                  <span style={isActive ? activeNavBoxStyle : navBoxStyle}>排名 →</span>
                )}
              </NavLink>
            </nav>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <DmnDrawButton />
              <AuthGate />
            </span>
          </header>
          <Routes>
            <Route path="/" element={<OverviewPage pack={pack} />} />
            {/* /connectome is fused into the homepage — redirect old bookmarks. */}
            <Route path="/connectome" element={<Navigate to="/" replace />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/dmn" element={<DmnCollectionPage />} />
            <Route path="/collection" element={<CollectionPage pack={pack} />} />
            {/* /maze-beta is fused into the homepage — redirect old bookmarks. */}
            <Route path="/maze-beta" element={<Navigate to="/" replace />} />
            <Route path="/bookmarks" element={<BookmarksPage pack={pack} />} />
            <Route path="/motion-demo" element={<MotionDemoPage />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthProvider>
  )
}

const pageStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: '1.5rem auto',
  padding: '0 1.25rem',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
}

const topBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  marginBottom: '1.25rem',
  flexWrap: 'wrap',
}

const appTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#3a2a1a',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}

const navLinkStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: '#5a3f29',
  fontWeight: 600,
}

const navBoxStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.35rem 0.7rem',
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
  background: '#fdf6e3',
  color: '#5a3f29',
  fontSize: '0.88rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  transition: 'background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease',
}

const activeNavBoxStyle: React.CSSProperties = {
  ...navBoxStyle,
  background: '#d4a04d',
  color: '#fff',
  border: '2px solid #b8893a',
  boxShadow: '0 2px 6px rgba(180, 137, 58, 0.4)',
}
