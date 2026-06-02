/**
 * ShareCardModal — preview + export the player's neurons character card
 * (add-neurons-og-share). Opened from the /collection page.
 *
 * On open: build payload from local Dexie state → preload sprites/font →
 * render to a full-res (1080×1350) canvas shown scaled. Buttons download the
 * PNG (always) and share it via the Web Share sheet (only where supported).
 * Loading / error / export-result states are surfaced — never silently dropped.
 *
 * Capability spec: openspec/specs/neurons-character-card/spec.md
 */

import { useEffect, useRef, useState } from 'react'
import { buildCharacterCardPayload } from '../lib/services/character-card'
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  loadCardAssets,
  renderCharacterCard,
} from '../lib/character-card-render'
import {
  canShareCardFile,
  downloadCardPng,
  shareCardPng,
} from '../lib/character-card-export'

type Status = 'loading' | 'ready' | 'error'

interface Props {
  open: boolean
  onClose: () => void
  userId?: string | null
}

export default function ShareCardModal({ open, onClose, userId }: Props): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const canShare = canShareCardFile()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStatus('loading')
    setError(null)
    setHint(null)
    void (async () => {
      try {
        const payload = await buildCharacterCardPayload(userId)
        const assets = await loadCardAssets(payload)
        if (cancelled) return
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = CARD_WIDTH
        canvas.height = CARD_HEIGHT
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('此瀏覽器不支援 canvas 2D')
        renderCharacterCard(ctx, payload, assets)
        if (!cancelled) setStatus('ready')
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, userId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const runExport = async (fn: () => Promise<string | void>, label: string): Promise<void> => {
    setBusy(true)
    setHint(null)
    try {
      const res = await fn()
      setHint(res === 'cancelled' ? '已取消分享' : `${label}完成`)
    } catch (err) {
      setHint(`${label}失敗：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleDownload = (): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    void runExport(() => downloadCardPng(canvas), '下載')
  }

  const handleShare = (): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    void runExport(
      () => shareCardPng(canvas, { title: '我的神經元角色卡', text: '神經元 RPG · LTP' }),
      '分享',
    )
  }

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="分享角色卡"
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={titleStyle}>分享角色卡</h2>
        <div style={previewWrapStyle}>
          <canvas ref={canvasRef} style={canvasStyle} aria-label="角色卡預覽" />
          {status === 'loading' && <div style={stateOverlayStyle}>產生角色卡中…</div>}
          {status === 'error' && (
            <div style={{ ...stateOverlayStyle, color: '#c44d4d' }}>產生失敗：{error}</div>
          )}
        </div>
        {hint && <p style={hintStyle}>{hint}</p>}
        <div style={btnRowStyle}>
          <button
            type="button"
            style={primaryBtnStyle}
            disabled={status !== 'ready' || busy}
            onClick={handleDownload}
          >
            下載 PNG
          </button>
          {canShare && (
            <button
              type="button"
              style={secondaryBtnStyle}
              disabled={status !== 'ready' || busy}
              onClick={handleShare}
            >
              分享…
            </button>
          )}
          <button type="button" style={closeBtnStyle} onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(26, 20, 16, 0.66)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
}

const modalStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '4px solid #5a3f29',
  borderRadius: '10px',
  padding: '1.1rem 1.2rem 1.3rem',
  maxWidth: '420px',
  width: '100%',
  maxHeight: '92vh',
  overflowY: 'auto',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
  color: '#3a2a1a',
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
}

const titleStyle: React.CSSProperties = {
  margin: '0 0 0.8rem',
  fontSize: '1.2rem',
  color: '#5a3e1a',
  letterSpacing: '0.06em',
  textAlign: 'center',
}

const previewWrapStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  justifyContent: 'center',
  minHeight: '180px',
}

const canvasStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '320px',
  height: 'auto',
  imageRendering: 'pixelated',
  border: '2px solid #c9b48f',
  borderRadius: '6px',
  background: '#f4ecd8',
}

const stateOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '0 1rem',
  fontSize: '0.9rem',
  color: '#8c6d4a',
  background: 'rgba(244, 236, 216, 0.85)',
  borderRadius: '6px',
}

const hintStyle: React.CSSProperties = {
  margin: '0.7rem 0 0',
  fontSize: '0.8rem',
  color: '#8c6d4a',
  textAlign: 'center',
}

const btnRowStyle: React.CSSProperties = {
  marginTop: '1rem',
  display: 'flex',
  gap: '0.5rem',
  justifyContent: 'center',
  flexWrap: 'wrap',
}

const baseBtnStyle: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  fontWeight: 700,
  padding: '0.5rem 1rem',
  borderRadius: '6px',
  cursor: 'pointer',
  border: '2px solid',
}

const primaryBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  background: '#d4a04d',
  borderColor: '#b8893a',
  color: '#fff',
}

const secondaryBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  background: '#fdf6e3',
  borderColor: '#8c6d4a',
  color: '#5a3f29',
}

const closeBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  background: 'transparent',
  borderColor: '#c9b48f',
  color: '#8c6d4a',
}
