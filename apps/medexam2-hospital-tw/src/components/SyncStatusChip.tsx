// SyncStatusChip for 二階 — mirror of apps/medexam-tw/src/components/
// SyncStatusChip.tsx. Same UX, hospital-app sync types.

import { useEffect, useRef, useState } from 'react'
import type { MigrationGateState } from '../lib/sync/migration'
import type { SyncStatus } from '../lib/sync/types'

interface Props {
  status: SyncStatus
  lastPushAt: number | null
  lastPullAt: number | null
  gateState: MigrationGateState
  online: boolean
  onForcePush: () => Promise<void>
  onForcePull: () => Promise<void>
}

interface VisualState {
  icon: string
  label: string
  color: string
}

function computeVisualState(
  status: SyncStatus,
  gateState: MigrationGateState,
  online: boolean,
  lastPushAt: number | null,
  lastPullAt: number | null,
): VisualState {
  if (gateState === 'paused' || gateState === 'keep-separate') {
    return { icon: '⏸', label: '已暫停', color: '#888' }
  }
  if (!online) {
    return { icon: '⚪', label: '離線', color: '#888' }
  }
  if (status === 'pushing' || status === 'pulling') {
    return { icon: '🟡', label: '同步中', color: '#c4884d' }
  }
  if (status === 'error' || status === 'offline') {
    return { icon: '🔴', label: '同步失敗', color: '#c44d4d' }
  }
  if (status === 'idle') {
    const recent = Math.max(lastPushAt ?? 0, lastPullAt ?? 0)
    if (recent > 0 && Date.now() - recent < 60_000) {
      return { icon: '🟢', label: '已同步', color: '#1f8b4c' }
    }
    return { icon: '🟢', label: '已同步', color: '#1f8b4c' }
  }
  return { icon: '⚪', label: '待同步', color: '#888' }
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

export function SyncStatusChip({
  status,
  lastPushAt,
  lastPullAt,
  gateState,
  online,
  onForcePush,
  onForcePull,
}: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'push' | 'pull' | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (popoverRef.current?.contains(t)) return
      if (buttonRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const [, setTick] = useState(0)
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [open])

  const visual = computeVisualState(status, gateState, online, lastPushAt, lastPullAt)

  async function handleForcePush() {
    if (busy) return
    setBusy('push')
    try {
      await onForcePush()
    } finally {
      setBusy(null)
    }
  }

  async function handleForcePull() {
    if (busy) return
    setBusy('pull')
    try {
      await onForcePull()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="sync-status-chip-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="sync-status-chip"
        onClick={() => setOpen((v) => !v)}
        style={{ color: visual.color }}
        title={`同步狀態：${visual.label}`}
        aria-label={`同步狀態：${visual.label}`}
      >
        <span aria-hidden>{visual.icon}</span>
        <span className="sync-status-chip__label">{visual.label}</span>
      </button>
      {open && (
        <div ref={popoverRef} className="sync-status-popover frame" role="dialog">
          <div className="sync-status-popover__title">同步狀態</div>
          <div className="sync-status-popover__row">
            <span>狀態</span>
            <span style={{ color: visual.color }}>
              {visual.icon} {visual.label}
            </span>
          </div>
          <div className="sync-status-popover__row">
            <span>最後上傳</span>
            <span>{formatRelative(lastPushAt)}</span>
          </div>
          <div className="sync-status-popover__row">
            <span>最後下載</span>
            <span>{formatRelative(lastPullAt)}</span>
          </div>
          <div className="sync-status-popover__actions">
            <button
              type="button"
              className="sync-status-popover__btn"
              disabled={busy !== null || !online}
              onClick={handleForcePush}
            >
              {busy === 'push' ? '上傳中…' : '⬆ 立即同步上傳'}
            </button>
            <button
              type="button"
              className="sync-status-popover__btn"
              disabled={busy !== null || !online}
              onClick={handleForcePull}
            >
              {busy === 'pull' ? '下載中…' : '⬇ 立即同步下載'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
