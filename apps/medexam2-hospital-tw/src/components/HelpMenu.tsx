/**
 * Help menu — `redesign-hospital-economy` §9.5.3.
 *
 * Floating `❓` FAB at top-right opens a modal with 8 collapsible accordion
 * sections explaining each major mechanic. Always available — players who
 * dismissed onboarding or forgot mechanics can re-read at any time.
 *
 * Per spec hospital-tutorial Req 4: the Help menu is the L4 "Always-available"
 * fallback for emergent confusion. Modal can be opened from any route.
 */

import { useEffect, useState } from 'react'
import { getHospitalDB } from '../db/schema'
import { BugReportModal } from './BugReportModal'
import {
  discardActiveERConsult,
  getERConsultSettings,
  setERConsultSettings,
} from '../services/er-consultation'

interface AccordionSection {
  id: string
  icon: string
  title: string
  /** Body kept short — 1-2 paragraphs per section per design D10. */
  body: string[]
}

const SECTIONS: ReadonlyArray<AccordionSection> = Object.freeze([
  {
    id: 'study-session',
    icon: '📖',
    title: '唸書 session — 醫師看患者 1.5× idle 加成',
    body: [
      '兩個進帳管道：寫題答對直接賺營收/聲望（依 tier 與夥伴醫師同科加成，session 開不開都一樣）；開「📖 唸書」session 期間，醫師看患者的 idle 收入（throughput）會有 1.5× 加成（薪水照舊全額）。不開 session 沒 idle 進帳（tick 不跑），但寫題照常賺錢。',
      '離開分頁會自動暫停、回到分頁自動繼續；手動暫停則需主動點「繼續唸書」。累積唸書時間（min）會永久保留，不會因換機或重置而流失。',
    ],
  },
  {
    id: 'recruitment',
    icon: '🎫',
    title: '招募醫師（gacha + 親和值）',
    body: [
      '每個科別有「親和值」門檻 — 答對該科考古題達門檻後，招募 banner 解鎖。每天免費招募券，用券抽 P5/P4/P3/P2/P1 醫師（rarity 越高機率越低）。',
      '保底（pity）：每 N 抽必出 P3+；每 100 抽必出 SSR (P1)。詳見 RECRUITMENT_PITY_RULES。',
    ],
  },
  {
    id: 'assignment',
    icon: '🩺',
    title: '醫師指派與適性加成',
    body: [
      '在「醫院」頁面點任一房間 → 選一位醫師指派。每位醫師有 subject（科別）和 powerMultiplier。',
      '科別匹配 room type（如 內科 → 門診、外科 → 手術房）有適性加成 1.1×–1.5×（依 rarity）。產能 = 基礎 × 醫師力 × 設施 × 適性。',
    ],
  },
  {
    id: 'training',
    icon: '⬆️',
    title: '醫師進修（消耗營收升 rarity）',
    body: [
      '在「進修」頁面消耗營收升 rarity（P5→P4 50% / P4→P3 30% / P3→P2 15% / P2→P1 5%）。',
      '失敗只損營收，醫師 rarity 不變；連續失敗 5 次後下次必中（保底）。pity counter 每位醫師獨立追蹤。',
    ],
  },
  {
    id: 'retire',
    icon: '👋',
    title: '醫師退休與返還',
    body: [
      '在「進修」頁面點醫師卡片的「退休」按鈕 → 確認後該醫師永久移除，返還 powerMultiplier × 1000 💰 到營收。',
      '24 小時內退休的醫師仍計入升級多樣性門檻（grace period），避免短期退休後被卡升級。',
    ],
  },
  {
    id: 'facility',
    icon: '🏗️',
    title: '設施升級 + 房間擴建',
    body: [
      '在「醫院」頁面點任一房間 → modal 內有「升級設施」按鈕。Lv.1 → Lv.5 共 4 階，每階產能乘數 1.0→3.0。Cost ladder：10K / 50K / 200K / 1M。',
      '房間擴建：區域醫院 tier 開始解鎖，每種房型可加 2-3 間 extra（門診 +3 / 手術房 +2 / 病房 +2）。',
    ],
  },
  {
    id: 'tier-upgrade',
    icon: '🎯',
    title: '升級雙閘門（聲望 + 多樣性）',
    body: [
      '升級不只看聲望，還要科別多樣性。診所→區域醫院：48k 聲望 + 5 不同科別；區域→醫學中心：192k + 8 P3+ 不同科別；醫學中心→國家級：2M + 10 P2+ + 至少 1 位 P1。',
      '雙閘設計確保你的醫院全方位發展，不會只靠單科衝刺。',
    ],
  },
  {
    id: 'fate-cards',
    icon: '🎴',
    title: '命運卡（醫學中心 解鎖）',
    body: [
      '達到 醫學中心 tier 後解鎖。消耗 reputation 抽 4 階卡包（普通 / 稀有 / 史詩 / 傳奇）— 內容池含招募券、進修保證券、設施加成、特殊事件券。',
      '保底：每階獨立追蹤連續衰運次數，連 3 次衰運後第 4 次必中 reward。',
    ],
  },
  {
    id: 'bug-report',
    icon: '💬',
    title: '回報問題 / 建議',
    body: [
      '碰到 bug、數字怪、UI 跑版，或想許願新功能？打開下方表單回報，30 秒內送出。',
      '系統會自動附帶當下遊戲狀態（tier、營收、聲望、進行中 session 等）、route、近期錯誤與瀏覽器資訊，你可以逐欄取消勾選。需先登入。',
    ],
  },
  {
    id: 'er-consult',
    icon: '🚨',
    title: '急診照會設定',
    body: [
      '唸書 session 期間，急診醫師會不定時跳出一題「冷門科別」的考古題請你 consult。答對給 1.8× 加成的營收 + 聲望（高於一般答題），可從下方關閉。',
      '冷門科別 = 你最近 7 天答比較少 + 掌握度比較低的科。10 分鐘內沒回應會自動跳過、不會扣分。',
    ],
  },
])

