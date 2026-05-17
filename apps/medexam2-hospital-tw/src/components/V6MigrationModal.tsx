/**
 * V6 migration welcome modal — `redesign-hospital-economy` §9.5.8 (audit C5).
 *
 * Fires once per save for players who had a v5 save (tier > 診所 implies actual
 * play). Explains the four mechanical changes shipped in v6:
 *   1. Session-gated tick (was idle accumulation)
 *   2. Salary drain on bench doctors at 區域醫院+
 *   3. Training (進修) — spend revenue to upgrade rarity
 *   4. Diversification gate — multi-subject roster required for tier upgrade
 *
 * Dismiss writes `tutorial.firedTips.v6_welcome = true` so it never re-shows.
 */

import { useEffect } from 'react'
import { getHospitalDB, type GameCountersRow } from '../db/schema'

interface V6MigrationModalProps {
  counters: GameCountersRow
  onDismiss: () => void
}

export function V6MigrationModal({ counters, onDismiss }: V6MigrationModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') void handleDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDismiss() {
    const db = getHospitalDB()
    await db.transaction('rw', db.gameCounters, async () => {
      const c = await db.gameCounters.get('singleton')
      if (!c) return
      await db.gameCounters.put({
        ...c,
        tutorial: {
          ...c.tutorial,
          firedTips: { ...c.tutorial.firedTips, v6_welcome: true },
        },
      })
    })
    onDismiss()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal frame v6-migration-modal">
        <h2 className="modal__title">🏥 醫院系統大改版</h2>
        <p>
          歡迎回來，<strong>{counters.tier}</strong> 院長。本次更新後遊戲機制有四個重大變化：
        </p>
        <ul className="v6-migration-list">
          <li>
            <strong>📖 唸書 session</strong>
            <p>
              掛機不再產出聲望／營收。從首頁點「📖 唸書」進入 session，期間醫師才會看診賺收益。離開分頁
              90 秒會自動暫停。
            </p>
          </li>
          <li>
            <strong>💰 醫師薪水</strong>
            <p>
              區域醫院以上 tier 開始扣薪水（含板凳）。預設配置每階仍 net positive；
              升級設施 / 房間擴建可放大淨收益。
            </p>
          </li>
          <li>
            <strong>⬆️ 醫師進修</strong>
            <p>
              到「進修」頁面消耗營收升 rarity（P5→P4→...→P1）。失敗只損營收，
              連續 5 次失敗的下次必中（保底）。
            </p>
          </li>
          <li>
            <strong>🎯 升級雙閘門</strong>
            <p>
              升級不只看聲望，還要科別多樣性（區域醫院 5 科、醫學中心 8 科 P3+、
              國家級教學醫院 10 科 P2+ 含 1 P1）。
            </p>
          </li>
        </ul>
        <p className="muted">
          舊存檔資料完整保留。新增的「累積唸書」計數從 0 開始（之前的時間不計）。
        </p>
        <div className="modal__actions">
          <button className="primary-btn" onClick={() => void handleDismiss()}>
            開始遊玩
          </button>
        </div>
      </div>
    </div>
  )
}
