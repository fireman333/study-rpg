// Sign-in / sign-out entry for 二階 (M4 mirror).
// Simplified vs 一階: authed click signs out directly (no SettingsPanel yet).
// Hidden when auth is disabled (env vars missing / VITE_CLOUD_SYNC_ENABLED=false).

import { useAuth } from '../lib/auth/AuthContext'

export function AuthButton() {
  const { status, user, signInWithGoogle, signOut } = useAuth()

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
      <button
        type="button"
        className="auth-button auth-button--authed"
        onClick={() => {
          if (confirm(`登出 ${label}？\n本機進度仍會保留。`)) signOut()
        }}
        title={`已登入：${label}　點此登出`}
      >
        ☁️ {label}
      </button>
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