interface HelpMenuProps {
  /** Optional class to position the FAB; defaults to fixed top-right corner. */
  className?: string
}

export function HelpMenu({ className }: HelpMenuProps) {
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)
  const [erConsultEnabled, setErConsultEnabledState] = useState<boolean | null>(null)

  useEffect(() => {
    void (async () => {
      const settings = await getERConsultSettings()
      setErConsultEnabledState(settings.enabled)
    })()
  }, [])

  async function toggleErConsult(next: boolean): Promise<void> {
    setErConsultEnabledState(next)
    await setERConsultSettings({ enabled: next })
    if (!next) {
      // Discard any pending consult — user intent is "stop the feature now",
      // not "skip this one". No log row written.
      await discardActiveERConsult()
    }
  }

  function toggle(id: string) {
    setExpandedId((cur) => (cur === id ? null : id))
  }

  // §9.5.6 — reset surface-hint + milestone-tip flags so they re-fire.
  // `completedSteps` (onboarding) intentionally NOT touched; players who want
  // to redo onboarding should clear local storage.
  async function resetHints() {
    setResetting(true)
    setResetMsg(null)
    const db = getHospitalDB()
    await db.transaction('rw', db.gameCounters, async () => {
      const row = await db.gameCounters.get('singleton')
      if (!row) return
      const completedSteps = row.tutorial?.completedSteps ?? {}
      await db.gameCounters.put({
        ...row,
        tutorial: { completedSteps, firstVisit: {}, firedTips: {} },
      })
    })
    setResetting(false)
    setResetMsg('✓ 已重設提示。返回各頁面會再次看到 💡 卡片與里程碑 toast。')
  }

  return (
    <>
      <button
        type="button"
        className={`help-menu-fab ${className ?? ''}`}
        onClick={() => setOpen(true)}
        aria-label="開啟說明選單"
        title="說明"
      >
        ❓
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal frame help-menu-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="遊戲說明"
          >
            <header className="help-menu__head">
              <h2 className="modal__title">遊戲說明</h2>
              <button
                type="button"
                className="help-menu__close"
                onClick={() => setOpen(false)}
                aria-label="關閉"
              >
                ×
              </button>
            </header>
            <ul className="help-menu__sections" role="list">
              {SECTIONS.map((section) => {
                const expanded = expandedId === section.id
                return (
                  <li key={section.id} className="help-menu__section">
                    <button
                      type="button"
                      className={`help-menu__row ${expanded ? 'help-menu__row--expanded' : ''}`}
                      onClick={() => toggle(section.id)}
                      aria-expanded={expanded}
                    >
                      <span className="help-menu__icon" aria-hidden>{section.icon}</span>
                      <span className="help-menu__title">{section.title}</span>
                      <span className="help-menu__chevron" aria-hidden>{expanded ? '▼' : '▶'}</span>
                    </button>
                    {expanded && (
                      <div className="help-menu__body">
                        {section.body.map((paragraph, i) => (
                          <p key={i}>{paragraph}</p>
                        ))}
                        {section.id === 'bug-report' && (
                          <button
                            type="button"
                            className="settings-modal__reset-btn"
                            onClick={() => setBugReportOpen(true)}
                          >
                            💬 開啟回報表單
                          </button>
                        )}
                        {section.id === 'er-consult' && erConsultEnabled !== null && (
                          <label className="help-menu__toggle-row">
                            <input
                              type="checkbox"
                              role="switch"
                              checked={erConsultEnabled}
                              onChange={(e) => void toggleErConsult(e.target.checked)}
                            />
                            <span>
                              {erConsultEnabled ? '✓ 已啟用急診照會' : '✗ 已關閉急診照會'}
                            </span>
                          </label>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            <footer className="help-menu__foot">
              <p className="muted">
                提示：完成首次教學後可在此查閱所有機制。
              </p>
              <button
                type="button"
                className="settings-modal__reset-btn"
                onClick={() => void resetHints()}
                disabled={resetting}
              >
                {resetting ? '重設中…' : '重新顯示所有提示'}
              </button>
              {resetMsg && <p className="settings-modal__reset-msg">{resetMsg}</p>}
            </footer>
          </div>
        </div>
      )}
      <BugReportModal isOpen={bugReportOpen} onClose={() => setBugReportOpen(false)} />
    </>
  )
}
