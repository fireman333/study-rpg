/**
 * LeaderboardPage — 6-tab leaderboard view with pixel-art tabular grid.
 *
 * Spec: openspec/specs/neurons-leaderboard/spec.md
 *   "Six filter tabs SHALL provide composite ranking plus five single-dimension rankings"
 *   "Top 100 list plus my-rank chip SHALL render in pixel-art tabular grid"
 *   "LeaderboardPage SHALL source the authenticated session from the app AuthContext"
 *   "Privacy and integrity disclosures SHALL surface on the leaderboard footer"
 *
 * Auth: the page sources the signed-in user from the app AuthContext via
 * useAuth() (same hook as useSync.ts) — userId/accessToken gate the opt-in
 * modal + settings controls. Signed-out visitors get the read-only browse view
 * (fetchLeaderboardSnapshot only, no auth required).
 */

import { useEffect, useRef, useState } from 'react'
import { NumberTickUp, CelebrationHalo } from '../lib/motion'
import LeaderboardOptInModal from '../components/LeaderboardOptInModal'
import LeaderboardSettingsControls from '../components/LeaderboardSettingsControls'
import { BadgeSprite } from '../components/BadgeSprite'
import type {
  NeuronsAchievementCategory,
  NeuronsAchievementTier,
} from '@study-rpg/content-neurons-tw'
import {
  fetchLeaderboardSnapshot,
  getLeaderboardProfile,
  LEADERBOARD_FILTERS,
  type LeaderboardFilter,
  type LeaderboardSnapshot,
  type LeaderboardRow,
} from '../lib/services/neurons-leaderboard'
import type { LeaderboardProfileRow } from '../lib/db'
import { useAuth } from '../lib/auth/AuthContext'

const FILTER_LABELS: Record<LeaderboardFilter, string> = {
  composite: '綜合排名',
  variants: '變體收集',
  ap: 'AP 排名',
  study: '累積唸書時間',
  settles: '探索進度',
}

const FILTER_PRIMARY_STAT: Record<LeaderboardFilter, keyof LeaderboardRow> = {
  composite: 'variant_count',
  variants: 'variant_count',
  ap: 'total_AP',
  study: 'total_study_min',
  settles: 'total_settles',
}

interface SnapshotCache {
  [filter: string]: { snapshot: LeaderboardSnapshot; fetchedAt: number }
}

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 min — matches cron cadence

