/**
 * EventModal — `redesign-hospital-economy` §6.1.
 *
 * Renders the action set for the currently-pending modal event from
 * `gameCounters.pendingEventId`. Branch per event id:
 *
 *   - medical-malpractice: 私下和解 / 接受懲處 (settle disabled if revenue<min)
 *   - vip-patient:         接待 → 10 min throughput 2× boost
 *   - emergency-shift:     開設 → +5k 營收 + +500 聲望
 *   - audit-event:         接受評鑑 → 70% pass / 30% fail rolled on resolve
 *
 * Pending state is owned by Dexie (`gameCounters.pendingEventId`); after
 * resolution the relevant service clears it and the modal unmounts.
 */

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  EMERGENCY_SHIFT_REPUTATION_BONUS,
  EMERGENCY_SHIFT_REVENUE_BONUS,
  MALPRACTICE_PENALTY_REP,
  MALPRACTICE_SETTLEMENT_MIN,
  MALPRACTICE_SETTLEMENT_PERCENT,
  VIP_BOOST_DURATION_MS,
  VIP_BOOST_MULTIPLIER,
} from '@study-rpg/content-medexam2-tw'
import { EVENT_ICONS } from '@study-rpg/theme-pixel-hospital'
import { getHospitalDB } from '../db/schema'
import {
  resolveAudit,
  resolveEmergencyShift,
  resolveMalpractice,
  resolveVipPatient,
  type AuditOutcome,
  type EmergencyShiftOutcome,
  type MalpracticeOutcome,
  type VipOutcome,
} from '../services/event'

const KNOWN_EVENT_IDS = new Set([
  'medical-malpractice',
  'vip-patient',
  'emergency-shift',
  'audit-event',
])

type Outcome =
  | { kind: 'malpractice'; result: MalpracticeOutcome }
  | { kind: 'vip'; result: VipOutcome }
  | { kind: 'emergency'; result: EmergencyShiftOutcome }
  | { kind: 'audit'; result: AuditOutcome }

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

