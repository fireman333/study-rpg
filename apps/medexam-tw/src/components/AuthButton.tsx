// Sign-in / settings entry. Floats top-right of the home view.
// Hidden when auth is disabled (no Supabase env vars / sync feature flag off).
//
// - Unauthed: clicking triggers Google OAuth sign-in.
// - Authed: clicking opens the SettingsPanel (caller passes onOpenSettings).
//   Sign-out moved into the settings panel itself (less destructive).

import { useAuth } from '../lib/auth/AuthContext'

interface Props {
  onOpenSettings: () => void
}

export function AuthButton({ onOpenSettings }: Props) {
  const { status, user, signInWithGoogle } = useAuth()

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
        onClick={onOpenSettings}
        title={`已登入：${label}　點此開啟同步設定`}
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
      title="登入以同步進度到雲端（M4）"
    >
      ☁ Sign in
    </button>
  )
}