export default function LeaderboardPage(): JSX.Element {
  const { user, session } = useAuth()
  const userId = user?.id ?? null
  const accessToken = session?.access_token ?? null
  const fallbackDisplayName =
    (user?.user_metadata?.name as string | undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email ??
    undefined
  const [activeFilter, setActiveFilter] = useState<LeaderboardFilter>('composite')
  const [snapshotCache, setSnapshotCache] = useState<SnapshotCache>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<LeaderboardProfileRow | null>(null)
  const [showOptInModal, setShowOptInModal] = useState(false)

  const cachedEntry = snapshotCache[activeFilter]
  const snapshot = cachedEntry?.snapshot ?? null

  useEffect(() => {
    let cancelled = false
    const loadProfile = async (): Promise<void> => {
      if (!userId) {
        setProfile(null)
        return
      }
      const row = await getLeaderboardProfile(userId)
      if (cancelled) return
      setProfile(row ?? null)
      // Show opt-in modal on first visit if never opted in and not dismissed
      if ((!row || !row.opted_in) && !row?.dismissed_at && accessToken) {
        setShowOptInModal(true)
      }
    }
    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [userId, accessToken])

  useEffect(() => {
    let cancelled = false
    const stale = !cachedEntry || Date.now() - cachedEntry.fetchedAt > CACHE_TTL_MS
    if (!stale) return
    setLoading(true)
    setError(null)
    fetchLeaderboardSnapshot(activeFilter)
      .then((snap) => {
        if (cancelled) return
        setSnapshotCache((prev) => ({
          ...prev,
          [activeFilter]: { snapshot: snap, fetchedAt: Date.now() },
        }))
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeFilter, cachedEntry])

  const handleOptInModalClose = (): void => {
    setShowOptInModal(false)
  }

  const handleOptedIn = async (): Promise<void> => {
    setShowOptInModal(false)
    if (userId) {
      const row = await getLeaderboardProfile(userId)
      setProfile(row ?? null)
    }
    // Force refresh after first opt-in so my-row appears in next snapshot
    setSnapshotCache({})
  }

  const myRank = profile && snapshot ? findRank(snapshot.rows, profile.user_id) : null

  // Rank-up feedback (neurons-juice-animations): tween the rank number on change,
  // and celebrate when it improves (smaller = better). prevRank is tracked
  // per-filter so switching tabs (a different ranking, not an improvement) does
  // not falsely celebrate. Session-only refs/state → nothing persisted; first
  // load shows no animation.
  const prevRankRef = useRef<Record<string, number>>({})
  const [rankTween, setRankTween] = useState<{ from: number; to: number } | null>(null)
  const [rankCelebrateNonce, setRankCelebrateNonce] = useState(0)
  useEffect(() => {
    if (myRank === null) return
    const prev = prevRankRef.current[activeFilter]
    if (prev !== undefined && prev !== myRank) {
      setRankTween({ from: prev, to: myRank })
      if (myRank < prev) setRankCelebrateNonce((n) => n + 1)
    }
    prevRankRef.current[activeFilter] = myRank
  }, [myRank, activeFilter])

  return (
    <>
      {showOptInModal && userId && accessToken && (
        <LeaderboardOptInModal
          userId={userId}
          accessToken={accessToken}
          fallbackDisplayName={fallbackDisplayName}
          onClose={handleOptInModalClose}
          onOptedIn={() => void handleOptedIn()}
        />
      )}

      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>排行榜</h1>
        <p style={{ margin: 0, color: '#5a3f29', fontStyle: 'italic' }}>
          Opt-in only · 每 30 分鐘更新一次
        </p>
      </header>

      {profile && profile.opted_in && (
        <div style={{ ...myRankChipStyle, position: 'relative' }}>
          {rankCelebrateNonce > 0 && (
            <CelebrationHalo key={`rankup-${rankCelebrateNonce}`} intensity={2} color="var(--signal-cyan)" />
          )}
          {!profile.is_public ? (
            <span>未加入排行 — 至下方設定開啟以參與</span>
          ) : myRank !== null ? (
            <span>
              你目前第{' '}
              <strong>
                {rankTween && rankTween.to === myRank ? (
                  <NumberTickUp from={rankTween.from} to={rankTween.to} durationMs={600} />
                ) : (
                  myRank
                )}
              </strong>{' '}
              名 (共 {snapshot?.total_count ?? '?'} 人)
            </span>
          ) : (
            <span>已加入排行但未進入此分類前 100 名 (共 {snapshot?.total_count ?? '?'} 人)</span>
          )}
        </div>
      )}

      <nav style={tabStripStyle} className="neurons-chip-row neurons-chip-row--scroll" role="tablist">
        {LEADERBOARD_FILTERS.map((filter) => {
          const active = activeFilter === filter
          return (
            <button
              key={filter}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveFilter(filter)}
              style={active ? activeTabStyle : tabStyle}
            >
              {FILTER_LABELS[filter]}
            </button>
          )
        })}
      </nav>

      {loading && <p style={{ color: '#5a3f29' }}>載入中…</p>}
      {error && <p style={{ color: '#c44d4d' }}>載入失敗：{error}</p>}

      {snapshot && !loading && !error && (
        <LeaderboardGrid
          snapshot={snapshot}
          activeFilter={activeFilter}
          myUserId={profile?.user_id ?? null}
        />
      )}

      {snapshot && snapshot.last_updated_at && (
        <p style={lastUpdatedStyle}>
          上次更新：{new Date(snapshot.last_updated_at).toLocaleString('zh-TW')}
        </p>
      )}

      {userId && accessToken && (
        <section style={{ marginTop: '1.25rem' }}>
          <LeaderboardSettingsControls userId={userId} accessToken={accessToken} />
        </section>
      )}

      <footer style={footerStyle}>
        <p>📌 資料為玩家本機記錄、自填無驗證</p>
        <p>📌 累積唸書計時自 neurons-tw 上線起算；neurons-tw 與 二階 排行榜各自獨立</p>
      </footer>
    </>
  )
}

function LeaderboardGrid({
  snapshot,
  activeFilter,
  myUserId,
}: {
  snapshot: LeaderboardSnapshot
  activeFilter: LeaderboardFilter
  myUserId: string | null
}): JSX.Element {
  if (snapshot.rows.length === 0) {
    return (
      <div style={emptyStateStyle}>
        期待第一個上榜的 neurons-tw 玩家！
      </div>
    )
  }

  const primaryStat = FILTER_PRIMARY_STAT[activeFilter]

  return (
    <div style={gridStyle} className="neurons-lb-list" data-active-stat={primaryStat}>
      <div style={headerRowStyle} className="neurons-lb-row">
        <span style={rankCellStyle}>#</span>
        <span style={nicknameCellStyle}>暱稱</span>
        <span style={statCellStyle} className="neurons-lb-cell--variant">變體</span>
        <span style={statCellStyle} className="neurons-lb-cell--ap">AP</span>
        <span style={statCellStyle} className="neurons-lb-cell--study">唸書(分)</span>
        <span style={statCellStyle} className="neurons-lb-cell--settles">探索</span>
      </div>
      {snapshot.rows.map((row, idx) => {
        const rank = idx + 1
        const isMe = row.user_id === myUserId
        const rowStyleFinal: React.CSSProperties = {
          ...dataRowStyle,
          ...(isMe ? myRowStyle : {}),
        }
        return (
          <div key={row.user_id} style={rowStyleFinal} className="neurons-lb-row">
            <span style={{ ...rankCellStyle, ...rankAccent(rank) }}>{rank}</span>
            <NicknameWithBadges nickname={row.nickname} badgesCsv={row.badges_csv ?? ''} />
            <span style={statCellWithPrimary(primaryStat === 'variant_count')} className="neurons-lb-cell--variant">
              {row.variant_count}
            </span>
            <span style={statCellWithPrimary(primaryStat === 'total_AP')} className="neurons-lb-cell--ap">
              {row.total_AP.toLocaleString()}
            </span>
            <span style={statCellWithPrimary(primaryStat === 'total_study_min')} className="neurons-lb-cell--study">
              {formatStudyMin(row.total_study_min)}
            </span>
            <span style={statCellWithPrimary(primaryStat === 'total_settles')} className="neurons-lb-cell--settles">
              {row.total_settles}
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface ParsedBadge {
  category: NeuronsAchievementCategory
  tier: NeuronsAchievementTier
}

const VALID_CATEGORIES = new Set<NeuronsAchievementCategory>([
  'study',
  'quiz',
  'variant',
  'synapse',
  'mastery',
  'fortune',
])

function parseBadgesCsv(csv: string): ParsedBadge[] {
  if (!csv) return []
  const out: ParsedBadge[] = []
  for (const token of csv.split(',')) {
    const [cat, tier] = token.split(':')
    if (!cat || !tier) continue
    if (!VALID_CATEGORIES.has(cat as NeuronsAchievementCategory)) continue
    if (!['P1', 'P2', 'P3', 'P4'].includes(tier)) continue
    out.push({
      category: cat as NeuronsAchievementCategory,
      tier: tier as NeuronsAchievementTier,
    })
  }
  return out
}

function NicknameWithBadges({
  nickname,
  badgesCsv,
}: {
  nickname: string
  badgesCsv: string
}): JSX.Element {
  const badges = parseBadgesCsv(badgesCsv)
  return (
    <span style={badges.length > 0 ? nicknameWithBadgesStyle : nicknameCellStyle}>
      <span style={nicknameTextStyle}>{nickname}</span>
      {badges.map((b) => (
        <BadgeSprite key={`${b.category}:${b.tier}`} category={b.category} tier={b.tier} size={20} />
      ))}
    </span>
  )
}

function findRank(rows: LeaderboardRow[], userId: string): number | null {
  const idx = rows.findIndex((r) => r.user_id === userId)
  return idx === -1 ? null : idx + 1
}

function formatStudyMin(min: number): string {
  if (min < 60) return `${min}m`
  const hours = Math.floor(min / 60)
  const remaining = min % 60
  return `${hours}h ${remaining}m`
}

function rankAccent(rank: number): React.CSSProperties {
  if (rank === 1) return { color: '#d4a04d', fontWeight: 700 }
  if (rank === 2) return { color: '#9b9b9b', fontWeight: 700 }
  if (rank === 3) return { color: '#c4793f', fontWeight: 700 }
  return {}
}

function statCellWithPrimary(isPrimary: boolean): React.CSSProperties {
  return {
    ...statCellStyle,
    fontWeight: isPrimary ? 700 : 400,
    color: isPrimary ? '#1a1410' : '#5a3f29',
  }
}

// Layout lives in `.neurons-chip-row` so the ≤768px scroll-rail wins (5 long-CJK
// filter tabs → one scrollable row instead of wrapping to 2-3 lines; full labels
// kept — the排名 categories have no self-evident icon, so no icon-collapse).
const tabStripStyle: React.CSSProperties = {
  gap: '0.4rem',
  marginBottom: '0.75rem',
}

const tabStyle: React.CSSProperties = {
  padding: '0.35rem 0.75rem',
  background: 'transparent',
  border: '2px solid #8c6d4a',
  borderRadius: '3px',
  color: '#5a3f29',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  cursor: 'pointer',
}

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: '#b58900',
  color: '#fff',
  borderColor: '#b58900',
  fontWeight: 700,
}

const myRankChipStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.35rem 0.75rem',
  background: '#fdf6e3',
  border: '2px solid #b58900',
  borderRadius: '999px',
  color: '#5a3f29',
  fontSize: '0.85rem',
  marginBottom: '0.6rem',
  fontFamily: 'var(--font-pixel-cjk)',
}

const gridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  border: '2px solid #5a3f29',
  borderRadius: '4px',
  background: '#fdf6e3',
  overflow: 'hidden',
  fontFamily: 'var(--font-pixel-cjk)',
}

const headerRowStyle: React.CSSProperties = {
  display: 'grid',
  // grid-template-columns moved to .neurons-lb-row (styles.css) via
  // --neurons-lb-cols so the ≤480px @media can collapse it (Decision 1:
  // inline would otherwise beat the CSS @media).
  gap: '0.4rem',
  padding: '0.4rem 0.6rem',
  background: '#e8dcc0',
  borderBottom: '2px solid #8c6d4a',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#5a3f29',
}

const dataRowStyle: React.CSSProperties = {
  display: 'grid',
  // grid-template-columns moved to .neurons-lb-row (styles.css) — see headerRowStyle.
  gap: '0.4rem',
  padding: '0.4rem 0.6rem',
  borderBottom: '1px solid #d4c4a0',
  fontSize: '0.82rem',
  alignItems: 'center',
}

const myRowStyle: React.CSSProperties = {
  background: '#fffce0',
  borderLeft: '4px solid #b58900',
}

const rankCellStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '0.9rem',
}

const nicknameCellStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 600,
  color: '#1a1410',
}

// With badges present, lay nickname + badges out as ONE inline-flex row.
// (BadgeSprite is a block <div> with flexShrink:0 — inside a plain inline span it
// stacked into several rows; a flex container keeps them on one line.)
const nicknameWithBadgesStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  maxWidth: '100%',
  fontWeight: 600,
  color: '#1a1410',
}

// The nickname text truncates with an ellipsis; badges (flexShrink:0) stay intact.
const nicknameTextStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

const statCellStyle: React.CSSProperties = {
  textAlign: 'right',
  color: '#5a3f29',
}

const emptyStateStyle: React.CSSProperties = {
  background: '#fdf6e3',
  border: '2px dashed #8c6d4a',
  borderRadius: '4px',
  padding: '1.5rem 1rem',
  textAlign: 'center',
  color: '#5a3f29',
  fontSize: '0.85rem',
  lineHeight: 1.6,
}

const lastUpdatedStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#8c6d4a',
  textAlign: 'right',
  fontStyle: 'italic',
  margin: '0.4rem 0 0',
}

const footerStyle: React.CSSProperties = {
  marginTop: '1.5rem',
  paddingTop: '0.7rem',
  borderTop: '1px solid #d4c4a0',
  fontSize: '0.7rem',
  color: '#8c6d4a',
  fontFamily: 'var(--font-pixel-cjk)',
}
