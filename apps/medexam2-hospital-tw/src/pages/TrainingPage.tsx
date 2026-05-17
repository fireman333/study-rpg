/**
 * Training page — players spend revenue to attempt rarity upgrades on owned
 * doctors. Each doctor has its own pity counter (5 consecutive failures →
 * guaranteed next-attempt success). P1 doctors are terminal.
 *
 * Per design D4: failure does NOT downgrade rarity (only pity counter ticks).
 * Cost / success-rate / pity-threshold all live in content pack `training.ts`.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  TRAINING_BASE_SUCCESS_RATES,
  TRAINING_COSTS,
  TRAINING_NEXT_RARITY,
  TRAINING_PITY_THRESHOLD,
  type Rarity,
  type TrainableRarity,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB, type DoctorRow } from '../db/schema'
import { trainDoctor } from '../services/training'
import type { TrainingAttemptResult } from '@study-rpg/content-medexam2-tw'

type Confirming = { doctor: DoctorRow }
type Outcome = { doctorId: string; result: TrainingAttemptResult }

function isTrainable(r: Rarity): r is TrainableRarity {
  return r !== 'P1'
}

export function TrainingPage() {
  const db = getHospitalDB()
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const doctors = useLiveQuery(() => db.doctors.toArray(), []) ?? []
  const recentHistory = useLiveQuery(
    () => db.trainingHistory.orderBy('attemptedAt').reverse().limit(10).toArray(),
    [],
  ) ?? []

  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)

  const sortedDoctors = useMemo(
    () => [...doctors].sort((a, b) => a.obtainedAt - b.obtainedAt),
    [doctors],
  )

  async function handleConfirm() {
    if (!confirming) return
    setBusy(true)
    try {
      const result = await trainDoctor(confirming.doctor.id)
      setOutcome({ doctorId: confirming.doctor.id, result })
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  function dismissOutcome() {
    setOutcome(null)
  }

  const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>醫師進修</h1>
        <div className="app-header__meta">
          <span className="ticket-counter">💰 {fmt(counters?.revenue ?? 0)}</span>
          <Link to="/" className="nav-link">
            ← 回首頁
          </Link>
        </div>
      </header>

      <section className="training-info">
        <p className="training-info__text">
          消耗營收嘗試將醫師升級到更高 rarity。失敗只損營收，醫師 rarity 不變。
          同一位醫師連續失敗 {TRAINING_PITY_THRESHOLD} 次後，下次必中。
        </p>
      </section>

      <section className="training-doctor-list" aria-label="醫師清單">
        {sortedDoctors.length === 0 ? (
          <p className="study-session__empty">尚未招募任何醫師。</p>
        ) : (
          <ul className="training-doctor-list__items">
            {sortedDoctors.map((d) => {
              const trainable = isTrainable(d.rarity)
              const cost = trainable ? TRAINING_COSTS[d.rarity as TrainableRarity] : 0
              const rate = trainable
                ? TRAINING_BASE_SUCCESS_RATES[d.rarity as TrainableRarity]
                : 0
              const target = trainable
                ? TRAINING_NEXT_RARITY[d.rarity as TrainableRarity]
                : null
              const pityAtMax = d.pityCounter >= TRAINING_PITY_THRESHOLD
              const canAfford = (counters?.revenue ?? 0) >= cost
              return (
                <li key={d.id} className={`training-doctor-card training-doctor-card--${d.rarity}`}>
                  <div className="training-doctor-card__left">
                    <span className={`rarity-badge rarity-badge--${d.rarity}`}>{d.rarity}</span>
                    <span className="doctor-name">{d.name}</span>
                  </div>
                  <div className="training-doctor-card__mid">
                    {trainable ? (
                      <>
                        <span>
                          → <strong>{target}</strong>
                        </span>
                        <span className="training-rate">
                          基礎機率 {(rate * 100).toFixed(0)}%
                        </span>
                        <span className="training-pity">
                          {pityAtMax
                            ? '🎯 下次必中'
                            : `保底進度 ${d.pityCounter} / ${TRAINING_PITY_THRESHOLD}`}
                        </span>
                      </>
                    ) : (
                      <span className="training-terminal">已達 P1（頂級）</span>
                    )}
                  </div>
                  <div className="training-doctor-card__right">
                    {trainable && (
                      <button
                        className="primary-btn"
                        onClick={() => setConfirming({ doctor: d })}
                        disabled={!canAfford || busy}
                        title={canAfford ? '' : `需要 ${fmt(cost)} 營收`}
                      >
                        進修（{fmt(cost)} 💰）
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {recentHistory.length > 0 && (
        <section className="training-history" aria-label="近期進修紀錄">
          <h2 className="section-heading">近期 10 次進修</h2>
          <ul className="training-history__items">
            {recentHistory.map((row, idx) => {
              const doctor = doctors.find((d) => d.id === row.doctorId)
              return (
                <li
                  key={row.id ?? idx}
                  className={`training-history__item training-history__item--${row.success ? 'success' : 'failure'}`}
                >
                  <span className="training-history__doctor">{doctor?.name ?? row.doctorId}</span>
                  <span className="training-history__transition">
                    {row.fromRarity} → {row.toRarity}
                  </span>
                  <span className="training-history__result">
                    {row.success ? (row.pityTriggered ? '🎯 保底成功' : '✓ 成功') : '✗ 失敗'}
                  </span>
                  <span className="training-history__cost">-{fmt(row.cost)} 💰</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {confirming && (
        <div className="modal-backdrop" onClick={() => !busy && setConfirming(null)}>
          <div className="modal frame training-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">進修確認</h2>
            <p>
              <strong>{confirming.doctor.name}</strong>
              {' '}（{confirming.doctor.rarity}）
            </p>
            {isTrainable(confirming.doctor.rarity) && (
              <>
                <p>
                  目標：<strong>{TRAINING_NEXT_RARITY[confirming.doctor.rarity]}</strong>
                </p>
                <p>
                  成本：<strong>{fmt(TRAINING_COSTS[confirming.doctor.rarity])} 💰</strong>
                </p>
                <p>
                  基礎成功率：
                  <strong>
                    {(TRAINING_BASE_SUCCESS_RATES[confirming.doctor.rarity] * 100).toFixed(0)}%
                  </strong>
                </p>
                <p>
                  保底進度：
                  <strong>
                    {confirming.doctor.pityCounter} / {TRAINING_PITY_THRESHOLD}
                  </strong>
                  {confirming.doctor.pityCounter >= TRAINING_PITY_THRESHOLD &&
                    '（本次必中）'}
                </p>
              </>
            )}
            <div className="modal__actions">
              <button className="ghost-btn" onClick={() => setConfirming(null)} disabled={busy}>
                取消
              </button>
              <button className="primary-btn" onClick={handleConfirm} disabled={busy}>
                {busy ? '進修中…' : '確認進修'}
              </button>
            </div>
          </div>
        </div>
      )}

      {outcome && (
        <div className="modal-backdrop" onClick={dismissOutcome}>
          <div
            className={`modal frame training-outcome-modal training-outcome-modal--${outcome.result.kind}`}
            onClick={(e) => e.stopPropagation()}
          >
            {outcome.result.kind === 'success' && (
              <>
                <h2 className="modal__title">🎉 進修成功！</h2>
                <p>
                  <strong>{outcome.result.fromRarity}</strong>
                  {' → '}
                  <strong className="rarity-up">{outcome.result.toRarity}</strong>
                </p>
                {outcome.result.pityTriggered && <p>🎯 保底觸發</p>}
                <p className="muted">-{fmt(outcome.result.revenueSpent)} 💰</p>
              </>
            )}
            {outcome.result.kind === 'failure' && (
              <>
                <h2 className="modal__title">😞 進修失敗</h2>
                <p>
                  Rarity 維持 <strong>{outcome.result.fromRarity}</strong>
                </p>
                <p>
                  保底進度推進至 {outcome.result.newPityCounter} / {TRAINING_PITY_THRESHOLD}
                </p>
                <p className="muted">-{fmt(outcome.result.revenueSpent)} 💰</p>
              </>
            )}
            {outcome.result.kind === 'aborted' && (
              <>
                <h2 className="modal__title">無法進修</h2>
                {outcome.result.reason === 'terminal-rarity' && <p>該醫師已是 P1（頂級）。</p>}
                {outcome.result.reason === 'insufficient-revenue' && (
                  <p>營收不足。需要 {fmt(outcome.result.requiredRevenue)} 💰。</p>
                )}
              </>
            )}
            <div className="modal__actions">
              <button className="primary-btn" onClick={dismissOutcome}>
                好
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
