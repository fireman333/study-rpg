// Minimum-viable sign-in UI for neurons-tw.
//
// Design D2 / D6: plain CSS, no GBA pixel polish yet (deferred Open Question).
// Renders nothing when auth disabled (env vars missing) — the app is fully
// playable offline in that mode. When authed, renders a small inline chip;
// when unauthed, surfaces a Google sign-in button.

import { useAuth } from '../lib/auth/AuthContext'
import { useSyncContext } from '../lib/sync/SyncProvider'
import { mapSyncLight } from '../lib/sync/sync-light'

export function AuthGate(): JSX.Element | null {
  const { status, user, signInWithGoogle, signOut } = useAuth()
  const sync = useSyncContext()

  if (status === 'disabled') return null
  if (status === 'initializing') return null

  if (status === 'authed' && user) {
    const label = user.user_metadata?.name ?? user.email ?? user.id.slice(0, 8)
    const light = sync ? mapSyncLight(sync.status, sync.accountSwitch.pending) : null
    return (
      <div style={chipStyle}>
        {light && (
          <button
            type="button"
            style={lightButtonStyle}
            title={light.title}
            aria-label={light.title}
            onClick={() => {
              if (!light.busy) void sync?.syncNow()
            }}
          >
            {light.glyph}
          </button>
        )}
        <span style={{ opacity: 0.8 }}>已登入</span>
        <span style={{ fontWeight: 600 }}>{String(label)}</span>
        <button onClick={signOut} style={buttonStyle} type="button">
          登出
        </button>
      </div>
    )
  }

  return (
    <div style={chipStyle}>
      <span style={{ opacity: 0.8 }}>跨裝置同步</span>
      <button onClick={signInWithGoogle} style={primaryButtonStyle} type="button">
        以 Google 登入
      </button>
    </div>
  )
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.25rem 0.75rem',
  borderRadius: '999px',
  background: '#f4ead5',
  border: '1px solid #8c6d4a',
  fontSize: '0.85rem',
}

const lightButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontSize: '0.9rem',
  lineHeight: 1,
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid #8c6d4a',
  background: 'transparent',
  padding: '0.15rem 0.5rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.8rem',
}

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#b58900',
  color: '#fff',
  borderColor: '#b58900',
  fontWeight: 600,
}
