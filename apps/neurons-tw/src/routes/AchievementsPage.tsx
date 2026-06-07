/**
 * `/achievements` route — list catalog with filters + sub-tabs.
 *
 * Strict hidden filtering: locked hidden entries are completely invisible
 * (no card, no silhouette, no count in denominator) per spec Req.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import { useEffect, useMemo, useState } from 'react'
import {
  NEURONS_ACHIEVEMENTS,
  NEURONS_ACHIEVEMENT_CATEGORIES,
  CATEGORY_LABEL,
  TIER_LABEL,
  type NeuronsAchievementCategory,
  type NeuronsAchievementTier,
} from '@study-rpg/content-neurons-tw'
import { db, type AchievementRow } from '../lib/db'
import { subscribeAchievementToasts } from '../lib/achievement-toast-queue'
import { AchievementCard } from '../components/AchievementCard'

const TIERS: NeuronsAchievementTier[] = ['P1', 'P2', 'P3', 'P4']

type TabKey = 'unlocked' | 'all'

export default function AchievementsPage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('all')
  const [categoryFilter, setCategoryFilter] = useState<NeuronsAchievementCategory | 'all'>('all')
  const [tierFilter, setTierFilter] = useState<NeuronsAchievementTier | 'all'>('all')

  const [rows, setRows] = useState<AchievementRow[]>([])

  useEffect(() => {
    let cancelled = false
    const fetch = () => {
      void db.achievements.toArray().then((r) => {
        if (!cancelled) setRows(r)
      })
    }
    fetch()
    // Re-fetch whenever the toast queue receives a new unlock (fresh row was
    // just persisted by `triggerAchievementCheck`). Cheap subscription —
    // listener is synchronous; refetch is debounced by react state batching.
    const unsub = subscribeAchievementToasts(() => fetch())
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const unlockedMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.id, r.unlockedAt)
    return m
  }, [rows])

  const totalUnlocked = unlockedMap.size

  const visible = useMemo(() => {
    return NEURONS_ACHIEVEMENTS.filter((a) => {
      const isUnlocked = unlockedMap.has(a.id)
      // Strict hidden: locked hidden entries are NEVER visible.
      if (a.hidden && !isUnlocked) return false
      // Sub-tab filter
      if (tab === 'unlocked' && !isUnlocked) return false
      // Category filter
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false
      // Tier filter
      if (tierFilter !== 'all' && a.tier !== tierFilter) return false
      return true
    })
  }, [unlockedMap, tab, categoryFilter, tierFilter])

  // Denominator: total catalog excluding locked-hidden (so the counter stays honest)
  const denomVisible = useMemo(() => {
    return NEURONS_ACHIEVEMENTS.filter((a) => !a.hidden || unlockedMap.has(a.id)).length
  }, [unlockedMap])

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.85rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>成就</h1>
        <span style={{ fontSize: 13, opacity: 0.8 }}>
          {totalUnlocked} / {denomVisible} 已解鎖
        </span>
      </header>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <TabButton active={tab === 'all'} onClick={() => setTab('all')} label="全部" />
        <TabButton
          active={tab === 'unlocked'}
          onClick={() => setTab('unlocked')}
          label="已解鎖"
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={filterLabelStyle}>
          類別：
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as NeuronsAchievementCategory | 'all')}
            style={selectStyle}
          >
            <option value="all">全部</option>
            {NEURONS_ACHIEVEMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabelStyle}>
          階級：
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as NeuronsAchievementTier | 'all')}
            style={selectStyle}
          >
            <option value="all">全部</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.7 }}>沒有符合條件的成就。試試其他篩選。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {visible.map((a) => (
            <AchievementCard
              key={a.id}
              achievement={a}
              unlocked={unlockedMap.has(a.id)}
              unlockedAt={unlockedMap.get(a.id)}
            />
          ))}
        </div>
      )}

      <footer style={{ fontSize: 11, opacity: 0.7, marginTop: '0.5rem' }}>
        ※ 隱藏成就解鎖前不會出現在此頁面 — 探索獲取吧。
      </footer>
    </section>
  )
}

const filterLabelStyle: React.CSSProperties = {
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  color: '#5a3f29',
}

const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--font-pixel-cjk)',
  fontSize: 13,
  padding: '0.2rem 0.4rem',
  background: '#f4ecd8',
  border: '2px solid #5a4d3a',
  color: '#5a3f29',
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-pixel-cjk)',
        fontSize: 14,
        padding: '0.35rem 0.85rem',
        background: active ? '#b58900' : '#f4ecd8',
        color: active ? '#f4ecd8' : '#5a3f29',
        border: '2px solid #5a4d3a',
        cursor: 'pointer',
        fontWeight: active ? 700 : 500,
      }}
    >
      {label}
    </button>
  )
}
