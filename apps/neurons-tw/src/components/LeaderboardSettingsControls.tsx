/**
 * LeaderboardSettingsControls — opt-out toggle, nickname edit, manual push.
 *
 * Manual push button is the interim push trigger before add-neurons-deploy
 * wires cloud sync. Disabled for 3 seconds after click to prevent rate-storm.
 *
 * Spec: openspec/specs/neurons-leaderboard/spec.md
 *   "Opt-out toggle SHALL hide row from snapshots without deleting D1 row"
 *   "Push leaderboard row SHALL be triggered on cloud sync when wired (deferred),
 *    with manual-push button as interim"
 */

import { useEffect, useState } from 'react'
import {
  buildLeaderboardPayload,
  checkNicknameAvailable,
  countNicknameCodepoints,
  NICKNAME_MAX_CODEPOINTS,
  NICKNAME_MIN_CODEPOINTS,
  normalizeNicknameForComparison,
  optOutLeaderboard,
  persistLeaderboardProfile,
  pushNeuronsLeaderboardRow,
} from '../lib/services/neurons-leaderboard'
import { db, type LeaderboardProfileRow } from '../lib/db'

interface Props {
  userId: string
  accessToken: string
}

const MANUAL_PUSH_COOLDOWN_MS = 3000

export default function LeaderboardSettingsControls({ userId, accessToken }: Props): JSX.Element {
  const [profile, setProfile] = useState<LeaderboardProfileRow | null>(null)
  const [editingNickname, setEditingNickname] = useState(false)
  const [draftNickname, setDraftNickname] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pushCooldownUntil, setPushCooldownUntil] = useState<number>(0)
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    let cancelled = false
    const refresh = async (): Promise<void> => {
      const row = await db.leaderboardProfile.get(userId)
      if (!cancelled) setProfile(row ?? null)
    }
    void refresh()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Tick `now` once per second when cooldown is active so the disabled
  // button auto-releases without forcing a manual re-render.
  useEffect(() => {
    if (pushCooldownUntil <= now) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [pushCooldownUntil, now])

  if (!profile || !profile.opted_in) {
    return (
      <div style={containerStyle}>
        <p style={mutedStyle}>未加入排行榜。前往「排名」分頁加入。</p>
      </div>
    )
  }

  const toggleIsPublic = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      if (profile.is_public) {
        await optOutLeaderboard(accessToken, userId)
        const updated = await db.leaderboardProfile.get(userId)
        setProfile(updated ?? null)
      } else {
        // Re-enabling — push fresh payload with is_public=1
        const payload = await buildLeaderboardPayload(profile.nickname, true)
        await pushNeuronsLeaderboardRow(accessToken, payload)
        await persistLeaderboardProfile({
          ...profile,
          is_public: true,
          last_pushed_at: Date.now(),
        })
        const updated = await db.leaderboardProfile.get(userId)
        setProfile(updated ?? null)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleManualPush = async (): Promise<void> => {
    if (busy || now < pushCooldownUntil) return
    setBusy(true)
    try {
      const payload = await buildLeaderboardPayload(profile.nickname, profile.is_public)
      await pushNeuronsLeaderboardRow(accessToken, payload)
      await persistLeaderboardProfile({
        ...profile,
        last_pushed_at: Date.now(),
      })
      const updated = await db.leaderboardProfile.get(userId)
      setProfile(updated ?? null)
      setPushCooldownUntil(Date.now() + MANUAL_PUSH_COOLDOWN_MS)
    } finally {
      setBusy(false)
    }
  }

  const startEditNickname = (): void => {
    setDraftNickname(profile.nickname)
    setDraftError(null)
    setEditingNickname(true)
  }

  const saveNickname = async (): Promise<void> => {
    const trimmed = draftNickname.trim()
    const cp = countNicknameCodepoints(trimmed)
    if (cp < NICKNAME_MIN_CODEPOINTS || cp > NICKNAME_MAX_CODEPOINTS) {
      setDraftError(`暱稱長度需 ${NICKNAME_MIN_CODEPOINTS}–${NICKNAME_MAX_CODEPOINTS} 字元`)
      return
    }
    setBusy(true)
    try {
      const check = await checkNicknameAvailable(accessToken, trimmed)
      if (!check.available && normalizeNicknameForComparison(trimmed) !== profile.nickname_lower) {
        setDraftError('已被使用')
        return
      }
      const payload = await buildLeaderboardPayload(trimmed, profile.is_public)
      const res = await pushNeuronsLeaderboardRow(accessToken, payload)
      if ('error' in res && res.error) {
        setDraftError(res.error === 'nickname_taken' ? '送出前被搶走' : `送出失敗：${res.error}`)
        return
      }
      await persistLeaderboardProfile({
        ...profile,
        nickname: trimmed,
        nickname_lower: normalizeNicknameForComparison(trimmed),
        last_pushed_at: Date.now(),
      })
      const updated = await db.leaderboardProfile.get(userId)
      setProfile(updated ?? null)
      setEditingNickname(false)
      setDraftError(null)
    } finally {
      setBusy(false)
    }
  }

  const cooldownActive = now < pushCooldownUntil
  const cooldownSecondsRemaining = cooldownActive
    ? Math.ceil((pushCooldownUntil - now) / 1000)
    : 0

  return (
    <div style={containerStyle}>
      <h3 style={sectionTitleStyle}>排行榜設定</h3>

      <div style={rowStyle}>
        <span style={labelStyle}>暱稱</span>
        {editingNickname ? (
          <div style={editGroupStyle}>
            <input
              type="text"
              value={draftNickname}
              onChange={(e) => setDraftNickname(e.target.value)}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => void saveNickname()}
              disabled={busy}
              style={smallPrimaryButtonStyle}
            >
              儲存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingNickname(false)
                setDraftError(null)
              }}
              disabled={busy}
              style={smallSecondaryButtonStyle}
            >
              取消
            </button>
          </div>
        ) : (
          <div style={editGroupStyle}>
            <span style={valueStyle}>{profile.nickname}</span>
            <button
              type="button"
              onClick={startEditNickname}
              disabled={busy}
              style={smallSecondaryButtonStyle}
            >
              編輯
            </button>
          </div>
        )}
      </div>
      {draftError && <div style={errorTextStyle}>{draftError}</div>}

      <div style={rowStyle}>
        <span style={labelStyle}>公開到排行榜</span>
        <label style={toggleLabelStyle}>
          <input
            type="checkbox"
            checked={profile.is_public}
            onChange={() => void toggleIsPublic()}
            disabled={busy}
          />
          <span>{profile.is_public ? '公開中' : '已隱藏'}</span>
        </label>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>稱號</span>
        <TitleSelector
          profile={profile}
          onChange={async (newTitle) => {
            await db.leaderboardProfile.update(profile.user_id, { selectedTitle: newTitle })
            const updated = await db.leaderboardProfile.get(userId)
            setProfile(updated ?? null)
          }}
        />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>最後上傳</span>
        <span style={valueStyle}>
          {profile.last_pushed_at
            ? new Date(profile.last_pushed_at).toLocaleString('zh-TW')
            : '從未'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => void handleManualPush()}
        disabled={busy || cooldownActive}
        style={busy || cooldownActive ? disabledButtonStyle : primaryButtonStyle}
      >
        {cooldownActive ? `${cooldownSecondsRemaining} 秒後可再按` : '立即更新排行榜'}
      </button>
      <p style={mutedSmallStyle}>
        手動上傳是雲端同步未接前的暫時做法。日後 add-neurons-deploy 接上 cloud sync 後將自動推送。
      </p>
    </div>
  )
}

