/**
 * ShoutoutBoardPage — 「留言」 tab. Players pick one of their collected neuron
 * families + a short message (≤ 40 graphemes, ≤ 2 lines); all messages bounce
 * DVD-logo style inside a frame. Own card gets a halo; leaderboard composite
 * Top-N gets a special halo. hover/tap pauses motion; prefers-reduced-motion
 * falls back to a static grid; mobile-safe (O(n) wall-bounce, no pairwise).
 *
 * Spec: openspec/specs/neurons-shoutout-board/spec.md
 * Backend: cloudflare/sync-worker/src/shoutout.ts (via lib/services/shoutout.ts)
 *
 * Identity: the bouncing card's name is the SERVER-joined leaderboard nickname;
 * the client never sends a name. Posting requires login + a leaderboard nickname.
 * Free text (the message) is the only UGC field; rendered as React text (never HTML).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import type { ContentPack } from '@study-rpg/core'
import { validateShoutoutMessage, MESSAGE_MAX_GRAPHEMES, graphemeLen } from '@study-rpg/core'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import { useAuth } from '../lib/auth/AuthContext'
import { db } from '../lib/db'
import { computeOwnedSlotCountByFamily } from '../lib/services/variant-ownership'
import { getLeaderboardProfile } from '../lib/services/neurons-leaderboard'
import {
  fetchShoutoutBoard,
  postShoutout,
  deleteShoutout,
  reportShoutout,
  type ShoutoutMessage,
} from '../lib/services/shoutout'

const SPRITE_MAP = THEME_PIXEL_NEURONS.sprites
const DISCLAIMER_ACK_KEY = 'neurons.shoutout.disclaimerAcked'
const FRAME_HEIGHT = 440
const CARD_W = 168
const CARD_H = 76

interface OwnedFamily {
  id: string
  displayName: string
  color: string
}

function familySpriteUrl(familyId: string): string {
  return SPRITE_MAP[`subject:${familyId}`] ?? ''
}

function errorMessage(error: string, retryAfterMs?: number): string {
  switch (error) {
    case 'cooldown':
      return `5 分鐘只能更新一次，再等 ${Math.ceil((retryAfterMs ?? 0) / 1000)} 秒`
    case 'daily_cap':
      return '今天更新次數已達上限，明天再來'
    case 'nickname_required':
      return '要先設定排行榜暱稱才能留言'
    case 'invalid_avatar':
      return '頭像資料有誤，請重新選一隻神經元'
    case 'blocked_content':
      return '留言含不適當字詞，請修改'
    case 'pii_detected':
      return '請勿留下電話／email／身分證等個資'
    case 'too_long':
      return `最多 ${MESSAGE_MAX_GRAPHEMES} 字`
    case 'too_many_lines':
      return '最多兩行'
    case 'banned':
      return '此帳號已被限制留言'
    default:
      return '送出失敗，請稍後再試'
  }
}

export default function ShoutoutBoardPage({ pack }: { pack: ContentPack }): JSX.Element {
  const { session, user, signInWithGoogle } = useAuth()
  const accessToken = session?.access_token ?? null
  const userId = user?.id ?? null
  const reduced = useReducedMotion()

  const [board, setBoard] = useState<ShoutoutMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [nickname, setNickname] = useState<string | null>(null)
  const [ownedFamilies, setOwnedFamilies] = useState<OwnedFamily[]>([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const mine = userId ? board.find((m) => m.authorKey === userId) ?? null : null

  const refreshBoard = useCallback(async () => {
    try {
      const data = await fetchShoutoutBoard()
      setBoard(data.messages)
    } catch {
      setToast('留言板載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshBoard()
  }, [refreshBoard])

  // Load the player's nickname (post gate) + owned families (avatar picker).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (userId) {
        const profile = await getLeaderboardProfile(userId)
        if (!cancelled) setNickname(profile?.nickname ?? null)
      } else {
        setNickname(null)
      }
      const [variants, instances] = await Promise.all([
        db.neuronVariants.toArray(),
        db.neuronInstances.toArray(),
      ])
      const byFamily = computeOwnedSlotCountByFamily(variants, instances)
      const owned = pack.subjects
        .filter((s) => (byFamily.get(s.id) ?? 0) > 0)
        .map((s) => ({ id: s.id, displayName: s.displayName, color: s.color ?? '#8c6d4a' }))
      if (!cancelled) setOwnedFamilies(owned)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, pack.subjects])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // Self-update from a write response (don't wait for the 30s list cache).
  const applyMine = useCallback((msg: ShoutoutMessage) => {
    setBoard((prev) => {
      const without = prev.filter((m) => m.authorKey !== msg.authorKey)
      return [msg, ...without]
    })
  }, [])

  const handleReport = useCallback(
    async (authorKey: string) => {
      setReportTarget(null)
      if (!accessToken) {
        setToast('要先登入才能檢舉')
        return
      }
      const res = await reportShoutout(accessToken, authorKey)
      if (res.ok) {
        if (res.hidden) setBoard((prev) => prev.filter((m) => m.authorKey !== authorKey))
        setToast('已收到檢舉，謝謝')
      } else {
        setToast('檢舉失敗')
      }
    },
    [accessToken],
  )

  const handleDelete = useCallback(async () => {
    if (!accessToken || !userId) return
    await deleteShoutout(accessToken)
    setBoard((prev) => prev.filter((m) => m.authorKey !== userId))
    setComposeOpen(false)
    setToast('已刪除你的留言')
  }, [accessToken, userId])

  return (
    <section aria-label="留言板">
      <header style={pageHeaderStyle}>
        <div>
          <h2 style={titleStyle}>💬 留言板</h2>
          <p style={subtitleStyle}>選一隻你的神經元 + 一句話，互相加油打氣（最新 40 則）</p>
        </div>
        <button type="button" style={composeBtnStyle} onClick={() => setComposeOpen(true)}>
          {mine ? '✏️ 編輯我的留言' : '➕ 我要留言'}
        </button>
      </header>

      {loading ? (
        <p style={hintStyle}>載入留言中…</p>
      ) : board.length === 0 ? (
        <div style={emptyStyle}>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>還沒有人留言 🫧</p>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#8c6d4a' }}>
            當第一個替大家加油的人吧！
          </p>
        </div>
      ) : reduced ? (
        <StaticGrid board={board} userId={userId} onReport={setReportTarget} />
      ) : (
        <BounceFrame board={board} userId={userId} onReport={setReportTarget} />
      )}

      <p style={disclaimerFooterStyle}>留言內容由使用者自行負責；不當內容可檢舉，站方保留刪除權。</p>

      {composeOpen && (
        <ComposeModal
          accessToken={accessToken}
          isSignedIn={!!userId}
          nickname={nickname}
          ownedFamilies={ownedFamilies}
          existing={mine}
          onSignIn={signInWithGoogle}
          onClose={() => setComposeOpen(false)}
          onPosted={(msg) => {
            applyMine(msg)
            setComposeOpen(false)
            setToast('留言已送出！')
          }}
          onDelete={mine ? handleDelete : undefined}
          onError={(m) => setToast(m)}
        />
      )}

      {reportTarget !== null && (
        <ReportConfirmModal
          message={board.find((m) => m.authorKey === reportTarget) ?? null}
          onCancel={() => setReportTarget(null)}
          onConfirm={() => void handleReport(reportTarget)}
        />
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
    </section>
  )
}

// ─── Report confirmation modal ───────────────────────────────────────────────

function ReportConfirmModal({
  message,
  onCancel,
  onConfirm,
}: {
  message: ShoutoutMessage | null
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <div style={overlayStyle} onClick={onCancel} role="presentation">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label="檢舉留言確認">
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>檢舉這則留言？</h3>
        {message && <div style={reportPreviewStyle}>「{message.message}」</div>}
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.82rem', color: '#8c6d4a' }}>
          檢舉後站方會收到通知；多次檢舉的留言會自動隱藏。
        </p>
        <div style={modalActionsStyle}>
          <span style={{ flex: 1 }} />
          <button type="button" style={secondaryBtnStyle} onClick={onCancel}>
            取消
          </button>
          <button type="button" style={dangerBtnStyle} onClick={onConfirm}>
            確定檢舉
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Bounce frame (DVD-logo) ────────────────────────────────────────────────

interface Pos {
  x: number
  y: number
  vx: number
  vy: number
}

function BounceFrame({
  board,
  userId,
  onReport,
}: {
  board: ShoutoutMessage[]
  userId: string | null
  onReport: (authorKey: string) => void
}): JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<Map<string, Pos>>(new Map())
  const elsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const pausedRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  // Seed/refresh positions when the board membership changes (preserve existing).
  useEffect(() => {
    const frame = frameRef.current
    const w = frame?.clientWidth ?? 320
    const next = new Map<string, Pos>()
    const ids = board.map((m) => m.authorKey)
    ids.forEach((id, i) => {
      const prev = posRef.current.get(id)
      if (prev) {
        next.set(id, prev)
      } else {
        // Deterministic-ish initial scatter (overlap-avoidance via spacing).
        const cols = Math.max(1, Math.floor(w / (CARD_W + 8)))
        const col = i % cols
        const rowI = Math.floor(i / cols)
        const speed = 0.35
        next.set(id, {
          x: 6 + col * (CARD_W + 8),
          y: 6 + (rowI % 4) * (CARD_H + 8),
          vx: (i % 2 === 0 ? 1 : -1) * speed * (0.7 + (i % 3) * 0.2),
          vy: (i % 3 === 0 ? 1 : -1) * speed * (0.7 + (i % 2) * 0.25),
        })
      }
    })
    posRef.current = next
  }, [board])

  useEffect(() => {
    let last = 0
    const step = (t: number): void => {
      rafRef.current = requestAnimationFrame(step)
      const frame = frameRef.current
      if (!frame) return
      const dt = last === 0 ? 16 : Math.min(48, t - last)
      last = t
      if (pausedRef.current) return
      const w = frame.clientWidth
      const h = FRAME_HEIGHT
      // O(n) wall-bounce only — no pairwise collision (mobile-safe per spec).
      for (const [id, p] of posRef.current) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        if (p.x <= 0) {
          p.x = 0
          p.vx = Math.abs(p.vx)
        } else if (p.x >= w - CARD_W) {
          p.x = w - CARD_W
          p.vx = -Math.abs(p.vx)
        }
        if (p.y <= 0) {
          p.y = 0
          p.vy = Math.abs(p.vy)
        } else if (p.y >= h - CARD_H) {
          p.y = h - CARD_H
          p.vy = -Math.abs(p.vy)
        }
        const el = elsRef.current.get(id)
        if (el) el.style.transform = `translate(${p.x}px, ${p.y}px)`
      }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      ref={frameRef}
      style={{ ...frameStyle, height: FRAME_HEIGHT }}
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
    >
      {board.map((m) => (
        <div
          key={m.authorKey}
          ref={(el) => {
            if (el) elsRef.current.set(m.authorKey, el)
            else elsRef.current.delete(m.authorKey)
          }}
          style={floatingCardWrapStyle}
          onTouchStart={() => (pausedRef.current = true)}
          onTouchEnd={() => (pausedRef.current = false)}
        >
          <ShoutoutCard m={m} isSelf={m.authorKey === userId} onReport={onReport} />
        </div>
      ))}
    </div>
  )
}

function StaticGrid({
  board,
  userId,
  onReport,
}: {
  board: ShoutoutMessage[]
  userId: string | null
  onReport: (authorKey: string) => void
}): JSX.Element {
  return (
    <div style={staticGridStyle}>
      {board.map((m) => (
        <div key={m.authorKey} style={{ position: 'relative' }}>
          <ShoutoutCard m={m} isSelf={m.authorKey === userId} onReport={onReport} />
        </div>
      ))}
    </div>
  )
}

// ─── Card ───────────────────────────────────────────────────────────────────

function ShoutoutCard({
  m,
  isSelf,
  onReport,
}: {
  m: ShoutoutMessage
  isSelf: boolean
  onReport: (authorKey: string) => void
}): JSX.Element {
  const url = familySpriteUrl(m.avatar.assetId)
  const halo = isSelf ? selfHaloStyle : m.isTopN ? topHaloStyle : undefined
  return (
    <article style={{ ...cardStyle, ...(halo ?? {}) }} title={`${m.nickname}`}>
      <div style={cardSpriteFrameStyle}>
        {url ? (
          <img src={url} alt="" width={36} height={36} style={{ imageRendering: 'pixelated' }} />
        ) : (
          <span aria-hidden style={{ fontSize: 20 }}>🧬</span>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={cardNameRowStyle}>
          {m.isTopN && <span title="排行榜前段班" aria-label="排行榜前段班">👑</span>}
          <span style={cardNameStyle}>{m.nickname}</span>
          {isSelf && <span style={selfTagStyle}>我</span>}
        </div>
        {/* React renders this as text — never HTML. */}
        <div style={cardMsgStyle}>{m.message}</div>
      </div>
      {!isSelf && (
        <button
          type="button"
          style={reportBtnStyle}
          title="檢舉這則留言"
          aria-label="檢舉這則留言"
          onClick={() => onReport(m.authorKey)}
        >
          ⚐
        </button>
      )}
    </article>
  )
}

