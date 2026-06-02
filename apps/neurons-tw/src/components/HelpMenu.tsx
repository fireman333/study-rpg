/**
 * HelpMenu — global floating ❓ FAB + accordion panel covering neurons mechanics.
 *
 * Mounted at App level (inside AuthProvider, outside Routes) so the FAB
 * persists across every route (Overview / Connectome / DMN / Achievements /
 * Leaderboard).
 *
 * Sections (initial 6 — port more as new capabilities ship):
 *   ⌨️ 鍵盤快捷鍵 / 🧬 變體解鎖 / 🔗 Synapse 形成 /
 *   💎 DMN 抽卡 / 🏆 排行榜 / 🩺 回報問題
 *
 * Sister to 二階 HelpMenu but scope-down (no Supabase bug-report form, no
 * font-mode toggle, no ER consult banner — neurons mechanics only).
 *
 * Spec: openspec/specs/neurons-mode/spec.md
 *   "Neurons-tw SHALL surface a global HelpMenu accessible from every route"
 */

import { useEffect, useState } from 'react'

interface Section {
  id: string
  icon: string
  title: string
  body: React.ReactNode
}

const GITHUB_ISSUES_URL = 'https://github.com/fireman333/study-rpg/issues/new'

const SECTIONS: Section[] = [
  {
    id: 'hotkeys',
    icon: '⌨️',
    title: '鍵盤快捷鍵',
    body: (
      <>
        <p>
          <strong>題目階段</strong>：按 <kbd>1</kbd>、<kbd>2</kbd>、<kbd>3</kbd>、
          <kbd>4</kbd> 標記 A/B/C/D 選項；按 <kbd>Enter</kbd> 送出已標記的答案。
          標記後再按其他數字鍵會切換標記，不會自動送出。
        </p>
        <p>
          <strong>答題後階段</strong>：按 <kbd>Enter</kbd> 或 <kbd>Space</kbd> 進入下一題；
          按 <kbd>1</kbd> 收藏、<kbd>2</kbd> 標 ✨ 太簡單、<kbd>3</kbd> 標 🤔 我亂猜的
          （✨ / 🤔 之後用來篩選複習）。
          按答案後 150 ms 內的 Enter 會被忽略，避免「送出 + 立刻 advance」二連跳。
        </p>
        <p>
          <strong>翻頁 / 滾動</strong>：長題幹 / 詳解時用 <kbd>Space</kbd> 翻頁向下、
          <kbd>Shift+Space</kbd> 翻頁向上、<kbd>↓</kbd> <kbd>↑</kbd> 微捲 40 px、
          <kbd>Home</kbd> <kbd>End</kbd> 跳到題目頂 / 底。
        </p>
        <p>
          <strong>關閉</strong>：任何時候按 <kbd>Esc</kbd> 直接關掉答題視窗。
          滑鼠點選項仍維持「click 即送出」的原本行為（不需要先標記）。
        </p>
      </>
    ),
  },
  {
    id: 'bookmark',
    icon: '⭐',
    title: '收藏題目',
    body: (
      <>
        <p>
          答題時按右下角 <strong>⭐ 收藏</strong> 按鈕，或在答完後按 <kbd>1</kbd> 鍵
          加入 / 取消收藏。所有收藏統一在 <a href="/bookmarks">收藏</a> 頁面整理。
        </p>
        <p>
          收藏會跨裝置同步（需登入 Google）。每張卡片附「重新作答」按鈕可單題複習。
          卡片可顯示 ✨ / 🤔 標記，<a href="/bookmarks">收藏</a> 頁面可按 family
          + ✨ / 🤔 篩選。
        </p>
      </>
    ),
  },
  {
    id: 'variant-unlock',
    icon: '🧬',
    title: '變體收集（抽卡）',
    body: (
      <>
        <p>
          每個 family（如 藥理學 = VTA Dopaminergic）有 P0–P5 稀有度<strong>金字塔</strong>，
          共 7 個變體 slot（越常見的 tier 變體越多；P0 始源為每科唯一的超稀有 apex）。
        </p>
        <p>
          收集走<strong>抽卡</strong>：答對題目（+3）與唸書（每分鐘 +2）累積<strong>神經能量</strong>，
          每抽花 20 點、指定 family 抽一隻。稀有度由權重決定（P5 最常見 … P0 最稀有，附軟保底），
          抽到已擁有的會變重複（copies +1）。不用付費、純靠唸書。
        </p>
        <p>
          11 個 family × 7 slot = 77 variants 為完整收集目標。
          整體進度顯示在 Overview 頂部 status chip 的「🧬 變體 X / 77」。
        </p>
      </>
    ),
  },
  {
    id: 'synapse-formation',
    icon: '🔗',
    title: 'Synapse 形成',
    body: (
      <>
        <p>
          <strong>同一天內</strong>，跨兩個不同 family 各答對 5 題，就會在這兩個 family
          之間長出一條 <strong>weak synapse</strong>（細虛線）。例如同一天答對 5 題 藥理學 +
          5 題 病理學 → 這兩 family 之間 wire 起來。
        </p>
        <p>
          已存在的 synapse 持續被「兩端 family 同日 co-fire」喂養會升級成
          <strong> strong synapse</strong>（線越粗代表累積越強）。
        </p>
        <p>
          連續 7 天兩端都沒 co-fire，synapse 會 decay 一級（strong → weak → dormant）。
          樹上的對應做法：連線越久沒共激發就越<strong>暗</strong>，重新 co-fire 立刻再<strong>亮</strong>起來。
          但 synapse <strong>永遠不會消失</strong>（LTD 不 rupture），最弱也只是一條暗淡的細線。隔天歸零的「同日 5 題」 counter 在午夜重置。
        </p>
        <p>
          這就是 Hebb 那句「Neurons that fire together, wire together」。
          連結組樹就是首頁本身 — 線的<strong>粗細＝累積強度</strong>、<strong>亮度＝近期共激發</strong>。
        </p>
      </>
    ),
  },
  {
    id: 'dmn-draws',
    icon: '💎',
    title: 'DMN 抽卡',
    body: (
      <>
        <p>
          <strong>Default Mode Network (DMN)</strong> 抽卡是 neurons 的彩蛋系統，
          共 20 張卡（4 階稀有度：P1 鑽石 ×2 / P2 金 ×4 / P3 銀 ×6 / P4 銅 ×8），
          抽到的卡同時觸發一次性事件 + 進入永久收集。
        </p>
        <p>
          <strong>時間軸觸發</strong>：累積閱讀每 30 min +1 draw（每日上限 2）。
          <em>（reading-timer 在後續 release 接上後啟用，目前 inactive。）</em>
        </p>
        <p>
          <strong>行為軸觸發</strong>：變體解鎖 / synapse 形成 / synapse 強化各 +1 draw
          （每日上限 3）。
        </p>
        <p>
          5 種一次性事件：family-buff（隨機 family AP +2/正確、1 hr）、
          variant-rate-up（下次 slot 解鎖權重提升）、quick-review-batch（5 道 SRS due 題彈出）、
          streak-shield（下次 streak 斷掉時免疫）、hidden-reveal（在 /dmn 頁顯示下一張未抽 P1 的剪影提示）。
        </p>
        <p>
          全收集 + 永久陳列在「<a href="/dmn">DMN</a>」頁面。
        </p>
      </>
    ),
  },
  {
    id: 'leaderboard',
    icon: '🏆',
    title: '排行榜',
    body: (
      <>
        <p>
          <strong>Opt-in</strong>：到「<a href="/leaderboard">排行榜</a>」頁面 → 點「公開到排行榜」
          → 設定 2–12 字的暱稱（NFKC + 小寫 normalize 撞名檢查）→ 同意公開即上榜。
          完全不上榜也可以正常玩，所有資料留在本機。
        </p>
        <p>
          公開的 5 欄位：暱稱 / 變體解鎖數 / Synapse 形成數 / DMN 收集數 / 累積閱讀分鐘。
          配 6 種 filter：總分綜合 / 變體數 / synapse 數 / DMN 數 / 累積閱讀 / 最近活動。
        </p>
        <p>
          <strong>退出 / 改名</strong>：同一頁的 settings panel 可以改名（會再查一次撞名）
          、或點「退出排行榜」永久移除自己的 row（D1 hard delete）。
        </p>
      </>
    ),
  },
  {
    id: 'bug-report',
    icon: '🩺',
    title: '回報問題',
    body: (
      <>
        <p>
          目前 neurons 尚未接 in-app 回報。請開 <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
          GitHub Issue</a>{' '}並在 title 或 label 加上「<code>neurons</code>」標籤，
          幫助分流。
        </p>
        <p>
          回報請附上：(1) 觸發步驟、(2) 預期 vs 實際行為、(3) 視窗大小 / 瀏覽器版本、
          (4) 任何 console 錯誤訊息（F12 → Console）。也歡迎直接 PR。
        </p>
      </>
    ),
  },
]