export function EventModal() {
  const db = getHospitalDB()
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  // Outcome modal takes priority: it must stay visible AFTER the pending event
  // is cleared by the resolver. Without this, the resolver clears
  // `pendingEventId`, useLiveQuery fires, and the component unmounts before
  // React can render the outcome modal.
  if (outcome) {
    return (
      <div className="modal-backdrop" role="dialog" aria-label="事件結果">
        <div className="modal frame event-modal event-modal--outcome">
          <header className="event-modal__head">
            <h2>{outcomeTitle(outcome)}</h2>
          </header>
          <div className="event-modal__body">
            <p>{outcomeMessage(outcome)}</p>
          </div>
          <footer className="event-modal__foot">
            <button className="event-modal__primary-btn" type="button" onClick={closeOutcome}>
              關閉
            </button>
          </footer>
        </div>
      </div>
    )
  }

  if (!counters?.pendingEventId) return null

  const eventId = counters.pendingEventId
  const settlementCost = Math.max(
    MALPRACTICE_SETTLEMENT_MIN,
    Math.round(counters.revenue * MALPRACTICE_SETTLEMENT_PERCENT),
  )
  const canSettle = counters.revenue >= settlementCost

  async function handleMalpracticeSettle() {
    setBusy(true)
    try {
      const result = await resolveMalpractice('settle')
      if (result.kind === 'insufficient-revenue') return // keep modal open
      setOutcome({ kind: 'malpractice', result })
    } finally {
      setBusy(false)
    }
  }

  async function handleMalpracticeAccept() {
    setBusy(true)
    try {
      const result = await resolveMalpractice('accept-penalty')
      setOutcome({ kind: 'malpractice', result })
    } finally {
      setBusy(false)
    }
  }

  async function handleVip() {
    setBusy(true)
    try {
      const result = await resolveVipPatient()
      setOutcome({ kind: 'vip', result })
    } finally {
      setBusy(false)
    }
  }

  async function handleEmergency() {
    setBusy(true)
    try {
      const result = await resolveEmergencyShift()
      setOutcome({ kind: 'emergency', result })
    } finally {
      setBusy(false)
    }
  }

  async function handleAudit() {
    setBusy(true)
    try {
      const result = await resolveAudit()
      setOutcome({ kind: 'audit', result })
    } finally {
      setBusy(false)
    }
  }

  async function dismissUnknownEvent() {
    const db = getHospitalDB()
    await db.transaction('rw', db.gameCounters, async () => {
      const row = await db.gameCounters.get('singleton')
      if (!row) return
      await db.gameCounters.put({
        ...row,
        pendingEventId: null,
        pendingEventTriggeredAt: null,
        lastEventResolvedAt: Date.now(),
      })
    })
  }

  function closeOutcome() {
    setOutcome(null)
  }

  // §6.1 LOW fix — unknown pendingEventId (corrupted row, future content-pack id
  // not covered by any branch below) would render an empty backdrop with no
  // close button. Fallback to a "dismiss" UI that clears the stuck state.
  if (!KNOWN_EVENT_IDS.has(eventId)) {
    return (
      <div className="modal-backdrop" role="dialog" aria-label="未知事件" aria-modal="true">
        <div className="modal frame event-modal">
          <header className="event-modal__head">
            <h2>⚠️ 未知事件</h2>
          </header>
          <div className="event-modal__body">
            <p>
              偵測到不明的待處理事件 id：<code>{eventId}</code>。可能是舊存檔或未來新事件殘留。
              點下方按鈕清除這個狀態繼續遊玩。
            </p>
          </div>
          <footer className="event-modal__foot">
            <button
              type="button"
              className="event-modal__primary-btn"
              onClick={() => void dismissUnknownEvent()}
            >
              清除並繼續
            </button>
          </footer>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="事件" aria-modal="true">
      <div className="modal frame event-modal">
        {eventId === 'medical-malpractice' && (
          <>
            <header className="event-modal__head event-modal__head--negative">
              {EVENT_ICONS && (
                <img
                  src={EVENT_ICONS.malpractice}
                  alt=""
                  aria-hidden
                  className="event-modal__icon"
                />
              )}
              <h2>⚠️ 醫療糾紛</h2>
            </header>
            <div className="event-modal__body">
              <p>一位病患的家屬對於診療結果有疑慮，已向院方提出申訴。你決定如何處理？</p>
              <ul className="event-modal__options">
                <li>
                  <strong>私下和解</strong>：支付 {fmt(settlementCost)} 💰（營收的{' '}
                  {(MALPRACTICE_SETTLEMENT_PERCENT * 100).toFixed(0)}%，下限{' '}
                  {fmt(MALPRACTICE_SETTLEMENT_MIN)}）。聲望不變。
                </li>
                <li>
                  <strong>接受懲處</strong>：扣 {fmt(MALPRACTICE_PENALTY_REP)} 聲望，不花營收。
                </li>
              </ul>
              {!canSettle && (
                <p className="event-modal__warning">
                  ⚠️ 現有營收 {fmt(counters.revenue)} 💰 不足以私下和解。
                </p>
              )}
            </div>
            <footer className="event-modal__foot">
              <button
                type="button"
                className="event-modal__secondary-btn"
                disabled={busy || !canSettle}
                onClick={handleMalpracticeSettle}
              >
                私下和解（−{fmt(settlementCost)} 💰）
              </button>
              <button
                type="button"
                className="event-modal__primary-btn"
                disabled={busy}
                onClick={handleMalpracticeAccept}
              >
                接受懲處（−{fmt(MALPRACTICE_PENALTY_REP)} 聲望
                {counters.reputation < MALPRACTICE_PENALTY_REP && '（將至 0）'}）
              </button>
            </footer>
          </>
        )}

        {eventId === 'vip-patient' && (
          <>
            <header className="event-modal__head event-modal__head--positive">
              {EVENT_ICONS && (
                <img
                  src={EVENT_ICONS.vip}
                  alt=""
                  aria-hidden
                  className="event-modal__icon"
                />
              )}
              <h2>🌟 VIP 病人</h2>
            </header>
            <div className="event-modal__body">
              <p>
                一位高知名度的病患來院尋求最高品質的醫療服務。接待他將讓醫院 throughput{' '}
                <strong>×{VIP_BOOST_MULTIPLIER}</strong>，持續 {Math.round(VIP_BOOST_DURATION_MS / 60_000)} 分鐘
                （wall-clock；暫停 session 仍會倒數）。
              </p>
            </div>
            <footer className="event-modal__foot">
              <button
                type="button"
                className="event-modal__primary-btn"
                disabled={busy}
                onClick={handleVip}
              >
                接待 VIP（throughput ×{VIP_BOOST_MULTIPLIER}）
              </button>
            </footer>
          </>
        )}

        {eventId === 'emergency-shift' && (
          <>
            <header className="event-modal__head event-modal__head--positive">
              {EVENT_ICONS && (
                <img
                  src={EVENT_ICONS.emergency}
                  alt=""
                  aria-hidden
                  className="event-modal__icon"
                />
              )}
              <h2>🚑 急診加開</h2>
            </header>
            <div className="event-modal__body">
              <p>
                當夜急診室人滿為患。加開急診班，醫師可立即進帳：
                +{fmt(EMERGENCY_SHIFT_REVENUE_BONUS)} 💰 + {fmt(EMERGENCY_SHIFT_REPUTATION_BONUS)}{' '}
                聲望。
              </p>
            </div>
            <footer className="event-modal__foot">
              <button
                type="button"
                className="event-modal__primary-btn"
                disabled={busy}
                onClick={handleEmergency}
              >
                開設急診（+{fmt(EMERGENCY_SHIFT_REVENUE_BONUS)} 💰）
              </button>
            </footer>
          </>
        )}

        {eventId === 'audit-event' && (
          <>
            <header className="event-modal__head event-modal__head--mixed">
              {EVENT_ICONS && (
                <img
                  src={EVENT_ICONS.audit}
                  alt=""
                  aria-hidden
                  className="event-modal__icon"
                />
              )}
              <h2>📋 醫療評鑑</h2>
            </header>
            <div className="event-modal__body">
              <p>
                衛福部評鑑委員到場。通過評鑑可大幅提升聲望（+5,000），但若有疏失將扣聲望（−3,000）。
              </p>
              <p className="event-modal__hint">
                結果隨機：70% 通過 / 30% 失敗。沒有避免接受評鑑的選項，僅能配合。
              </p>
            </div>
            <footer className="event-modal__foot">
              <button
                type="button"
                className="event-modal__primary-btn"
                disabled={busy}
                onClick={handleAudit}
              >
                接受評鑑
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

function outcomeTitle(o: Outcome): string {
  if (o.kind === 'malpractice') {
    if (o.result.kind === 'stale') return '事件已自動處理'
    if (o.result.kind === 'settled') return '✓ 已私下和解'
    return '已接受懲處'
  }
  if (o.kind === 'vip') {
    return o.result.kind === 'stale' ? '事件已自動處理' : '✓ VIP 接待完成'
  }
  if (o.kind === 'emergency') {
    return o.result.kind === 'stale' ? '事件已自動處理' : '✓ 急診加開完成'
  }
  if (o.result.kind === 'stale') return '事件已自動處理'
  return o.result.kind === 'pass' ? '🏆 評鑑通過' : '⚠️ 評鑑失敗'
}

function outcomeMessage(o: Outcome): string {
  if (o.kind === 'malpractice') {
    if (o.result.kind === 'stale') return '事件已被自動處理或過期，無需再操作。'
    if (o.result.kind === 'settled') {
      return `已支付 ${fmt(o.result.settlementCost ?? 0)} 💰 和解金。糾紛圓滿落幕。`
    }
    // Use resolver's actualDelta (negative) — reflects floor clamping when rep < penalty
    return `聲望 ${fmt(o.result.reputationDelta)}。雖然不愉快，但醫院營收不受影響。`
  }
  if (o.kind === 'vip') {
    if (o.result.kind === 'stale') return '事件已被自動處理或過期，無需再操作。'
    return `Throughput ×${VIP_BOOST_MULTIPLIER} 已啟動，將持續 ${Math.round(o.result.durationMs / 60_000)} 分鐘。`
  }
  if (o.kind === 'emergency') {
    if (o.result.kind === 'stale') return '事件已被自動處理或過期，無需再操作。'
    return `+${fmt(o.result.revenueDelta)} 💰 / +${fmt(o.result.reputationDelta)} 聲望。`
  }
  if (o.result.kind === 'stale') return '事件已被自動處理或過期，無需再操作。'
  if (o.result.kind === 'pass') {
    return `恭喜！聲望 +${fmt(o.result.reputationDelta)}。`
  }
  return `這次評鑑發現問題，聲望 ${fmt(o.result.reputationDelta)}。下次加油。`
}