/**
 * Title selector — dropdown over `profile.unlockedTitles`. Title rewards from
 * achievement unlocks populate this list via the reward dispatcher. Per
 * neurons-achievements spec Req "Title reward updates unlocked titles list".
 */
function TitleSelector({
  profile,
  onChange,
}: {
  profile: LeaderboardProfileRow
  onChange: (value: string | null) => Promise<void>
}): JSX.Element {
  const titles = profile.unlockedTitles ?? []
  if (titles.length === 0) {
    return <span style={{ ...mutedSmallStyle, fontStyle: 'normal' }}>尚無稱號 — 解鎖成就以取得</span>
  }
  return (
    <select
      value={profile.selectedTitle ?? ''}
      onChange={(e) => void onChange(e.target.value === '' ? null : e.target.value)}
      style={{
        fontFamily: 'var(--font-pixel-cjk)',
        fontSize: '0.85rem',
        padding: '0.2rem 0.4rem',
        background: '#f4ecd8',
        border: '1px solid #8c6d4a',
        color: '#1a1410',
      }}
    >
      <option value="">（無）</option>
      {titles.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  )
}

const containerStyle: React.CSSProperties = {
  background: '#fdf6e3',
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
  padding: '0.85rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  color: '#5a3f29',
  fontFamily: 'var(--font-pixel-cjk)',
}

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#5a3f29',
  borderBottom: '1px solid #c4a878',
  paddingBottom: '0.3rem',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
  fontSize: '0.85rem',
}

const labelStyle: React.CSSProperties = {
  fontWeight: 600,
  minWidth: '7rem',
}

const valueStyle: React.CSSProperties = {
  color: '#1a1410',
}

const mutedStyle: React.CSSProperties = {
  margin: 0,
  color: '#8c6d4a',
  fontSize: '0.85rem',
}

const mutedSmallStyle: React.CSSProperties = {
  margin: 0,
  color: '#8c6d4a',
  fontSize: '0.7rem',
  fontStyle: 'italic',
}

const editGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.4rem',
  alignItems: 'center',
}

const inputStyle: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
  background: '#fff',
  color: '#1a1410',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
}

const toggleLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: '0.4rem',
  alignItems: 'center',
  fontSize: '0.85rem',
  cursor: 'pointer',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#b58900',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const disabledButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: '#a89773',
  cursor: 'not-allowed',
}

const smallPrimaryButtonStyle: React.CSSProperties = {
  padding: '0.3rem 0.7rem',
  background: '#b58900',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const smallSecondaryButtonStyle: React.CSSProperties = {
  padding: '0.3rem 0.7rem',
  background: 'transparent',
  color: '#5a3f29',
  border: '1.5px solid #8c6d4a',
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontSize: '0.8rem',
  cursor: 'pointer',
}

const errorTextStyle: React.CSSProperties = {
  color: '#c44d4d',
  fontSize: '0.8rem',
  fontWeight: 600,
}
