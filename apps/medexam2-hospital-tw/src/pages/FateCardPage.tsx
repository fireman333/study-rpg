/**
 * Fate Cards page — `redesign-hospital-economy` §7.
 *
 * Endgame reputation sink. 4 pack tiers (common / rare / epic / legendary)
 * unlock progressively. Each draw consumes reputation; possible outcomes:
 *   - reward (uniform pick from pool, possibly pity-triggered)
 *   - bad luck (loses extra rep, increments per-tier pity counter)
 *   - aborted (insufficient reputation, no state change)
 *
 * Tier gate: locked behind `tier === '醫學中心' || '國家級教學醫院'` per spec.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  FATE_CARD_BAD_LUCK_RATES,
  FATE_CARD_COSTS,
  FATE_CARD_LABELS,
  FATE_CARD_PITY_THRESHOLD,
  FATE_CARD_POOLS,
  FATE_CARD_TIER_ORDER,
  type FateCardTier,
} from '@study-rpg/content-medexam2-tw'
import { FATE_CARD_ART } from '@study-rpg/theme-pixel-hospital'
import { getHospitalDB } from '../db/schema'
import { drawFateCardAtTier, type FateCardResolvedDraw } from '../services/fate-card'
import { SurfaceHint } from '../components/SurfaceHint'
import { TargetedTicketPicker } from '../components/TargetedTicketPicker'
import {
  TargetedDrawTutorialOverlay,
  FIRST_EPIC_TARGETED_KEY,
  FIRST_LEGENDARY_TARGETED_KEY,
} from '../components/TargetedDrawTutorialOverlay'

const FATE_TIER_UNLOCKED = new Set(['醫學中心', '國家級教學醫院'])

interface DrawOutcome {
  draw: FateCardResolvedDraw
  appliedEffect: string
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

function tierColor(t: FateCardTier): string {
  switch (t) {
    case 'common': return '#888'
    case 'rare': return '#3a7'
    case 'epic': return '#a47'
    case 'legendary': return '#c84'
  }
}

export function FateCardPage() {
  const db = getHospitalDB()
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const mono = useLiveQuery(() => db.monotonicCounters.get('singleton'), [])
  const history = useLiveQuery(
    () => db.fateCardHistory.orderBy('drawnAt').reverse().limit(20).toArray(),
    [],
  )
  const pendingTickets = useLiveQuery(
    () => db.targetedTickets.where('status').equals('pending').toArray(),
    [],
  ) ?? []
  const [drawing, setDrawing] = useState(false)
  const [outcome, setOutcome] = useState<DrawOutcome | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [pickerTicketId, setPickerTicketId] = useState<string | null>(null)
  const [assignedToast, setAssignedToast] = useState<string | null>(null)
  /**
   * When the just-drawn reward is a targeted ticket AND the first-of-its-tier
   * tutorial hasn't fired yet, this holds the tier + ticketId pair so the
   * overlay shows first; on dismiss we set pickerTicketId to open the picker.
   */
  const [pendingTutorial, setPendingTutorial] = useState<
    { tier: 'epic' | 'legendary'; ticketId: string } | null
  >(null)

  if (!counters) {
    return (
      <main className="app-shell">
        <p className="boot-status">載入中…</p>
      </main>
    )
  }

  const tierUnlocked = FATE_TIER_UNLOCKED.has(counters.tier)

  async function handleDraw(tier: FateCardTier) {
    setDrawing(true)
    setErrMsg(null)
    try {
      const res = await drawFateCardAtTier(tier)
      if (!res.ok) {
        if (res.reason === 'insufficient-reputation') {
          setErrMsg(`聲望不足。需要 ${fmt(res.required ?? 0)}。`)
        } else {
          setErrMsg('抽卡失敗，請稍後再試。')
        }
        return
      }
      setOutcome(res)
      // If the resolved reward created a pending targeted ticket, queue the
      // picker (or tutorial overlay on first-of-tier) for after the user
      // dismisses the outcome modal.
      if (res.targetedTicketId && res.draw.kind === 'reward') {
        const fired = counters?.tutorial?.firedTips ?? {}
        const sourceTier: 'epic' | 'legendary' = tier === 'legendary' ? 'legendary' : 'epic'
        const firstKey =
          sourceTier === 'epic' ? FIRST_EPIC_TARGETED_KEY : FIRST_LEGENDARY_TARGETED_KEY
        if (!fired[firstKey]) {
          setPendingTutorial({ tier: sourceTier, ticketId: res.targetedTicketId })
        } else {
          setPickerTicketId(res.targetedTicketId)
        }
      }
    } finally {
      setDrawing(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>命運卡</h1>
        <div className="app-header__meta">
          <span className="ticket-counter">⭐ {fmt(counters.reputation)} 聲望</span>
          <Link to="/" className="nav-link">
            ← 回首頁
          </Link>
        </div>
      </header>

      <SurfaceHint surfaceId="fate-cards" />

      {pendingTickets.length > 0 && (
        <button
          type="button"
          className="targeted-ticket-pending-chip"
          onClick={() => {
            // Gate through tutorial overlay if first-of-tier milestone not yet
            // fired (chip-reopen path must honor same spec scenario as the
            // initial draw — tutorial fires on the FIRST epic/legendary ticket
            // existing, regardless of how the picker is invoked).
            const next = pendingTickets[0]
            const fired = counters?.tutorial?.firedTips ?? {}
            const firstKey =
              next.sourceFateCardTier === 'epic'
                ? FIRST_EPIC_TARGETED_KEY
                : FIRST_LEGENDARY_TARGETED_KEY
            if (!fired[firstKey]) {
              setPendingTutorial({ tier: next.sourceFateCardTier, ticketId: next.id })
            } else {
              setPickerTicketId(next.id)
            }
          }}
          aria-label="開啟 targeted ticket 指派"
        >
          🎫 {pendingTickets.length} 張待指派 targeted ticket — 解鎖 banner 後可指派
        </button>
      )}

      {!tierUnlocked && (
        <section className="fate-cards-locked">
          <p>
            🔒 命運卡功能僅於 <strong>醫學中心</strong> 以上開放。當前等級：
            <strong>{counters.tier}</strong>。
          </p>
        </section>
      )}

      <section className="fate-cards-grid" aria-label="命運卡包">
        {FATE_CARD_TIER_ORDER.map((tier) => {
          const cost = FATE_CARD_COSTS[tier]
          const insufficient = counters.reputation < cost
          const badLuckRate = FATE_CARD_BAD_LUCK_RATES[tier]
          const pool = FATE_CARD_POOLS[tier]
          const pityCount =
            tier === 'legendary' ? 0 : mono?.fateCardBadLuckPity[tier] ?? 0
          return (
            <article
              key={tier}
              className={`fate-card ${insufficient ? 'fate-card--insufficient' : ''}`}
              style={{ borderColor: tierColor(tier) }}
            >
              {FATE_CARD_ART && (
                <img
                  className="fate-card__art"
                  src={FATE_CARD_ART[tier]}
                  alt=""
                  aria-hidden="true"
                />
              )}
              <h3 className="fate-card__title" style={{ color: tierColor(tier) }}>
                {FATE_CARD_LABELS[tier]}
              </h3>
              <p className="fate-card__cost">消耗：{fmt(cost)} 聲望</p>
              <p className="fate-card__badluck">
                衰運率：{(badLuckRate * 100).toFixed(0)}%
                {tier !== 'legendary' && (
                  <span className="fate-card__pity">
                    （保底 {pityCount}/{FATE_CARD_PITY_THRESHOLD}）
                  </span>
                )}
              </p>
              <ul className="fate-card__pool">
                {pool.map((r) => (
                  <li key={r.key}>{r.label}</li>
                ))}
              </ul>
              <button
                type="button"
                className="fate-card__draw-btn"
                disabled={!tierUnlocked || insufficient || drawing}
                onClick={() => void handleDraw(tier)}
              >
                {drawing ? '抽卡中…' : tierUnlocked ? '抽一張' : '🔒 鎖定中'}
              </button>
            </article>
          )
        })}
      </section>

      {errMsg && <p className="fate-cards-error">{errMsg}</p>}

      {outcome && (
        <div className="modal-backdrop" onClick={() => setOutcome(null)}>
          <div
            className="modal frame fate-outcome-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="抽卡結果"
          >
            <header className="fate-outcome-modal__head">
              <h2>
                {outcome.draw.kind === 'badLuck' ? '⚡ 衰運' : '🎁 獲得獎勵'}
                {outcome.draw.kind === 'reward' && outcome.draw.pityTriggered && (
                  <span className="fate-pity-tag"> 🎯 保底</span>
                )}
              </h2>
            </header>
            <div className="fate-outcome-modal__body">
              {outcome.draw.kind === 'reward' ? (
                <>
                  <p>
                    <strong>{outcome.draw.reward.label}</strong>
                  </p>
                  <p className="fate-outcome-modal__effect">{outcome.appliedEffect}</p>
                  <p className="muted">消耗 {fmt(outcome.draw.costPaid)} 聲望</p>
                </>
              ) : (
                <>
                  <p>{outcome.appliedEffect}</p>
                  <p className="muted">
                    消耗 {fmt(outcome.draw.costPaid)} 聲望 + 衰運懲罰{' '}
                    {fmt(outcome.draw.penaltyAmount)} 聲望
                  </p>
                  <p className="muted">
                    保底進度：{outcome.draw.newPityCounter}/{FATE_CARD_PITY_THRESHOLD}
                  </p>
                </>
              )}
            </div>
            <footer className="fate-outcome-modal__foot">
              <button
                type="button"
                className="event-modal__primary-btn"
                onClick={() => setOutcome(null)}
              >
                關閉
              </button>
            </footer>
          </div>
        </div>
      )}

      {/*
        First-of-tier tutorial overlay — shows ONCE per tier (epic / legendary)
        before the picker opens, so the player understands what targeted tickets
        do before being asked to commit a subject choice. After dismiss, the
        milestone flag persists in counters.tutorial.firedTips so subsequent
        draws of that tier skip straight to the picker.
      */}
      {pendingTutorial && !outcome && !pickerTicketId && (
        <TargetedDrawTutorialOverlay
          tier={pendingTutorial.tier}
          onDismiss={() => {
            const ticketId = pendingTutorial.ticketId
            setPendingTutorial(null)
            setPickerTicketId(ticketId)
          }}
        />
      )}

      {/*
        Targeted ticket picker — opens after the user dismisses the outcome
        modal IF the resolved reward was a targeted-pN-ticket. Picker handles
        its own two-stage flow (pick → confirm) and self-closes on assign or
        "save for later". For first-of-tier draws the tutorial overlay above
        gates this until milestone is acknowledged.
      */}
      {pickerTicketId && !outcome && !pendingTutorial && (
        <TargetedTicketPicker
          ticketId={pickerTicketId}
          onClose={() => setPickerTicketId(null)}
          onAssigned={(displayName) => {
            setAssignedToast(`targeted ticket 已指派給 ${displayName}`)
            setTimeout(() => setAssignedToast(null), 3500)
          }}
        />
      )}

      {assignedToast && (
        <div className="fate-cards-toast" role="status">
          ✓ {assignedToast}
        </div>
      )}

      <section className="fate-cards-history" aria-label="近期抽卡紀錄">
        <h2>近期抽卡（最後 20 次）</h2>
        {!history || history.length === 0 ? (
          <p className="muted">尚無抽卡紀錄。</p>
        ) : (
          <ul className="fate-cards-history__list">
            {history.map((row) => (
              <li
                key={row.id}
                className={`fate-cards-history__item ${row.wasBadLuck ? 'fate-cards-history__item--bad' : 'fate-cards-history__item--good'}`}
              >
                <span className="fate-cards-history__tier">{FATE_CARD_LABELS[row.tier]}</span>
                <span className="fate-cards-history__reward">
                  {row.wasBadLuck ? '⚡ 衰運' : `🎁 ${row.rewardKey}${row.pityTriggered ? ' 🎯' : ''}`}
                </span>
                <span className="fate-cards-history__cost">−{fmt(row.cost)} 聲望</span>
                <span className="fate-cards-history__time">
                  {new Date(row.drawnAt).toLocaleString('zh-TW', {
                    timeZone: 'Asia/Taipei',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