export default function HelpMenu(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  function toggleSection(id: string): void {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <>
      <style>{`
        .neurons-help-fab {
          position: fixed;
          top: 1rem;
          right: 1rem;
          z-index: 900;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #fdf6e3;
          border: 2px solid #8c6d4a;
          color: #5a3f29;
          font-size: 1.3rem;
          line-height: 1;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(58, 42, 26, 0.18);
          transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        }
        .neurons-help-fab:hover {
          background: #f5e6d3;
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(58, 42, 26, 0.25);
        }
        .neurons-help-fab[aria-expanded="true"] {
          background: #d4a04d;
          color: #fff;
          border-color: #b8893a;
        }

        .neurons-help-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(20, 12, 30, 0.4);
          z-index: 950;
        }

        .neurons-help-panel {
          position: fixed;
          top: 4rem;
          right: 1rem;
          width: 100%;
          max-width: 480px;
          max-height: calc(100vh - 6rem);
          overflow-y: auto;
          background: #fdf8ee;
          border: 2px solid #d4a04d;
          border-radius: 10px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
          z-index: 960;
          font-family: 'Cubic 11', 'Noto Sans TC', sans-serif;
          color: #3a2a1a;
        }

        .neurons-help-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #d4c4a0;
          background: #f5e6d3;
        }
        .neurons-help-header h2 {
          margin: 0;
          font-size: 1rem;
          color: #5a3f29;
        }
        .neurons-help-close {
          background: transparent;
          border: none;
          font-size: 1.1rem;
          cursor: pointer;
          color: #8c6d4a;
          padding: 0.2rem 0.45rem;
          font-family: inherit;
        }
        .neurons-help-close:hover {
          background: #fdf6e3;
          border-radius: 3px;
        }

        .neurons-help-sections {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .neurons-help-section {
          border-bottom: 1px solid #ebd9bf;
        }
        .neurons-help-section:last-child {
          border-bottom: none;
        }
        .neurons-help-section details {
          margin: 0;
        }
        .neurons-help-section summary {
          padding: 0.7rem 1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-weight: 700;
          font-size: 0.95rem;
          color: #5a3f29;
          list-style: none;
        }
        .neurons-help-section summary::-webkit-details-marker { display: none; }
        .neurons-help-section summary::after {
          content: '＋';
          margin-left: auto;
          color: #8c6d4a;
          font-weight: 400;
        }
        .neurons-help-section details[open] summary::after {
          content: '−';
        }
        .neurons-help-section summary:hover {
          background: #fdf6e3;
        }
        .neurons-help-section-icon {
          font-size: 1.2rem;
        }
        .neurons-help-body {
          padding: 0.2rem 1rem 0.9rem;
          font-size: 0.85rem;
          line-height: 1.6;
          color: #3a2a1a;
        }
        .neurons-help-body p {
          margin: 0.4rem 0;
        }
        .neurons-help-body kbd {
          display: inline-block;
          padding: 0.04rem 0.32rem;
          margin: 0 0.1rem;
          background: #fdf6e3;
          border: 1px solid #8c6d4a;
          border-bottom-width: 2px;
          border-radius: 3px;
          font-family: 'VT323', 'Courier New', monospace;
          font-size: 0.92em;
          color: #3a2a1a;
          line-height: 1;
        }
        .neurons-help-body a {
          color: #b8893a;
          text-decoration: underline;
        }
        .neurons-help-body code {
          background: #fdf6e3;
          border: 1px solid #c4a878;
          border-radius: 3px;
          padding: 0 0.25rem;
          font-family: 'VT323', 'Courier New', monospace;
          font-size: 0.92em;
        }

        @media (max-width: 600px) {
          .neurons-help-fab {
            top: auto;
            bottom: 1rem;
            right: 1rem;
          }
          .neurons-help-panel {
            top: auto;
            right: 0;
            left: 0;
            bottom: 0;
            width: 100%;
            max-width: none;
            max-height: 80vh;
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>

      <button
        type="button"
        className="neurons-help-fab"
        aria-label="開啟說明選單"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        ❓
      </button>

      {isOpen && (
        <>
          <div
            className="neurons-help-backdrop"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            className="neurons-help-panel"
            role="dialog"
            aria-modal="true"
            aria-label="說明選單"
          >
            <header className="neurons-help-header">
              <h2>📖 說明選單</h2>
              <button
                type="button"
                className="neurons-help-close"
                onClick={() => setIsOpen(false)}
                aria-label="關閉說明選單"
              >
                ✕
              </button>
            </header>
            <ul className="neurons-help-sections" role="list">
              {SECTIONS.map((section) => {
                const expanded = expandedId === section.id
                return (
                  <li key={section.id} className="neurons-help-section">
                    <details
                      open={expanded}
                      onToggle={(e) => {
                        const opened = (e.target as HTMLDetailsElement).open
                        if (opened) setExpandedId(section.id)
                        else if (expandedId === section.id) setExpandedId(null)
                      }}
                    >
                      <summary
                        onClick={(e) => {
                          // Control accordion via React state so single-expand works
                          // across siblings. Prevent default native toggle to avoid
                          // race with the onToggle handler above.
                          e.preventDefault()
                          toggleSection(section.id)
                        }}
                      >
                        <span className="neurons-help-section-icon" aria-hidden="true">
                          {section.icon}
                        </span>
                        <span>{section.title}</span>
                      </summary>
                      <div className="neurons-help-body">{section.body}</div>
                    </details>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </>
  )
}
