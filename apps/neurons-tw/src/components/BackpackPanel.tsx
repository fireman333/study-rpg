import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import type { DmnEventKind, DmnActiveBuffRow } from '@study-rpg/content-neurons-tw'
import { db, type InventoryRow } from '../lib/db'
import { activateConsumable, pruneExpiredBuffs } from '../lib/services/inventory'
import { ParticleBurst } from '../lib/motion'

/**
 * Consumable backpack (add-neurons-acceleration-system §6.1). Lists unspent DMN
 * consumable stock (manual-activate) + currently-active timed buffs. Stock +
 * active buffs are live-queried; activation decrements stock and applies the
 * effect via `activateConsumable`.
 */

const KIND_LABEL: Record<DmnEventKind, string> = {
  'family-buff': 'Family Buff · 某科能量水龍頭 1 小時加倍',
  'variant-rate-up': 'Variant Rate-Up · 下次 variant 抽卡稀有度提升',
  'quick-review-batch': 'Quick Review · 彈出 ≤5 道錯題快速複習',
  'hidden-reveal': 'Hidden Reveal · 透露下一張未抽 P1 卡輪廓',
  surge: 'Surge · 探索速度短暫提升（神經增益）',
  bolus: 'Bolus · 迷宮能量短暫湧入（乳酸供能）',
}

function relTime(expiresAt: number, now: number): string {
  if (expiresAt > 32503680000000 - 1) return '待用（下次抽卡）'
  const ms = expiresAt - now
  if (ms <= 0) return '已結束'
  const mins = Math.ceil(ms / 60000)
  return mins >= 60 ? `剩 ${Math.floor(mins / 60)}h${mins % 60}m` : `剩 ${mins}m`
}

export default function BackpackPanel(): JSX.Element {
  const [stock, setStock] = useState<InventoryRow[]>([])
  const [buffs, setBuffs] = useState<DmnActiveBuffRow[]>([])
  // One-shot activation burst (neurons-juice-animations). Nonce keys a fresh
  // ParticleBurst so each successful activation replays; ParticleBurst self-nulls
  // under reduced-motion. Never persisted.
  const [burstNonce, setBurstNonce] = useState(0)
  const now = Date.now()

  useEffect(() => {
    // Best-effort housekeeping on mount.
    void pruneExpiredBuffs()
    const sub = liveQuery(async () => {
      const [inv, active] = await Promise.all([
        db.inventory.toArray(),
        db.dmnActiveBuffs.toArray(),
      ])
      return { inv, active }
    }).subscribe({
      next: ({ inv, active }) => {
        setStock(inv.filter((r) => r.count > 0))
        setBuffs(active.filter((b) => b.expiresAt > Date.now()))
      },
      error: (err) => console.error('[BackpackPanel] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  const onActivate = async (kind: DmnEventKind): Promise<void> => {
    const res = await activateConsumable(kind)
    if (!res.ok) {
      console.info(`[backpack] activate ${kind} → ${res.reason}`)
      return
    }
    setBurstNonce((n) => n + 1)
  }

  return (
    <section style={{ ...panelStyle, position: 'relative' }}>
      {burstNonce > 0 && (
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
        >
          <ParticleBurst key={burstNonce} color="#7fd4ff" />
        </div>
      )}
      <h2 style={headingStyle}>🎒 背包 · 補給品</h2>
      {stock.length === 0 ? (
        <p style={emptyStyle}>背包是空的 — 抽 DMN 卡會把補給品放進來，由你決定何時啟用。</p>
      ) : (
        <ul style={listStyle}>
          {stock.map((row) => (
            <li key={row.kind} style={rowStyle}>
              <span style={rowLabelStyle}>{KIND_LABEL[row.kind]}</span>
              <span style={countChipStyle}>×{row.count}</span>
              <button type="button" style={activateBtnStyle} onClick={() => void onActivate(row.kind)}>
                啟用
              </button>
            </li>
          ))}
        </ul>
      )}

      {buffs.length > 0 && (
        <div style={activeWrapStyle}>
          <h3 style={subHeadingStyle}>啟用中</h3>
          <ul style={listStyle}>
            {buffs.map((b) => (
              <li key={b.id} style={activeRowStyle}>
                <span style={rowLabelStyle}>
                  {KIND_LABEL[b.buffKind]}
                  {b.familyId ? `（${b.familyId}）` : ''}
                </span>
                <span style={timerChipStyle}>{relTime(b.expiresAt, now)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

const panelStyle: React.CSSProperties = {
  maxWidth: '1100px',
  margin: '0 auto 1.5rem',
  background: '#15122e',
  border: '2px solid #3d3270',
  borderRadius: '10px',
  padding: '1rem 1.1rem',
}

const headingStyle: React.CSSProperties = {
  margin: '0 0 0.6rem',
  fontSize: '1.1rem',
  color: '#d4c4ff',
  letterSpacing: '0.06em',
}

const subHeadingStyle: React.CSSProperties = {
  margin: '0.8rem 0 0.4rem',
  fontSize: '0.85rem',
  color: '#9fd4b0',
}

const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.82rem',
  color: '#9b9b9b',
  lineHeight: 1.6,
}

const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  background: '#1c1838',
  border: '1px solid #3d3270',
  borderRadius: '6px',
  padding: '0.5rem 0.7rem',
}

const activeRowStyle: React.CSSProperties = { ...rowStyle, borderColor: '#3d6b4d' }

const rowLabelStyle: React.CSSProperties = { flex: 1, fontSize: '0.8rem', color: '#cfcae6', lineHeight: 1.4 }

const countChipStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#d4c4ff',
  background: '#2d2055',
  borderRadius: '999px',
  padding: '0.1rem 0.55rem',
}

const timerChipStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  color: '#9fd4b0',
  whiteSpace: 'nowrap',
}

const activateBtnStyle: React.CSSProperties = {
  padding: '0.35rem 0.9rem',
  background: '#5d4ec4',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontSize: '0.8rem',
  fontWeight: 700,
  cursor: 'pointer',
}

const activeWrapStyle: React.CSSProperties = { marginTop: '0.4rem' }
