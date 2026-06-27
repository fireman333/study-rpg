import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
import BookmarksPage from './routes/BookmarksPage'
import CollectionPage from './routes/CollectionPage'
import { QuestionBankPage } from './routes/QuestionBankPage'
import ShoutoutBoardPage from './routes/ShoutoutBoardPage'
import DmnQuickReviewToast from './components/DmnQuickReviewToast'
import { CustomTooltipHost } from './components/CustomTooltipHost'
import HelpMenu from './components/HelpMenu'
import { PdfPanelProvider } from './components/PdfPanelProvider'
import { PdfPanelHost } from './components/PdfPanelHost'
import { DesktopPdfOnboardingBanner } from './components/DesktopPdfOnboardingBanner'
import { AuthProvider } from './lib/auth/AuthContext'
import { AuthGate } from './components/AuthGate'
import { SyncProvider } from './lib/sync/SyncProvider'

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
      <SyncProvider>
      <PdfPanelProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <ConnectomeToastHost pack={pack} />
        <VariantUnlockModal />
        <AchievementToastHost />
        <AchievementUnlockModal />
        <DmnQuickReviewToast />
        <CustomTooltipHost />
        <HelpMenu />
        <PdfPanelHost />
        <div style={viewportStyle}>
        <main style={pageStyle}>
          <DesktopPdfOnboardingBanner />
          <header style={topBarStyle}>
            <h1 style={appTitleStyle}>神經元 RPG · LTP</h1>
            <nav className="neurons-nav">
              <NavLink to="/" style={navLinkStyle} end>
                {({ isActive }) => (
                  <span style={isActive ? activeNavBoxStyle : navBoxStyle}>腦圖</span>
                )}
              </NavLink>
              <GroupNavLink to="/collection" label="圖鑑" group={COLLECTION_GROUP_PATHS} />
              <NavLink to="/bookmarks" style={navLinkStyle}>
                {({ isActive }) => (
                  <span style={isActive ? activeNavBoxStyle : navBoxStyle}>收藏</span>
                )}
              </NavLink>
              <NavLink to="/bank" style={navLinkStyle}>
                {({ isActive }) => (
                  <span style={isActive ? activeNavBoxStyle : navBoxStyle}>題庫</span>
                )}
              </NavLink>
              <GroupNavLink to="/leaderboard" label="社群" group={COMMUNITY_GROUP_PATHS} />
            </nav>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
              <AuthGate />
            </span>
          </header>
          <AnimatedRoutes pack={pack} />
        </main>
        </div>
      </BrowserRouter>
      </PdfPanelProvider>
      </SyncProvider>
    </AuthProvider>
  )
}

/**
 * Route transitions (neurons-juice-animations): a short「神經訊號 wipe」— opacity +
 * slight horizontal slide, keyed by pathname so AnimatePresence cross-fades route
 * changes. Reduced-motion → opacity-only. Lives inside BrowserRouter so it can call
 * useLocation; does NOT change route resolution (F5 / direct-URL still resolve via
 * BrowserRouter — SPA three-piece unaffected).
 */
function AnimatedRoutes({ pack }: { pack: ContentPack }): JSX.Element {
  const location = useLocation()
  const reduced = useReducedMotion()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={reduced ? { opacity: 0 } : { opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, x: -12 }}
        transition={{ duration: reduced ? 0.12 : 0.2, ease: 'easeOut' }}
      >
        <Routes location={location}>
          <Route path="/" element={<OverviewPage pack={pack} />} />
          {/* /connectome is fused into the homepage — redirect old bookmarks. */}
          <Route path="/connectome" element={<Navigate to="/" replace />} />
          {/* 圖鑑 group — URLs unchanged, pages share the sub-tab bar via a pathless layout route. */}
          <Route element={<SubTabLayout group="collection" />}>
            <Route path="/collection" element={<CollectionPage pack={pack} />} />
            <Route path="/dmn" element={<DmnCollectionPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
          </Route>
          {/* 社群 group */}
          <Route element={<SubTabLayout group="community" />}>
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/shoutout" element={<ShoutoutBoardPage pack={pack} />} />
          </Route>
          {/* /maze-beta is fused into the homepage — redirect old bookmarks. */}
          <Route path="/maze-beta" element={<Navigate to="/" replace />} />
          <Route path="/bookmarks" element={<BookmarksPage pack={pack} />} />
          <Route path="/bank" element={<QuestionBankPage pack={pack} />} />
          {/* Relocated into /collection (finalize-mock-variant-catalog); keep a redirect for any old link. */}
          <Route path="/mock-collection" element={<Navigate to="/collection" replace />} />
          <Route path="/motion-demo" element={<MotionDemoPage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Tab consolidation (consolidate-neurons-nav-tabs): the top nav groups the
 * collection-flavored pages (圖鑑/DMN/成就) and the community pages (排名/留言)
 * under one tab each. Routes are unchanged — only navigation is regrouped.
 */
const COLLECTION_GROUP_PATHS = ['/collection', '/dmn', '/achievements']
const COMMUNITY_GROUP_PATHS = ['/leaderboard', '/shoutout']

const SUBTAB_GROUPS = {
  collection: [
    { to: '/collection', label: '神經元圖鑑' },
    { to: '/dmn', label: 'DMN' },
    { to: '/achievements', label: '成就' },
  ],
  community: [
    { to: '/leaderboard', label: '排名' },
    { to: '/shoutout', label: '留言' },
  ],
} as const

/** Top-nav tab whose active state covers a whole sub-tab group of sibling routes. */
function GroupNavLink({ to, label, group }: { to: string; label: string; group: string[] }): JSX.Element {
  const { pathname } = useLocation()
  const active = group.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  return (
    <NavLink to={to} style={navLinkStyle}>
      <span style={active ? activeNavBoxStyle : navBoxStyle}>{label}</span>
    </NavLink>
  )
}

/** Pathless layout route: sub-tab pill bar above the matched child page. */
function SubTabLayout({ group }: { group: keyof typeof SUBTAB_GROUPS }): JSX.Element {
  return (
    <>
      <nav style={subTabBarStyle} aria-label={group === 'collection' ? '圖鑑分頁' : '社群分頁'}>
        {SUBTAB_GROUPS[group].map((t) => (
          <NavLink key={t.to} to={t.to} style={navLinkStyle} end>
            {({ isActive }) => (
              <span style={isActive ? activeSubTabStyle : subTabStyle}>{t.label}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}

const pageStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: '1.5rem auto',
  padding: '0 1.25rem',
  fontFamily: 'var(--font-pixel-cjk)',
}
// Reflows the whole app into the width left of the docked PDF panel (var defaults to 0px →
// full width when the panel is closed). rework-neurons-pdf-viewer-docked-panel.
const viewportStyle: React.CSSProperties = {
  width: 'calc(100vw - var(--pdf-panel-width, 0px))',
  transition: 'width 0.15s ease',
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

/* Underline-tablist sub-tab styling, ported from 二階's `.achievements-tab`
 * pattern (full-width bottom rule + gold underline on the active tab),
 * re-palette'd for the neurons warm chrome. */
const subTabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.25rem',
  borderBottom: '2px solid #d4c4a0',
  marginBottom: '1rem',
}

const subTabStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.5rem 1.1rem',
  borderBottom: '3px solid transparent',
  marginBottom: -2,
  color: '#8c6d4a',
  fontSize: '1rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
  transition: 'color 0.12s ease, border-color 0.12s ease',
}

const activeSubTabStyle: React.CSSProperties = {
  ...subTabStyle,
  color: '#5a3f29',
  borderBottomColor: '#d4a04d',
}
