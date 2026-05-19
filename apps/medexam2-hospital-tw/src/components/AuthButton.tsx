// Sign-in / account menu entry for 二階. Authed click opens a popover with
// 登出 / 切換帳號 actions (fix-sync-sign-in-lifecycle M1 — replaces the
// previous confirm() flow with an explicit menu so users can pick the
// "clear local + sign out + re-sign-in" path in one tap).
// Hidden when auth is disabled (env vars missing / VITE_CLOUD_SYNC_ENABLED=false).

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth/AuthContext'
import { useSync } from '../lib/sync/useSync'

export function AuthButton() {
  const { status, user, signInWithGoogle } = useAuth()
  const { signOutWithFlush, safeAccountSwitch } = useSync()
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<'signout' | 'switch' | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (popoverRef.current?.contains(t)) return
      if (buttonRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  if (status === 'disabled') return null
  if (status === 'initializing') {
    return (
      <div className="auth-button auth-button--loading" aria-label="Loading auth state">
        …
      </div>
    )
  }

  if (status === 'authed' && user) {
    const label = user.email ?? user.user_metadata?.name ?? '已登入'
    return (
      <div className="auth-button-wrap">
        <button
          ref={buttonRef}
          type="button"
          className="auth-button auth-button--authed"
          onClick={() => setMenuOpen((v) => !v)}
          title={`已登入：${label}　點此打開帳號選單`}
        >
          <span className="auth-button__email">☁️ {label}</span>
          <span className="auth-button__email-collapsed" aria-hidden>
            ☁️
          </span>
        </button>
        {menuOpen && (
          <div ref={popoverRef} className="auth-menu-popover frame" role="dialog">
            <div className="auth-menu-popover__email">{label}</div>
            <button
              type="button"
              className="auth-menu-popover__btn"
              disabled={busy !== null}
              title="本地進度會保留；先確保未上傳的進度推到雲端再登出"
              onClick={async () => {
                if (busy) return
                setBusy('signout')
                try {
                  await signOutWithFlush()
                  setMenuOpen(false)
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === 'signout' ? '登出中…' : '登出'}
            </button>
            <button
              type="button"
              className="auth-menu-popover__btn auth-menu-popover__btn--secondary"
              disabled={busy !== null}
              title="先推未上傳進度+快照本機到 localBackup, 再清空本地、登出、重新打開登入"
              onClick={async () => {
                if (busy) return
                const ok = window.confirm(
                  '⚠ 切換帳號將清空本地醫院進度並重新登入。\n\n' +
                    '我會先確保未上傳的進度推到雲端、再快照備份本機到 localBackup table，' +
                    '然後清空本地、登出、重新打開登入。確定？',
                )
                if (!ok) return
                setBusy('switch')
                try {
                  await safeAccountSwitch()
                  setMenuOpen(false)
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === 'switch' ? '切換中…' : '🔄 切換帳號'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="auth-button auth-button--unauthed"
      onClick={signInWithGoogle}
      title="登入以同步進度到雲端"
    >
      ☁ Sign in
    </button>
  )
}
