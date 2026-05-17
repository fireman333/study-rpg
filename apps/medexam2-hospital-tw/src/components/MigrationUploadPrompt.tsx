// MigrationUploadPrompt — shown on first sign-in when local has gameplay state
// and cloud has nothing yet (M4 cloud sync, Task 6.2).
//
// Three options per cloud-sync spec Req "Migration prompt":
//   1. Upload local progress — bulk-push everything to cloud
//   2. Keep local separate — persists choice, sync skipped for this user
//   3. Decide later — no-op, re-prompts next sign-in

import { useState } from 'react'

type Choice = 'upload' | 'keep-separate' | 'later'

interface Props {
  email: string | null
  onChoose: (choice: Choice) => Promise<void>
}

export function MigrationUploadPrompt({ email, onChoose }: Props) {
  const [busy, setBusy] = useState<Choice | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(choice: Choice) {
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="本機進度移轉">
      <div className="modal frame migration-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>☁ 雲端同步初次設定</span>
        </div>
        <p className="migration-body">
          這個裝置已有遊戲進度，但雲端帳號
          {email ? <code className="migration-email">{email}</code> : '（你的 Google 帳號）'}
          還是空的。
        </p>
        <p className="migration-body">
          你想怎麼處理本機進度？
        </p>

        <div className="migration-actions">
          <button
            type="button"
            className="migration-btn migration-btn--primary"
            disabled={busy !== null}
            onClick={() => handle('upload')}
          >
            {busy === 'upload' ? '上傳中…' : '☁️ 把本機進度上傳到這個帳號'}
            <span className="migration-hint">推薦：本機資料完整上雲端，之後跨裝置自動同步</span>
          </button>

          <button
            type="button"
            className="migration-btn migration-btn--secondary"
            disabled={busy !== null}
            onClick={() => handle('keep-separate')}
          >
            {busy === 'keep-separate' ? '紀錄中…' : '🔒 本機與雲端分開保存'}
            <span className="migration-hint">本機進度留著、雲端維持空白；不會同步任何資料</span>
          </button>

          <button
            type="button"
            className="migration-btn migration-btn--neutral"
            disabled={busy !== null}
            onClick={() => handle('later')}
          >
            ⏰ 待會再決定
            <span className="migration-hint">下次登入會再問一次</span>
          </button>
        </div>

        {error && <div className="migration-error">⚠ {error}</div>}
      </div>
    </div>
  )
}
