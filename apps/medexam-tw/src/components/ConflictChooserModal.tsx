// ConflictChooserModal — shown on sign-in when BOTH local IndexedDB has
// non-default gameplay state AND cloud already has rows for this user
// (M4 cloud sync, Task 6.3). Critical path — only way local-only state
// gets full-uploaded to cloud, and the only place local data can be replaced
// by cloud values explicitly with user consent.
//
// Three options per cloud-sync spec Req "Conflict chooser":
//   1. Use cloud (overwrite local) — snapshot local to local_backup, full pull
//   2. Use local (overwrite cloud) — bulk push with updated_at=now()
//   3. Decide later — pause sync engine until user re-opens chooser

import { useState } from 'react'

export type ConflictChoice = 'use-cloud' | 'use-local' | 'later'

interface Props {
  email: string | null
  localMaxUpdatedAt: number | null
  cloudMaxUpdatedAt: number | null
  /** Show settings entry-point hint (rendered in "Decide later" tooltip). */
  hasSettingsEntry?: boolean
  onChoose: (choice: ConflictChoice) => Promise<void>
}

function formatTs(ms: number | null): string {
  if (ms === null) return '（沒有資料）'
  try {
    const d = new Date(ms)
    const fmt = new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Taipei',
      hour12: false,
    })
    return fmt.format(d)
  } catch {
    return new Date(ms).toISOString()
  }
}

function fresher(localMs: number | null, cloudMs: number | null): 'local' | 'cloud' | 'tie' {
  if (localMs === null && cloudMs === null) return 'tie'
  if (localMs === null) return 'cloud'
  if (cloudMs === null) return 'local'
  if (localMs === cloudMs) return 'tie'
  return localMs > cloudMs ? 'local' : 'cloud'
}

export function ConflictChooserModal({
  email,
  localMaxUpdatedAt,
  cloudMaxUpdatedAt,
  hasSettingsEntry = true,
  onChoose,
}: Props) {
  const [busy, setBusy] = useState<ConflictChoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const newer = fresher(localMaxUpdatedAt, cloudMaxUpdatedAt)

  async function handle(choice: ConflictChoice) {
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

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="進度衝突解決">
      <div className="modal frame migration-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>⚠ 本機與雲端都有進度</span>
        </div>
        <p className="migration-body">
          這個裝置和雲端帳號
          {email ? <code className="migration-email">{email}</code> : '（你的 Google 帳號）'}
          都有遊戲進度。在你決定之前，自動同步已暫停，兩邊資料都不會被改動。
        </p>

        <div className="migration-compare">
          <div className={`migration-compare-side ${newer === 'local' ? 'migration-compare-side--fresh' : ''}`}>
            <div className="migration-compare-label">📱 本機</div>
            <div className="migration-compare-ts">{formatTs(localMaxUpdatedAt)}</div>
            {newer === 'local' && <div className="migration-compare-badge">較新</div>}
          </div>
          <div className={`migration-compare-side ${newer === 'cloud' ? 'migration-compare-side--fresh' : ''}`}>
            <div className="migration-compare-label">☁ 雲端</div>
            <div className="migration-compare-ts">{formatTs(cloudMaxUpdatedAt)}</div>
            {newer === 'cloud' && <div className="migration-compare-badge">較新</div>}
          </div>
        </div>

        <div className="migration-actions">
          <button
            type="button"
            className="migration-btn migration-btn--primary"
            disabled={busy !== null}
            onClick={() => handle('use-cloud')}
          >
            {busy === 'use-cloud' ? '下載中…' : '☁ 使用雲端（覆蓋本機）'}
            <span className="migration-hint">本機進度會先存進 local_backup 表備份，再用雲端覆蓋</span>
          </button>

          <button
            type="button"
            className="migration-btn migration-btn--primary"
            disabled={busy !== null}
            onClick={() => handle('use-local')}
          >
            {busy === 'use-local' ? '上傳中…' : '📱 使用本機（覆蓋雲端）'}
            <span className="migration-hint">本機進度全部用 updated_at=now() 推上去，覆蓋雲端</span>
          </button>

          <button
            type="button"
            className="migration-btn migration-btn--neutral"
            disabled={busy !== null}
            onClick={() => handle('later')}
          >
            ⏸ 待會再決定（暫停同步）
            <span className="migration-hint">
              {hasSettingsEntry
                ? '本機可繼續玩，但不會同步；之後到設定可重新開啟此對話'
                : '本機可繼續玩，但不會同步；下次登入再問'}
            </span>
          </button>
        </div>

        {error && <div className="migration-error">⚠ {error}</div>}
      </div>
    </div>
  )
}
