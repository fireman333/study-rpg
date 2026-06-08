/**
 * ShareCardModal — the neurons share hub (enhance-neurons-share-cards).
 *
 * One entry on /collection opens this modal with a card-type switcher:
 *   變體 (a collected variant) · 連結 (an unlocked connector) · 戰績 (stats card).
 * Default tab = 變體. Each card is composed fully in-browser via Canvas 2D
 * (1080×1350) and exported by canvas.toBlob → download / Web Share. The 變體 and
 * 連結 tabs have an in-modal picker to feature any collected/unlocked item; empty
 * collections render a CTA, never a thrown error or blank canvas.
 *
 * Pure derived view of already-local Dexie state — no new stored/synced state.
 * Capability spec: openspec/specs/neurons-character-card/spec.md
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import {
  buildCharacterCardPayload,
  buildConnectorCardPayload,
  buildVariantCardPayload,
  loadConnectorShareState,
  loadVariantShareState,
  pickDefaultConnector,
  pickDefaultVariant,
  variantCardKey,
  type ConnectorShareState,
  type VariantShareState,
} from '../lib/services/character-card'
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  loadCardAssets,
  loadConnectorCardAssets,
  loadVariantCardAssets,
  renderCharacterCard,
  renderConnectorCard,
  renderVariantCard,
} from '../lib/character-card-render'
import { canShareCardFile, downloadCardPng, shareCardPng } from '../lib/character-card-export'

type Tab = 'variant' | 'connector' | 'stats'
type Status = 'loading' | 'ready' | 'error' | 'empty'

interface Props {
  open: boolean
  onClose: () => void
  userId?: string | null
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'variant', label: '變體' },
  { id: 'connector', label: '連結' },
  { id: 'stats', label: '戰績' },
]

export default function ShareCardModal({ open, onClose, userId }: Props): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tab, setTab] = useState<Tab>('variant')
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [variantState, setVariantState] = useState<VariantShareState | null>(null)
  const [connectorState, setConnectorState] = useState<ConnectorShareState | null>(null)
  const [featuredVariant, setFeaturedVariant] = useState<string | null>(null)
  const [featuredConnector, setFeaturedConnector] = useState<string | null>(null)
  const canShare = canShareCardFile()

  // Load the picker lists + nickname once per open; reset transient UI.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setTab('variant')
    setHint(null)
    void (async () => {
      try {
        const [vs, cs] = await Promise.all([
          loadVariantShareState(userId),
          loadConnectorShareState(userId),
        ])
        if (cancelled) return
        setVariantState(vs)
        setConnectorState(cs)
        const dv = pickDefaultVariant(vs.variants)
        const dc = pickDefaultConnector(cs.connectors)
        setFeaturedVariant(dv ? variantCardKey(dv) : null)
        setFeaturedConnector(dc ? dc.pairKey : null)
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

  // Render the active tab's card whenever the tab / featured item / data changes.
  useEffect(() => {
    if (!open) return
    if (tab !== 'stats' && (variantState === null || connectorState === null)) return
    let cancelled = false
    setStatus('loading')
    setError(null)
    setHint(null)
    void (async () => {
      try {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = CARD_WIDTH
        canvas.height = CARD_HEIGHT
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('此瀏覽器不支援 canvas 2D')

        if (tab === 'variant') {
          const vs = variantState!
          if (vs.variants.length === 0) {
            if (!cancelled) setStatus('empty')
            return
          }
          const featured =
            vs.variants.find((v) => variantCardKey(v) === featuredVariant) ??
            pickDefaultVariant(vs.variants)!
          const payload = buildVariantCardPayload(featured, {
            nickname: vs.nickname,
            title: vs.title,
            // Distinct-owned count via the canonical projection (ghost slots
            // excluded), NOT the raw picker-list length.
            variantCount: vs.ownedCount,
          })
          const assets = await loadVariantCardAssets(payload)
          if (cancelled) return
          renderVariantCard(ctx, payload, assets)
        } else if (tab === 'connector') {
          const cs = connectorState!
          if (cs.connectors.length === 0) {
            if (!cancelled) setStatus('empty')
            return
          }
          const featured =
            cs.connectors.find((c) => c.pairKey === featuredConnector) ??
            pickDefaultConnector(cs.connectors)!
          const payload = buildConnectorCardPayload(featured, {
            nickname: cs.nickname,
            connectorCount: cs.connectors.length,
          })
          const assets = await loadConnectorCardAssets(payload)
          if (cancelled) return
          renderConnectorCard(ctx, payload, assets)
        } else {
          const payload = await buildCharacterCardPayload(userId)
          const assets = await loadCardAssets(payload)
          if (cancelled) return
          renderCharacterCard(ctx, payload, assets)
        }
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
  }, [open, tab, featuredVariant, featuredConnector, variantState, connectorState, userId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const emptyCopy = useMemo(
    () =>
      tab === 'variant'
        ? '還沒有收集到變體 — 去出征解鎖你的第一隻神經元吧'
        : '還沒有解鎖連結神經元 — 讓兩科的突觸都變強就會誕生',
    [tab],
  )

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
      () => shareCardPng(canvas, { title: '我的神經元收藏', text: '神經元 RPG · LTP' }),
      '分享',
    )
  }

  // Portal to <body>: the /collection route sits inside a motion wrapper whose
  // settled transform makes `position: fixed` resolve against it (off-screen when
  // scrolled). Mounting at body level escapes that ancestor so the overlay always
  // centers in the viewport.
  return createPortal(
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true" aria-label="分享卡">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={titleStyle}>分享卡</h2>

        <div style={tabRowStyle} role="tablist" aria-label="卡片類型">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              style={tab === t.id ? tabActiveStyle : tabStyle}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={previewWrapStyle}>
          <canvas ref={canvasRef} style={canvasStyle} aria-label="分享卡預覽" />
          {status === 'loading' && <div style={stateOverlayStyle}>產生分享卡中…</div>}
          {status === 'error' && (
            <div style={{ ...stateOverlayStyle, color: '#c44d4d' }}>產生失敗：{error}</div>
          )}
          {status === 'empty' && <div style={stateOverlayStyle}>{emptyCopy}</div>}
        </div>

        {tab === 'variant' && variantState && variantState.variants.length > 0 && (
          <div style={pickerStyle} role="listbox" aria-label="選擇變體">
            {variantState.variants.map((v) => {
              const key = variantCardKey(v)
              const url = SPRITE_MAP[v.spriteKey]
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={featuredVariant === key}
                  title={v.displayName}
                  style={featuredVariant === key ? pickerItemActiveStyle : pickerItemStyle}
                  onClick={() => setFeaturedVariant(key)}
                >
                  {url ? (
                    <img src={url} alt={v.displayName} style={pickerImgStyle} />
                  ) : (
                    <span style={pickerFallbackStyle}>?</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {tab === 'connector' && connectorState && connectorState.connectors.length > 0 && (
          <div style={pickerStyle} role="listbox" aria-label="選擇連結神經元">
            {connectorState.connectors.map((c) => {
              const url = SPRITE_MAP[`connector:${c.pairKey}`]
              return (
                <button
                  key={c.pairKey}
                  type="button"
                  role="option"
                  aria-selected={featuredConnector === c.pairKey}
                  title={`${c.familyA} ↔ ${c.familyB}`}
                  style={featuredConnector === c.pairKey ? pickerItemActiveStyle : pickerItemStyle}
                  onClick={() => setFeaturedConnector(c.pairKey)}
                >
                  {url ? (
                    <img src={url} alt={`${c.familyA} ↔ ${c.familyB}`} style={pickerImgStyle} />
                  ) : (
                    <span style={pickerFallbackStyle}>🔗</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

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
    </div>,
    document.body,
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
  fontFamily: 'var(--font-pixel-cjk)',
  color: '#3a2a1a',
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
}

const titleStyle: React.CSSProperties = {
  margin: '0 0 0.7rem',
  fontSize: '1.2rem',
  color: '#5a3e1a',
  letterSpacing: '0.06em',
  textAlign: 'center',
}

const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.3rem',
  marginBottom: '0.8rem',
  justifyContent: 'center',
}

const tabStyle: React.CSSProperties = {
  flex: 1,
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  fontWeight: 700,
  padding: '0.4rem 0.5rem',
  borderRadius: '6px',
  cursor: 'pointer',
  border: '2px solid #c9b48f',
  background: 'transparent',
  color: '#8c6d4a',
}

const tabActiveStyle: React.CSSProperties = {
  ...tabStyle,
  background: '#d4a04d',
  border: '2px solid #b8893a',
  color: '#fff',
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
  padding: '0 1.2rem',
  fontSize: '0.9rem',
  color: '#8c6d4a',
  background: 'rgba(244, 236, 216, 0.85)',
  borderRadius: '6px',
}

const pickerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.35rem',
  marginTop: '0.7rem',
  overflowX: 'auto',
  paddingBottom: '0.3rem',
}

const pickerItemStyle: React.CSSProperties = {
  flex: '0 0 auto',
  width: '52px',
  height: '52px',
  padding: 0,
  borderRadius: '6px',
  cursor: 'pointer',
  border: '2px solid #c9b48f',
  background: '#fdf6e3',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const pickerItemActiveStyle: React.CSSProperties = {
  ...pickerItemStyle,
  border: '2px solid #d4a04d',
  boxShadow: '0 0 0 2px rgba(212,160,77,0.4)',
}

const pickerImgStyle: React.CSSProperties = {
  width: '44px',
  height: '44px',
  imageRendering: 'pixelated',
}

const pickerFallbackStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  color: '#8c6d4a',
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
