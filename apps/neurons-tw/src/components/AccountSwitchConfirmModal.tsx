/**
 * AccountSwitchConfirmModal — shown when the signing-in account differs from
 * the account that owns the local data (account-switch gate).
 *
 * Spec: openspec/changes/fix-neurons-account-switch-guard/specs/neurons-cloud-sync/spec.md
 *   "Account-switch gate blocks cross-account merge"
 *
 * While this modal is up the sync engine is NOT mounted — confirming wipes
 * local data and adopts the new account's cloud save; cancelling signs out
 * and leaves everything untouched.
 */

import { useState } from 'react'

interface Props {
  error: string | null
  onConfirm: () => Promise<void>
  onCancel: () => Promise<void>
}

export default function AccountSwitchConfirmModal({ error, onConfirm, onCancel }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="account-switch-title">
      <div style={cardStyle}>
        <h2 id="account-switch-title" style={titleStyle}>
          ⚠ 偵測到另一個帳號的資料
        </h2>
        <p style={bodyStyle}>
          這台裝置上的遊戲資料屬於<strong>另一個帳號</strong>。
        </p>
        <p style={bodyStyle}>
          按「繼續」會<strong style={dangerTextStyle}>清除本機資料</strong>
          ，改用你這個帳號的雲端存檔（前一個帳號已同步的進度仍安全保存在它自己的雲端）。
        </p>
        <p style={bodyStyle}>按「取消」會登出，本機資料保持原樣。</p>
        {error && <p style={errorStyle}>{error}</p>}
        <div style={buttonRowStyle}>
          <button type="button" style={cancelButtonStyle} disabled={busy} onClick={() => void run(onCancel)}>
            取消（登出）
          </button>
          <button type="button" style={confirmButtonStyle} disabled={busy} onClick={() => void run(onConfirm)}>
            {busy ? '處理中…' : '繼續（清除本機）'}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1200,
  fontFamily: 'var(--font-pixel-cjk)',
  padding: '1rem',
}

const cardStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '3px solid #b58900',
  borderRadius: '8px',
  padding: '1.25rem 1.5rem',
  width: 'min(440px, 92vw)',
  maxHeight: '90vh',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.7rem',
  color: '#1a1410',
  boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#8a3b12',
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  lineHeight: 1.6,
  color: '#5a3f29',
}

const dangerTextStyle: React.CSSProperties = {
  color: '#a4262c',
}

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  color: '#a4262c',
  fontWeight: 700,
}

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.6rem',
  justifyContent: 'flex-end',
  marginTop: '0.4rem',
}

const cancelButtonStyle: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  background: '#e8ddc3',
  border: '2px solid #8a7a55',
  borderRadius: '6px',
  color: '#5a3f29',
  cursor: 'pointer',
}

const confirmButtonStyle: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  background: '#a4262c',
  border: '2px solid #7a1a1f',
  borderRadius: '6px',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
}