// ─── Compose / edit modal ────────────────────────────────────────────────────

function ComposeModal({
  accessToken,
  isSignedIn,
  nickname,
  ownedFamilies,
  existing,
  onSignIn,
  onClose,
  onPosted,
  onDelete,
  onError,
}: {
  accessToken: string | null
  isSignedIn: boolean
  nickname: string | null
  ownedFamilies: OwnedFamily[]
  existing: ShoutoutMessage | null
  onSignIn: () => void
  onClose: () => void
  onPosted: (msg: ShoutoutMessage) => void
  onDelete?: () => void
  onError: (msg: string) => void
}): JSX.Element {
  const [familyId, setFamilyId] = useState<string>(existing?.avatar.assetId ?? ownedFamilies[0]?.id ?? '')
  const [text, setText] = useState<string>(existing?.message ?? '')
  const [acked, setAcked] = useState<boolean>(() => localStorage.getItem(DISCLAIMER_ACK_KEY) === '1')
  const [submitting, setSubmitting] = useState(false)

  const len = graphemeLen(text.replace(/\n/g, ''))
  const validation = validateShoutoutMessage(text)
  const canSubmit = !!accessToken && !!nickname && !!familyId && validation.ok && acked && !submitting

  const submit = async (): Promise<void> => {
    if (!accessToken || !canSubmit) return
    setSubmitting(true)
    const res = await postShoutout(accessToken, {
      avatar: { avatarType: 'neuron', assetId: familyId },
      message: text,
    })
    setSubmitting(false)
    if (res.ok) {
      if (res.message) onPosted(res.message)
      else onClose()
    } else {
      onError(errorMessage(res.error, res.retryAfterMs))
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose} role="presentation">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="撰寫留言">
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>{existing ? '編輯留言' : '撰寫留言'}</h3>

        {!isSignedIn ? (
          <div style={gateStyle}>
            <p style={{ margin: '0 0 0.6rem' }}>要登入才能留言。</p>
            <button type="button" style={primaryBtnStyle} onClick={onSignIn}>
              使用 Google 登入
            </button>
          </div>
        ) : !nickname ? (
          <div style={gateStyle}>
            <p style={{ margin: '0 0 0.6rem' }}>留言會顯示你的排行榜暱稱，請先到排行榜設定暱稱。</p>
            <Link to="/leaderboard" style={primaryBtnStyle} onClick={onClose}>
              前往排行榜設定暱稱
            </Link>
          </div>
        ) : ownedFamilies.length === 0 ? (
          <div style={gateStyle}>
            <p style={{ margin: 0 }}>你還沒收集到任何神經元變體 — 先去答題收集一隻吧！</p>
          </div>
        ) : (
          <>
            <label style={fieldLabelStyle}>選一隻你的神經元</label>
            <div style={familyPickerStyle}>
              {ownedFamilies.map((f) => {
                const url = familySpriteUrl(f.id)
                const selected = f.id === familyId
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFamilyId(f.id)}
                    title={f.displayName}
                    style={{
                      ...familyChoiceStyle,
                      borderColor: selected ? f.color : '#d3c4a4',
                      background: selected ? '#fdf6e3' : '#fff',
                      boxShadow: selected ? `0 0 0 2px ${f.color}` : 'none',
                    }}
                  >
                    {url ? (
                      <img src={url} alt="" width={32} height={32} style={{ imageRendering: 'pixelated' }} />
                    ) : (
                      <span aria-hidden>🧬</span>
                    )}
                    <span style={familyChoiceNameStyle}>{f.id}</span>
                  </button>
                )
              })}
            </div>

            <label style={fieldLabelStyle}>
              留言（{len}/{MESSAGE_MAX_GRAPHEMES} 字 · 最多兩行）
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={120}
              placeholder="例：一階加油，一起上岸！"
              style={textareaStyle}
            />
            {!validation.ok && text.trim().length > 0 && (
              <p style={validationHintStyle}>{validationHint(validation.reason)}</p>
            )}

            {!acked && (
              <label style={ackRowStyle}>
                <input
                  type="checkbox"
                  checked={acked}
                  onChange={(e) => {
                    setAcked(e.target.checked)
                    if (e.target.checked) localStorage.setItem(DISCLAIMER_ACK_KEY, '1')
                  }}
                />
                <span>我了解留言內容由我自行負責，不會張貼個資或不當內容。</span>
              </label>
            )}

            <div style={modalActionsStyle}>
              {onDelete && (
                <button type="button" style={dangerBtnStyle} onClick={onDelete}>
                  刪除
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" style={secondaryBtnStyle} onClick={onClose}>
                取消
              </button>
              <button type="button" style={canSubmit ? primaryBtnStyle : disabledBtnStyle} disabled={!canSubmit} onClick={submit}>
                {submitting ? '送出中…' : existing ? '更新' : '送出'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function validationHint(reason?: string): string {
  switch (reason) {
    case 'too_long':
      return `最多 ${MESSAGE_MAX_GRAPHEMES} 字`
    case 'too_many_lines':
      return '最多兩行'
    case 'blocked':
      return '含不適當字詞，請修改'
    case 'pii':
      return '請勿留下電話／email／身分證等個資'
    case 'invalid_chars':
      return '含不支援的控制字元'
    default:
      return '請輸入留言'
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pageHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '0.75rem',
  flexWrap: 'wrap',
  marginBottom: '0.75rem',
}
const titleStyle: React.CSSProperties = { margin: 0, fontSize: '1.15rem', color: '#3a2a1a' }
const subtitleStyle: React.CSSProperties = { margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#8c6d4a' }
const composeBtnStyle: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  background: '#d4a04d',
  color: '#fff',
  border: '2px solid #b8893a',
  borderRadius: '6px',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
const hintStyle: React.CSSProperties = { color: '#8c6d4a', fontSize: '0.9rem' }
const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '2.5rem 1rem',
  background: '#f4ecd8',
  border: '2px dashed #c4a878',
  borderRadius: '8px',
}
const frameStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  background: 'radial-gradient(circle at 50% 40%, #fffdf6 0%, #f0e6cf 100%)',
  border: '2px solid #8c6d4a',
  borderRadius: '8px',
  overflow: 'hidden',
}
const floatingCardWrapStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: CARD_W,
  willChange: 'transform',
}
const staticGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: '0.5rem',
}
const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  width: CARD_W,
  minHeight: CARD_H,
  boxSizing: 'border-box',
  padding: '0.35rem 0.45rem',
  background: '#fff',
  border: '2px solid #c4a878',
  borderRadius: '8px',
  boxShadow: '0 1px 3px rgba(58,42,26,0.15)',
}
const selfHaloStyle: React.CSSProperties = {
  border: '2px solid #2f8f5b',
  boxShadow: '0 0 0 3px rgba(47,143,91,0.35)',
}
const topHaloStyle: React.CSSProperties = {
  border: '2px solid #d4a04d',
  boxShadow: '0 0 0 3px rgba(212,160,77,0.5), 0 0 12px rgba(212,160,77,0.5)',
}
const cardSpriteFrameStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#fdf6e3',
  borderRadius: '4px',
}
const cardNameRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: '#5a3f29',
}
const cardNameStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 90,
}
const selfTagStyle: React.CSSProperties = {
  fontSize: '0.6rem',
  background: '#2f8f5b',
  color: '#fff',
  borderRadius: '3px',
  padding: '0 0.25rem',
}
const cardMsgStyle: React.CSSProperties = {
  fontSize: '0.74rem',
  color: '#3a2a1a',
  lineHeight: 1.2,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-word',
}
const reportBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  alignSelf: 'flex-start',
  background: 'transparent',
  border: 'none',
  color: '#c4a878',
  cursor: 'pointer',
  fontSize: '0.8rem',
  padding: 0,
  lineHeight: 1,
}
const reportPreviewStyle: React.CSSProperties = {
  marginTop: '0.4rem',
  padding: '0.5rem 0.7rem',
  background: '#faf3e3',
  border: '1px solid #e4d6b4',
  borderRadius: '8px',
  fontSize: '0.85rem',
  color: '#3a2a1a',
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
}
const disclaimerFooterStyle: React.CSSProperties = {
  marginTop: '0.6rem',
  fontSize: '0.7rem',
  color: '#a0855f',
  textAlign: 'center',
}
const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '1.25rem',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#3a2a1a',
  color: '#fff',
  padding: '0.5rem 1rem',
  borderRadius: '999px',
  fontSize: '0.82rem',
  zIndex: 60,
  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
}
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(30,20,10,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 70,
  padding: '1rem',
}
const modalStyle: React.CSSProperties = {
  width: 'min(440px, 100%)',
  background: '#fdf6e3',
  border: '2px solid #8c6d4a',
  borderRadius: '10px',
  padding: '1rem 1.1rem 1.1rem',
  maxHeight: '90vh',
  overflowY: 'auto',
}
const gateStyle: React.CSSProperties = { fontSize: '0.86rem', color: '#5a3f29' }
const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#5a3f29',
  margin: '0.7rem 0 0.35rem',
}
const familyPickerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
  maxHeight: 150,
  overflowY: 'auto',
}
const familyChoiceStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.1rem',
  padding: '0.35rem 0.4rem',
  border: '2px solid #d3c4a4',
  borderRadius: '6px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minWidth: 56,
}
const familyChoiceNameStyle: React.CSSProperties = {
  fontSize: '0.6rem',
  color: '#5a3f29',
  maxWidth: 52,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const textareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  resize: 'none',
  padding: '0.5rem',
  border: '1.5px solid #c4a878',
  borderRadius: '6px',
  fontFamily: 'inherit',
  fontSize: '0.88rem',
  background: '#fff',
}
const validationHintStyle: React.CSSProperties = { margin: '0.3rem 0 0', fontSize: '0.74rem', color: '#c44d4d' }
const ackRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.4rem',
  margin: '0.7rem 0 0',
  fontSize: '0.74rem',
  color: '#5a3f29',
  lineHeight: 1.35,
}
const modalActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginTop: '0.9rem',
}
const primaryBtnStyle: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  background: '#d4a04d',
  color: '#fff',
  border: '2px solid #b8893a',
  borderRadius: '6px',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-block',
}
const disabledBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: '#e0d3b4',
  border: '2px solid #d3c4a4',
  color: '#a89074',
  cursor: 'not-allowed',
}
const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.45rem 0.8rem',
  background: '#fff',
  color: '#5a3f29',
  border: '2px solid #c4a878',
  borderRadius: '6px',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const dangerBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  color: '#c44d4d',
  borderColor: '#e0b0b0',
}
