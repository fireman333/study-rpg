// SyncErrorToast — non-blocking toast surfaced after 2 consecutive sync
// failures (fix-sync-sign-in-lifecycle M3). Replaces the previous
// console.warn-only behavior so users actually see when something is wrong.
//
// Auto-dismiss after 10s; tap to retry triggers pushAllNow + pullAllNow.

import { useEffect } from 'react'
import type { SyncErrorToastInfo } from '../lib/sync/useSync'

interface Props {
  info: SyncErrorToastInfo | null
  onDismiss: () => void
  onRetry: () => Promise<void>
}

const AUTO_DISMISS_MS = 10_000

export function SyncErrorToast({ info, onDismiss, onRetry }: Props) {
  useEffect(() => {
    if (!info) return
    const id = setTimeout(() => onDismiss(), AUTO_DISMISS_MS)
    return () => clearTimeout(id)
  }, [info, onDismiss])

  if (!info) return null

  const shortMessage =
    info.record.message.length > 80
      ? info.record.message.slice(0, 77) + '…'
      : info.record.message

  return (
    <div className="sync-error-toast" role="alert" key={info.id}>
      <div className="sync-error-toast__body">
        <strong>同步失敗</strong>
        <span className="sync-error-toast__detail">
          {shortMessage}
          <br />
          資料安全保留在本機。
        </span>
      </div>
      <div className="sync-error-toast__actions">
        <button
          type="button"
          className="sync-error-toast__btn sync-error-toast__btn--primary"
          onClick={() => void onRetry()}
        >
          重試
        </button>
        <button
          type="button"
          className="sync-error-toast__btn"
          onClick={onDismiss}
        >
          關閉
        </button>
      </div>
    </div>
  )
}
