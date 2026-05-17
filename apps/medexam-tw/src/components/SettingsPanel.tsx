// Cloud-sync settings panel (M4 Task 7).
//
// Three sections:
//   1. 帳號 — email + sign-out
//   2. 同步狀態 — last push / last pull / engine status + "重新解決衝突" if paused
//   3. 資料管理 — Export cloud data (Blob download) + Delete account data (RPC + sign out)

import { useEffect, useState } from 'react'
import { getSupabase } from '../lib/auth/client'
import type { MigrationGateState } from '../lib/sync/migration'
import type { SyncStatus } from '../lib/sync/types'

interface Props {
  email: string | null
  status: SyncStatus
  lastPushAt: number | null
  lastPullAt: number | null
  gateState: MigrationGateState
  onSignOut: () => Promise<void>
  onReopenConflictChooser: () => Promise<void>
  onResetMigrationPreference: () => Promise<void>
  onClose: () => void
}

function formatRelative(ms: number | null): string {
  if (ms === null) return '尚未同步'
  const diffSec = Math.floor((Date.now() - ms) / 1000)
  if (diffSec < 5) return '剛剛'
  if (diffSec < 60) return `${diffSec} 秒前`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分鐘前`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小時前`
  return new Date(ms).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
}

function statusLabel(status: SyncStatus): { icon: string; text: string; color?: string } {
  switch (status) {
    case 'idle':
      return { icon: '✓', text: '同步中', color: '#1f8b4c' }
    case 'pushing':
      return { icon: '↑', text: '上傳中', color: '#1f4c8b' }
    case 'pulling':
      return { icon: '↓', text: '下載中', color: '#1f4c8b' }
    case 'offline':
      return { icon: '⚠', text: '離線（等待重連）', color: '#c4884d' }
    case 'paused':
      return { icon: '⏸', text: '已暫停（待解決衝突）', color: '#c44d4d' }
    case 'error':
      return { icon: '✗', text: '錯誤', color: '#c44d4d' }
    case 'unauthed':
      return { icon: '○', text: '未登入', color: '#888' }
    case 'disabled':
      return { icon: '○', text: '雲端同步未啟用', color: '#888' }
    default:
      return { icon: '?', text: status }
  }
}

export function SettingsPanel({
  email,
  status,
  lastPushAt,
  lastPullAt,
  gateState,
  onSignOut,
  onReopenConflictChooser,
  onResetMigrationPreference,
  onClose,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  // Tick once per 30s so "X 分鐘前" stays roughly fresh.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  async function withBusy<T>(key: string, fn: () => Promise<T>, successMsg?: string): Promise<T | null> {
    setBusy(key)
    setError(null)
    setInfo(null)
    try {
      const r = await fn()
      if (successMsg) setInfo(successMsg)
      return r
    } catch (err) {
      setError((err as Error)?.message ?? '操作失敗')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function handleExport() {
    await withBusy(
      'export',
      async () => {
        const supabase = getSupabase()
        if (!supabase) throw new Error('Supabase 未啟用')
        const { data, error } = await supabase.rpc('export_my_data')
        if (error) throw error
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `study-rpg-export-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      },
      '雲端資料已下載',
    )
  }

  async function handleDeleteAccount() {
    const ok = window.confirm(
      '⚠ 確定要刪除這個帳號的雲端資料嗎？\n\n' +
        '會立刻：\n' +
        '・刪除雲端所有 sync 紀錄（player_state / srs / items / mentor_backlog）\n' +
        '・刪除 Supabase auth user（如要重新登入需重新授權）\n' +
        '・登出當前 session\n\n' +
        '本機 IndexedDB 進度不會被刪，繼續離線可玩。\n' +
        '此動作無法復原。',
    )
    if (!ok) return
    await withBusy(
      'delete',
      async () => {
        const supabase = getSupabase()
        if (!supabase) throw new Error('Supabase 未啟用')
        const { error } = await supabase.rpc('delete_my_account')
        if (error) throw error
        await onSignOut()
        onClose()
      },
      '雲端資料與帳號已刪除，已登出',
    )
  }

  const showReopenConflict = gateState === 'paused' || status === 'paused'

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="雲端同步設定" onClick={onClose}>
      <div className="modal frame settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>⚙ 雲端同步設定</span>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* ─── 帳號 ─────────────────────────────────────────── */}
        <section className="settings-section">
          <div className="settings-section-title">帳號</div>
          <div className="settings-row">
            <span className="settings-label">登入身分</span>
            <span className="settings-value">{email ?? '未登入'}</span>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="settings-btn"
              disabled={busy !== null}
              onClick={() => withBusy('signout', onSignOut, '已登出')}
            >
              {busy === 'signout' ? '登出中…' : '登出'}
            </button>
          </div>
        </section>

        {/* ─── 同步狀態 ──────────────────────────────────────── */}
        <section className="settings-section">
          <div className="settings-section-title">同步狀態</div>
          <div className="settings-row">
            <span className="settings-label">目前狀態</span>
            <span className="settings-value" style={{ color: statusLabel(status).color }}>
              {statusLabel(status).icon} {statusLabel(status).text}
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-label">最後上傳</span>
            <span className="settings-value">{formatRelative(lastPushAt)}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">最後下載</span>
            <span className="settings-value">{formatRelative(lastPullAt)}</span>
          </div>
          {showReopenConflict && (
            <div className="settings-actions">
              <button
                type="button"
                className="settings-btn settings-btn--primary"
                disabled={busy !== null}
                onClick={() => withBusy('reopen', onReopenConflictChooser)}
              >
                {busy === 'reopen' ? '開啟中…' : '重新解決衝突'}
              </button>
            </div>
          )}
          <div className="settings-actions">
            <button
              type="button"
              className="settings-btn settings-btn--secondary"
              disabled={busy !== null}
              onClick={() =>
                withBusy('reset-pref', onResetMigrationPreference, '已重置同步偏好，下次重新詢問')
              }
            >
              {busy === 'reset-pref' ? '重置中…' : '重置同步偏好（重新詢問）'}
            </button>
          </div>
        </section>

        {/* ─── 資料管理 ──────────────────────────────────────── */}
        <section className="settings-section">
          <div className="settings-section-title">資料管理</div>
          <div className="settings-actions">
            <button
              type="button"
              className="settings-btn"
              disabled={busy !== null}
              onClick={handleExport}
            >
              {busy === 'export' ? '匯出中…' : '⬇ 匯出雲端資料 JSON'}
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--danger"
              disabled={busy !== null}
              onClick={handleDeleteAccount}
            >
              {busy === 'delete' ? '刪除中…' : '🗑 刪除帳號雲端資料'}
            </button>
          </div>
          <p className="settings-hint">
            本機 IndexedDB 進度不會因為這些動作被刪除，仍可離線繼續玩。
          </p>
        </section>

        {info && <div className="settings-info">{info}</div>}
        {error && <div className="migration-error">⚠ {error}</div>}
      </div>
    </div>
  )
}
