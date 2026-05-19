// MigrationBanner — non-modal top-of-viewport prompt that offers M4-era users
// a one-click path to migrate their Supabase row data into R2 blobs. See
// openspec spec "Banner-prompted client-side migration for existing M4-era
// users" for full requirements.
//
// Phase 2 scope: detects + migrates all 3 bundles (M1 / M2 / bookmarks).
// Banner triggers when ANY bundle has Supabase rows but no R2 blob.

import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  detectAllBundlesMigrationNeeded,
  migrateAllBundlesFromSupabase,
} from '../lib/sync/r2/migrate-from-supabase'

interface Props {
  supabase: SupabaseClient
  userId: string
}

interface DismissLog {
  /** Snooze cutoff — banner stays hidden until epoch ms ≥ this. */
  snoozedUntil: number
  /** Dismiss event timestamps (epoch ms). Used to detect ≥ 3 dismissals across ≥ 7 days. */
  dismisses: number[]
}

const STORAGE_KEY = 'migration-banner-dismiss-log'
const SNOOZE_MS = 24 * 60 * 60 * 1000      // 24 hours
const ESCALATION_DAYS = 7
const ESCALATION_DISMISS_COUNT = 3

const DAY_MS = 24 * 60 * 60 * 1000

function readDismissLog(): DismissLog {
  if (typeof localStorage === 'undefined') return { snoozedUntil: 0, dismisses: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { snoozedUntil: 0, dismisses: [] }
    const parsed = JSON.parse(raw) as Partial<DismissLog>
    return {
      snoozedUntil: typeof parsed.snoozedUntil === 'number' ? parsed.snoozedUntil : 0,
      dismisses: Array.isArray(parsed.dismisses) ? parsed.dismisses.filter((n) => typeof n === 'number') : [],
    }
  } catch {
    return { snoozedUntil: 0, dismisses: [] }
  }
}

function writeDismissLog(log: DismissLog): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log))
  } catch {
    // quota / private mode — banner reverts to default each session, acceptable
  }
}

function clearDismissLog(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

function isEscalated(log: DismissLog): boolean {
  if (log.dismisses.length < ESCALATION_DISMISS_COUNT) return false
  const sevenDaysAgo = Date.now() - ESCALATION_DAYS * DAY_MS
  const oldEnough = log.dismisses.filter((ts) => ts <= sevenDaysAgo)
  return oldEnough.length >= 1 && log.dismisses.length >= ESCALATION_DISMISS_COUNT
}

type Visibility = 'hidden' | 'checking' | 'visible' | 'migrating' | 'done' | 'error'

export function MigrationBanner({ supabase, userId }: Props) {
  const [visibility, setVisibility] = useState<Visibility>('checking')
  const [escalated, setEscalated] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const recheck = useCallback(async () => {
    const log = readDismissLog()
    setEscalated(isEscalated(log))

    // Honor snooze window unless escalated copy is due.
    if (!isEscalated(log) && log.snoozedUntil > Date.now()) {
      setVisibility('hidden')
      return
    }

    try {
      const probe = await detectAllBundlesMigrationNeeded(supabase, userId)
      setVisibility(probe.needsMigration ? 'visible' : 'hidden')
    } catch (err) {
      // Detection failure means we can't decide; default to hiding to avoid
      // alarming users with a banner that can't act.
      // eslint-disable-next-line no-console
      console.warn('[MigrationBanner] detection failed:', (err as Error)?.message)
      setVisibility('hidden')
    }
  }, [supabase, userId])

  useEffect(() => {
    recheck()
  }, [recheck])

  const handleMigrate = useCallback(async () => {
    setVisibility('migrating')
    setErrorMsg(null)
    try {
      const results = await migrateAllBundlesFromSupabase(supabase, userId)
      const failures = results.filter((r) => r.status === 'failed')
      if (failures.length === 0) {
        // All 3 bundles either uploaded, already-present, or had no rows.
        clearDismissLog()
        setVisibility('done')
        setTimeout(() => setVisibility('hidden'), 5000)
      } else {
        setVisibility('error')
        const summary = failures
          .map((f) => `${f.bundle}: ${f.error ?? 'unknown'}`)
          .join(' / ')
        setErrorMsg(`${failures.length}/${results.length} 個 bundle 失敗 — ${summary}`)
      }
    } catch (err) {
      setVisibility('error')
      setErrorMsg((err as Error)?.message ?? '遷移失敗，請稍後重試')
    }
  }, [supabase, userId])

  const handleSnooze = useCallback(() => {
    const log = readDismissLog()
    const next: DismissLog = {
      snoozedUntil: Date.now() + SNOOZE_MS,
      dismisses: [...log.dismisses, Date.now()],
    }
    writeDismissLog(next)
    setVisibility('hidden')
  }, [])

  if (visibility === 'hidden' || visibility === 'checking') return null

  return (
    <div
      className="migration-banner"
      role="region"
      aria-label="雲端架構升級提示"
    >
      <div className="migration-banner-body">
        {visibility === 'visible' && (
          <>
            <span className="migration-banner-icon">🔄</span>
            <div className="migration-banner-text">
              <strong>
                {escalated
                  ? '您的雲端存檔還在舊系統中，請點此遷移以確保跨裝置同步繼續運作'
                  : '雲端架構升級中'}
              </strong>
              {!escalated && (
                <span className="migration-banner-sub">
                  你的存檔需要一次性遷移（約 5 秒，可繼續玩）。
                </span>
              )}
            </div>
            <div className="migration-banner-actions">
              <button
                type="button"
                className="migration-banner-btn migration-banner-btn--primary"
                onClick={handleMigrate}
              >
                立即遷移
              </button>
              <button
                type="button"
                className="migration-banner-btn migration-banner-btn--ghost"
                onClick={handleSnooze}
              >
                稍後再說
              </button>
            </div>
          </>
        )}

        {visibility === 'migrating' && (
          <>
            <span className="migration-banner-icon">⏳</span>
            <div className="migration-banner-text">
              <strong>正在遷移你的雲端存檔…</strong>
              <span className="migration-banner-sub">不要關閉分頁，幾秒內完成。</span>
            </div>
          </>
        )}

        {visibility === 'done' && (
          <>
            <span className="migration-banner-icon">✅</span>
            <div className="migration-banner-text">
              <strong>遷移完成</strong>
              <span className="migration-banner-sub">你的存檔已移到新雲端架構。</span>
            </div>
          </>
        )}

        {visibility === 'error' && (
          <>
            <span className="migration-banner-icon">⚠</span>
            <div className="migration-banner-text">
              <strong>遷移失敗</strong>
              <span className="migration-banner-sub">{errorMsg}</span>
            </div>
            <div className="migration-banner-actions">
              <button
                type="button"
                className="migration-banner-btn migration-banner-btn--primary"
                onClick={handleMigrate}
              >
                重試
              </button>
              <button
                type="button"
                className="migration-banner-btn migration-banner-btn--ghost"
                onClick={handleSnooze}
              >
                稍後再說
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
