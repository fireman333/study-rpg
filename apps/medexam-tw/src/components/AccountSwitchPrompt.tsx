// AccountSwitchPrompt — shown when a DIFFERENT Google account signs in on a
// browser that already has another user's local progress (fix-sync-sign-in-
// lifecycle Bug 2). Renders BEFORE the existing MigrationUploadPrompt /
// ConflictChooserModal so the user explicitly decides how to handle the
// cross-account state collision.
//
// Three options:
//   1. 清空本地 — wipe synced tables + migration meta keys, then proceed
//      with fresh-start gate (recommended for shared / borrowed devices)
//   2. 保留本地 — fall through to existing conflict-chooser flow (current
//      default behavior; explicit now)
//   3. 先登出 — abort, return to unauthed state without touching anything

import { useState } from 'react'

export type AccountSwitchChoice = 'clear-local' | 'keep-local' | 'signout'

interface Props {
  currentEmail: string | null
  previousUserIdPreview: string
  localMaxUpdatedAt: number | null
  cloudHasRows: boolean | null  // null = still checking (offline)
  online: boolean
  onChoose: (choice: AccountSwitchChoice) => Promise<void>
}

function formatTs(ms: number | null): string {
  if (ms === null) return '（無記錄）'
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Taipei',
      hour12: false,
    }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString()
  }
}

export function AccountSwitchPrompt({
  currentEmail,
  previousUserIdPreview,
  localMaxUpdatedAt,
  cloudHasRows,
  online,
  onChoose,
}: Props) {
  const [busy, setBusy] = useState<AccountSwitchChoice | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(choice: AccountSwitchChoice) {
    if (busy) return
    setBusy(choice)
    setError(null)
    try {
      await onChoose(choice)
    } catch (err) {
      setError((err as Error)?.message ?? '操作失敗，請重試')
    } finally {
      setBusy(null)
    }
  }

  const cloudLabel =
    cloudHasRows === null
      ? '（離線，待連線確認）'
      : cloudHasRows
        ? '有進度'
        : '尚無進度'

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="不同帳號登入"
    >
      <div className="modal frame migration-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>⚠ 偵測到不同的 Google 帳號</span>
        </div>
        <p className="migration-body">
          這個瀏覽器本機已有上一個帳號（
          <code className="migration-email">{previousUserIdPreview}</code>
          ）的遊戲進度，但你現在登入的是
          {currentEmail ? (
            <>
              {' '}
              <code className="migration-email">{currentEmail}</code>
            </>
          ) : (
            '另一個帳號'
          )}
          。
        </p>

        <div className="migration-compare">
          <div className="migration-compare-side">
            <div className="migration-compare-label">📱 本機（上一個帳號）</div>
            <div className="migration-compare-ts">{formatTs(localMaxUpdatedAt)}</div>
          </div>
          <div className="migration-compare-side">
            <div className="migration-compare-label">☁ 雲端（新帳號）</div>
            <div className="migration-compare-ts">{cloudLabel}</div>
          </div>
        </div>

        <p className="migration-body">
          在你做選擇前，自動同步已暫停，本機與雲端都不會被改動。
        </p>

        <div className="migration-actions">
          <button
            type="button"
            className="migration-btn migration-btn--primary"
            disabled={busy !== null || !online}
            onClick={() => handle('clear-local')}
          >
            {busy === 'clear-local' ? '清空中…' : '🧹 清空本地、改用此帳號的雲端進度'}
            <span className="migration-hint">
              推薦：把上一個帳號的本機進度清掉，從此帳號的雲端開始。
              {!online && '（離線中無法執行）'}
            </span>
          </button>

          <button
            type="button"
            className="migration-btn migration-btn--secondary"
            disabled={busy !== null}
            onClick={() => handle('keep-local')}
          >
            {busy === 'keep-local' ? '繼續中…' : '🔀 保留本地進度、合併到此帳號雲端'}
            <span className="migration-hint">
              保留現在的本機進度，等等再以 LWW（較新者勝）決定每筆資料。
              注意：上一個帳號的紀錄會變成此新帳號的雲端內容。
            </span>
          </button>

          <button
            type="button"
            className="migration-btn migration-btn--neutral"
            disabled={busy !== null}
            onClick={() => handle('signout')}
          >
            {busy === 'signout' ? '登出中…' : '↩ 先登出，我用回原本帳號'}
            <span className="migration-hint">不動本機資料、立刻登出</span>
          </button>
        </div>

        {error && <div className="migration-error">⚠ {error}</div>}
      </div>
    </div>
  )
}
