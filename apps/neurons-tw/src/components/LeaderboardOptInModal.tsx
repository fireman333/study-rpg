/**
 * LeaderboardOptInModal — one-time opt-in flow gating leaderboard participation.
 *
 * Spec: openspec/specs/neurons-leaderboard/spec.md
 *   "Opt-in modal SHALL gate leaderboard participation with consent checkbox..."
 *   "Nickname SHALL be 2–12 codepoints, case-insensitive unique..."
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRespectsReducedMotion } from '../lib/motion'
import {
  buildLeaderboardPayload,
  checkNicknameAvailable,
  countNicknameCodepoints,
  NICKNAME_MAX_CODEPOINTS,
  NICKNAME_MIN_CODEPOINTS,
  normalizeNicknameForComparison,
  persistLeaderboardProfile,
  pushNeuronsLeaderboardRow,
} from '../lib/services/neurons-leaderboard'
import { NEURON_VARIANT_TOTAL } from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'

interface Props {
  userId: string
  accessToken: string
  fallbackDisplayName?: string
  onClose: () => void
  onOptedIn: () => void
}

type NicknameStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }
  | { kind: 'error'; message: string }

const NICKNAME_DEBOUNCE_MS = 400

export default function LeaderboardOptInModal({
  userId,
  accessToken,
  fallbackDisplayName,
  onClose,
  onOptedIn,
}: Props): JSX.Element {
  const [nickname, setNickname] = useState<string>('')
  const [consent, setConsent] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [nicknameStatus, setNicknameStatus] = useState<NicknameStatus>({ kind: 'idle' })
  const debounceRef = useRef<number | null>(null)
  const reduced = useRespectsReducedMotion()

  const trimmedNickname = nickname.trim()
  const effectiveNickname = trimmedNickname || fallbackDisplayName?.trim() || ''
  const codepointCount = useMemo(() => countNicknameCodepoints(effectiveNickname), [effectiveNickname])

  const lengthValid =
    codepointCount >= NICKNAME_MIN_CODEPOINTS && codepointCount <= NICKNAME_MAX_CODEPOINTS

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (!effectiveNickname) {
      setNicknameStatus({ kind: 'idle' })
      return
    }
    if (!lengthValid) {
      setNicknameStatus({ kind: 'idle' })
      return
    }
    setNicknameStatus({ kind: 'checking' })
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await checkNicknameAvailable(accessToken, effectiveNickname)
        if (res.available) {
          setNicknameStatus({ kind: 'available' })
        } else {
          setNicknameStatus({ kind: 'taken' })
        }
      } catch (err) {
        setNicknameStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }, NICKNAME_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [effectiveNickname, lengthValid, accessToken])

  const canSubmit =
    consent && lengthValid && nicknameStatus.kind === 'available' && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload = await buildLeaderboardPayload(effectiveNickname, true)
      const res = await pushNeuronsLeaderboardRow(accessToken, payload)
      if ('error' in res && res.error) {
        setSubmitError(res.error === 'nickname_taken' ? '暱稱在送出前已被搶走，請改一個' : `送出失敗：${res.error}`)
        setSubmitting(false)
        return
      }
      await persistLeaderboardProfile({
        user_id: userId,
        nickname: effectiveNickname,
        nickname_lower: normalizeNicknameForComparison(effectiveNickname),
        opted_in: true,
        is_public: true,
        dismissed_at: null,
        last_pushed_at: Date.now(),
      })
      onOptedIn()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  const handleDismissForever = async (): Promise<void> => {
    await db.leaderboardProfile.put({
      user_id: userId,
      nickname: '',
      nickname_lower: '',
      opted_in: false,
      is_public: false,
      dismissed_at: Date.now(),
      last_pushed_at: null,
    })
    onClose()
  }

  const overlayInitial = reduced ? { opacity: 0 } : { opacity: 0 }
  const overlayAnimate = { opacity: 1 }
  const overlayExit = { opacity: 0 }
  const cardInitial = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }
  const cardAnimate = reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }
  const cardExit = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }
  const transition = { duration: reduced ? 0.18 : 0.28, ease: 'easeOut' as const }

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="加入排行榜"
        initial={overlayInitial}
        animate={overlayAnimate}
        exit={overlayExit}
        transition={transition}
        style={overlayStyle}
      >
        <motion.div
          initial={cardInitial}
          animate={cardAnimate}
          exit={cardExit}
          transition={transition}
          style={cardStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 style={titleStyle}>加入 neurons-tw 排行榜</h2>
          <p style={leadStyle}>
            勾選同意後，以下五個資料會在排行榜被其他玩家看到：
          </p>
          <ul style={fieldsListStyle}>
            <li>變體收集數量（X / {NEURON_VARIANT_TOTAL}）</li>
            <li>Action Potential 總量</li>
            <li>Strong Synapse 數</li>
            <li>累積唸書時間</li>
            <li>探索進度（settle 次數）</li>
          </ul>

          <label style={consentLabelStyle}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>同意公開以上資訊</span>
          </label>

          <div style={fieldGroupStyle}>
            <label style={fieldLabelStyle}>
              暱稱（2–12 字元，留空使用 Google 顯示名）
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={fallbackDisplayName ?? '輸入暱稱'}
              style={inputStyle}
            />
            <div style={statusLineStyle}>{renderStatus(nicknameStatus, codepointCount, lengthValid, effectiveNickname)}</div>
          </div>

          <button
            type="button"
            onClick={() => setShowPrivacy((v) => !v)}
            style={privacyToggleStyle}
          >
            {showPrivacy ? '— 收合隱私說明' : '+ 了解更多 — 隱私說明'}
          </button>
          {showPrivacy && (
            <div style={privacyBoxStyle}>
              <p>
                本排行榜只儲存以上五個欄位加暱稱，不會收集 email、IP、答題內容、地理位置或裝置資訊。
                資料存放在你本機 IndexedDB 與作者的 Cloudflare D1 資料庫。
              </p>
              <p>
                不想再公開時可隨時在「設定」關掉公開排行榜，資料會從排行榜消失但保留資料庫內紀錄供日後重新公開。
                若要徹底刪除排行榜紀錄，使用「重設帳號」功能。
              </p>
              <p>
                資料為玩家本機記錄、自填無驗證 — 排行榜內容不代表絕對真實。
              </p>
            </div>
          )}

          {submitError && <div style={errorStyle}>{submitError}</div>}

          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={handleDismissForever}
              style={secondaryButtonStyle}
              disabled={submitting}
            >
              不再顯示
            </button>
            <button
              type="button"
              onClick={onClose}
              style={secondaryButtonStyle}
              disabled={submitting}
            >
              下次再說
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              style={canSubmit ? primaryButtonStyle : disabledButtonStyle}
              title={!consent ? '請先勾選同意才能加入' : undefined}
            >
              {submitting ? '送出中…' : '加入排行榜'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function renderStatus(
  status: NicknameStatus,
  codepointCount: number,
  lengthValid: boolean,
  effectiveNickname: string,
): JSX.Element {
  if (!effectiveNickname) {
    return <span style={hintStyle}>留空將以 Google 顯示名為主</span>
  }
  if (!lengthValid) {
    return <span style={errorTextStyle}>暱稱長度需 {NICKNAME_MIN_CODEPOINTS}–{NICKNAME_MAX_CODEPOINTS} 字元（目前 {codepointCount}）</span>
  }
  switch (status.kind) {
    case 'idle':
      return <span style={hintStyle}>{codepointCount} / {NICKNAME_MAX_CODEPOINTS}</span>
    case 'checking':
      return <span style={hintStyle}>檢查中…</span>
    case 'available':
      return <span style={okTextStyle}>✓ 可使用</span>
    case 'taken':
      return <span style={errorTextStyle}>已被使用</span>
    case 'error':
      return <span style={errorTextStyle}>檢查失敗：{status.message}</span>
  }
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
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
  fontSize: '1.15rem',
  fontWeight: 700,
  color: '#5a3f29',
}

const leadStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: '#5a3f29',
}

const fieldsListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: '1.2rem',
  fontSize: '0.8rem',
  color: '#5a3f29',
}

const consentLabelStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'center',
  fontSize: '0.85rem',
  color: '#5a3f29',
  cursor: 'pointer',
  padding: '0.25rem 0',
}

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#5a3f29',
}

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.7rem',
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
  background: '#fff',
  color: '#1a1410',
  fontFamily: 'inherit',
  fontSize: '0.95rem',
}

const statusLineStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  minHeight: '1rem',
}

const hintStyle: React.CSSProperties = {
  color: '#8c6d4a',
}

const okTextStyle: React.CSSProperties = {
  color: '#6a8c3f',
  fontWeight: 600,
}

const errorTextStyle: React.CSSProperties = {
  color: '#c44d4d',
  fontWeight: 600,
}

const privacyToggleStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#268bd2',
  fontSize: '0.8rem',
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
  fontFamily: 'inherit',
}

const privacyBoxStyle: React.CSSProperties = {
  background: '#fdf6e3',
  border: '1px solid #b58900',
  borderRadius: '4px',
  padding: '0.6rem 0.8rem',
  fontSize: '0.78rem',
  color: '#5a3f29',
  lineHeight: 1.5,
}

const errorStyle: React.CSSProperties = {
  color: '#c44d4d',
  fontSize: '0.85rem',
  fontWeight: 600,
}

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  marginTop: '0.3rem',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1.2rem',
  background: '#b58900',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const disabledButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: '#a89773',
  cursor: 'not-allowed',
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'transparent',
  color: '#5a3f29',
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  cursor: 'pointer',
}
