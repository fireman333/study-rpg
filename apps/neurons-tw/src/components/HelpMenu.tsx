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
import BugReportModal from './BugReportModal'
import { EmojiIcon } from './EmojiIcon'
import { getExpeditionHidden, setExpeditionHiddenPref } from '../lib/expedition-visibility'
import { requestReplayGuided, onReplayGuided } from '../lib/services/onboarding'
import { useAuth } from '../lib/auth/AuthContext'
import { resetNeuronsAccountData } from '../lib/services/account-reset'
import { OfflineAllPdfControl } from './OfflineAllPdfControl'

interface Section {
  id: string
  icon: string
  title: string
  body: React.ReactNode
}

/** Shared "pill" button recipe for inline HelpMenu controls (toggle / replay). */
const helpPillButtonStyle: React.CSSProperties = {
  padding: '0.15rem 0.6rem',
  background: '#f4ecd8',
  color: '#6b5436',
  border: '1px solid #b8893a',
  borderRadius: 999,
  fontFamily: 'inherit',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
}

/**
 * Inline control inside the 出征模式 help section to show/hide the decorative
 * expedition animation band (tidy-neurons-homepage-ui). The on-band × hides it;
 * this is the restore path now that the persistent on-maze toggle chip is removed.
 */
function ExpeditionAnimationHelpControl(): JSX.Element {
  const [hidden, setHidden] = useState(getExpeditionHidden)
  const toggle = (): void => {
    const next = !hidden
    setHidden(next)
    setExpeditionHiddenPref(next)
  }
  return (
    <p>
      <strong>遠征動畫</strong>：出征 + 閱讀時，腦圖上方會有一條神經元小隊行進的裝飾動畫，自動播放。
      覺得干擾可點動畫右上角的 ×，或在這裡關閉／恢復：{' '}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!hidden}
        style={helpPillButtonStyle}
      >
        <EmojiIcon char="🚀" size={14} decorative /> {hidden ? '顯示遠征動畫' : '隱藏遠征動畫'}
      </button>
    </p>
  )
}

/**
 * 「♻ 重置此帳號進度」 (add-neurons-account-reset) — signed-in-gated destructive
 * action: cloud save overwritten empty + reset broadcast, local synced data
 * wiped, leaderboard row deleted (nickname freed). Device prefs / onboarding
 * records / signed-in identity survive. Confirm dialog mirrors the
 * AccountSwitchConfirmModal visual language.
 */
function AccountResetControl(): JSX.Element {
  const { status, user } = useAuth()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (status !== 'authed' || !user) {
    return (
      <p>
        重置會清空這個<strong>帳號</strong>的雲端與本機遊戲進度，需要先登入 Google
        帳號才能執行（右上角「登入」）。
      </p>
    )
  }

  const runReset = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await resetNeuronsAccountData()
      setDone(true)
      setConfirmOpen(false)
    } catch (err) {
      console.warn('[account-reset] failed', err)
      setError('重置失敗（雲端尚未清除、本機資料未動），請檢查網路後再試一次。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p>
        把這個帳號的進度<strong>全部歸零、砍掉重練</strong>。會清除：雲端存檔、
        這台裝置的本機進度、排行榜紀錄（暱稱釋出給其他玩家使用）。會保留：登入狀態、
        裝置偏好與教學紀錄。其他裝置會在下次同步時自動跟著清空。
      </p>
      {done ? (
        <p>
          <strong>✓ 已重置完成</strong> — 所有進度歸零，可以直接重新開始。
        </p>
      ) : (
        <p>
          <button type="button" style={helpResetButtonStyle} onClick={() => setConfirmOpen(true)}>
            ♻ 重置此帳號進度
          </button>
        </p>
      )}
      {confirmOpen && (
        <div style={resetOverlayStyle} role="dialog" aria-modal="true" aria-labelledby="account-reset-title">
          <div style={resetCardStyle}>
            <h2 id="account-reset-title" style={resetTitleStyle}>
              ♻ 重置此帳號進度
            </h2>
            <p style={resetBodyStyle}>
              即將清除這個帳號的：<strong>雲端存檔</strong>、<strong>本機遊戲進度</strong>
              、<strong>排行榜紀錄</strong>（暱稱會釋出）。
            </p>
            <p style={resetBodyStyle}>保留：登入狀態、裝置偏好與教學紀錄。</p>
            <p style={resetDangerStyle}>此操作無法復原。</p>
            {error && <p style={resetErrorStyle}>{error}</p>}
            <div style={resetButtonRowStyle}>
              <button
                type="button"
                style={resetCancelButtonStyle}
                disabled={busy}
                onClick={() => {
                  setConfirmOpen(false)
                  setError(null)
                }}
              >
                取消
              </button>
              <button type="button" style={resetConfirmButtonStyle} disabled={busy} onClick={() => void runReset()}>
                {busy ? '重置中…' : '確定重置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const helpResetButtonStyle: React.CSSProperties = {
  ...helpPillButtonStyle,
  background: '#fbeaea',
  color: '#a4262c',
  border: '1px solid #a4262c',
}

const resetOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1200,
  fontFamily: 'var(--font-pixel-cjk)',
  padding: '1rem',
}

const resetCardStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '3px solid #b58900',
  borderRadius: '8px',
  padding: '1.25rem 1.5rem',
  width: 'min(440px, 92vw)',
  maxHeight: '90vh',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.7rem',
  color: '#1a1410',
  boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
}

const resetTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#8a3b12',
}

const resetBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  lineHeight: 1.6,
  color: '#5a3f29',
}

const resetDangerStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  fontWeight: 700,
  color: '#a4262c',
}

const resetErrorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  color: '#a4262c',
  fontWeight: 700,
}

const resetButtonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.6rem',
  justifyContent: 'flex-end',
  marginTop: '0.4rem',
}

const resetCancelButtonStyle: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  background: '#e8ddc3',
  border: '2px solid #8a7a55',
  borderRadius: '6px',
  color: '#5a3f29',
  cursor: 'pointer',
}

const resetConfirmButtonStyle: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  background: '#a4262c',
  border: '2px solid #7a1a1f',
  borderRadius: '6px',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
}

const GITHUB_ISSUES_URL = 'https://github.com/fireman333/study-rpg/issues/new'

/**
 * Replay control for the first-run guided tour
 * (rebuild-neurons-onboarding-as-guided-tour): asks the OnboardingHost to
 * re-run the tour from the welcome card. The HelpMenu panel closes itself via
 * its own `onReplayGuided` subscription so the tour shows.
 */
function GuidedReplayControl(): JSX.Element {
  return (
    <p>
      第一次玩會有一段互動導覽：先用歡迎卡講一遍核心循環，再一步步用聚光燈框出
      📖 閱讀、答題、腦圖、儀表板，直到你抽出第一隻神經元。想重看可以按這裡：{' '}
      <button
        type="button"
        onClick={requestReplayGuided}
        style={helpPillButtonStyle}
      >
        <EmojiIcon char="🧭" size={14} decorative /> 重看新手引導
      </button>
    </p>
  )
}

/** Body of the「原始詳解 PDF」help section — web auto-fetches each booklet from the official Drive. */
function SourcePdfHelpBody(): JSX.Element {
  return (
    <>
      <p>
        答題詳解下方會出現「📄 看原始詳解 PDF」，會自動從陽明官方 Google Drive 載入該題所在頁，
        手機 / Safari 也能用 —— 不用下載、不用授權資料夾。第一次開某份會稍等載入，之後就會直接從本機快取開啟。
        本 App 不提供 PDF、只連到官方來源（陽明國考考古題小組）。
      </p>
      <p>想離線也能看？可一次把全部詳解下載到本機：</p>
      <OfflineAllPdfControl />
    </>
  )
}

const SECTIONS: Section[] = [
  {
    id: 'onboarding',
    icon: '🧭',
    title: '新手引導',
    body: (
      <>
        <GuidedReplayControl />
        <p>
          <strong>一句話玩法</strong>：像考生一樣唸書 ＋ 做題，每一分鐘閱讀、每一題答對都變成能量，
          推著你的神經元在腦圖上前進；走到腦區就抽出一隻神經元收進圖鑑。答錯的題會進「錯題出征」，
          重新答對＝修復腦圖連線、還能抽 DMN 命運卡。
        </p>
        <p>
          <strong>名詞小辭典</strong>（想知道背後的神經科學再看）：
        </p>
        <ul style={{ margin: '0.2rem 0', paddingLeft: '1.1rem', lineHeight: 1.6 }}>
          <li>
            <strong>生長錐（growth cone）</strong>：神經發育時在前端探路的構造 —
            腦圖上替你前進、收集神經元的那隻就是它。
          </li>
          <li>
            <strong>白質束</strong>：大腦各區之間的神經纖維「高速公路」— 腦圖上的路徑。
          </li>
          <li>
            <strong>突觸（synapse）</strong>：兩個神經元之間的連接點 —
            同一天出征修復不同科，就在它們之間長出突觸連線。
          </li>
          <li>
            <strong>Hebbian（赫布理論）</strong>：「一起激發的神經元會連在一起」—
            這款遊戲連線機制的科學依據。
          </li>
        </ul>
      </>
    ),
  },
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
    id: 'question-bank',
    icon: '📚',
    title: '題庫總覽',
    body: (
      <>
        <p>
          <a href="/bank">/bank</a> 是歷年國考全題庫的瀏覽器，可按
          <strong>科別 / 年份 / 次別 / 冊別</strong>篩選找特定主題，每題附 🐞 回報按鈕。
        </p>
        <p>想針對特定範圍練習、或翻找之前做過的題目時就來這。</p>
      </>
    ),
  },
  {
    id: 'expedition',
    icon: '⚔️',
    title: '出征模式',
    body: (
      <>
        <p>
          <strong>出征</strong>是 neurons 的主玩法 — 把曾經答錯的題目重新答對叫一次「<strong>修復</strong>」。
          修復同時做兩件事：給 walker 賺能量推進腦圖，以及驅動連線形成。
        </p>
        <p>
          <strong>錯題出征</strong>自動從你的歷史錯題抽 ~10 題、隨機跨科。
          清完出征裡的錯題會發 DMN 抽卡 — 清越多、抽越多。
        </p>
        <p>
          想單純練整份考卷？到 <a href="/bank">題庫</a> tab 的 <strong>📋 模考</strong>
          （指定年份 + 次別 + 冊別，整冊 ~100 題依序作答）。模考是
          <strong>純練習</strong>：不給能量、不抽神經元、不長連線、也不發 DMN 抽卡，
          但答錯仍記入錯題清單，可之後出征修復。
        </p>
        <ExpeditionAnimationHelpControl />
      </>
    ),
  },
  {
    id: 'wrong-review',
    icon: '📋',
    title: '錯題複習',
    body: (
      <>
        <p>
          <a href="/bookmarks">/bookmarks</a> 頁面三個 tab：
          <strong>手動收藏</strong>（你按 ⭐ 的）、
          <strong>目前未答對</strong>（最近一次答錯）、
          <strong>歷史曾錯</strong>（曾經答錯過的全部、永久保留）。
        </p>
        <p>「歷史曾錯」永遠不會自動消失，方便長期追蹤弱點。共用同一條 filter（科目 / 年份 / ✨ 🤔 標記）。</p>
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
          共 10 個變體 slot（越常見的 tier 變體越多；P0 始源為每科唯一的超稀有 apex）。
        </p>
        <p>
          收集走<strong>抽卡</strong>：答對題目（+3）與唸書（每分鐘 +2）累積<strong>神經能量</strong>，
          每抽花 20 點、指定 family 抽一隻。稀有度由權重決定（P5 最常見 … P0 最稀有，附軟保底），
          抽到已擁有的會變重複（copies +1）。不用付費、純靠唸書。
        </p>
        <p>
          11 科 × 10 第一路線 slot = 110 隻，加上每科二回目位置變體再 +110，合計 <strong>220 隻</strong>為完整收集
          （二回目機制詳見「🌟 首答 + 二回目」）。進度顯示在頂部 status chip 的「🧬 變體 X / 220」。
        </p>
      </>
    ),
  },
  {
    id: 'first-pull-second-lap',
    icon: '🌟',
    title: '首答 + 二回目',
    body: (
      <>
        <p>
          <strong>每科首次答題</strong>（不管對錯）會送你該科一隻 P5 變體，自動成為該科<strong>代表</strong> —
          下次走腦圖時，就是這隻代表在 walker head 前進。
        </p>
        <p>
          集滿一科的第一路線 10 隻後，該科進入<strong>二回目</strong>：walker 沿更長的第二條路線走，
          沿路解鎖位置變體（同一隻立繪在不同腦區會變色調）。整體收集目標 220 隻就是這樣分兩階段。
        </p>
      </>
    ),
  },
  {
    id: 'synapse-formation',
    icon: '🔗',
    title: '連線形成（一起修復，一起連起來）',
    body: (
      <>
        <p>
          連線由 <strong>出征（錯題修復）</strong> 驅動：在一次出征裡把<strong>原本答錯</strong>的題改答對叫一次「修復」。
          同一天有 <strong>≥2 科</strong>、每科各修復 <strong>≥2 題</strong>，且當天達「有效出征完成」（今日修復滿 5 題），
          這些科就兩兩長出一條 <strong>連線</strong>（每天最多 3 條）。一般隨機答題的對錯<strong>不會</strong>形成連線。
        </p>
        <p>
          <strong>不同日</strong>再次一起修復，連線會越來越強、線越粗。
        </p>
        <p>
          <strong>突觸傳導</strong>：連起來的兩科，當你讀其中一科 / 修它的錯題、結算時會有一顆 pulse 沿線把
          一小段能量（weak +6% / strong +12%、有每日上限）傳給鄰科 — 你看到的那道電流就是好處本身。
          連線只加分、不扣分；沒連線就是原本的基準。
        </p>
        <p>
          這就是 Hebb 那句「Neurons that fire together, wire together」，在這裡是「<strong>repair together, wire together</strong>」。
        </p>
      </>
    ),
  },
  {
    id: 'connector-neuron',
    icon: '🔌',
    title: '連結神經元',
    body: (
      <>
        <p>
          兩科之間的連線第一次<strong>變得夠強</strong>時，會解鎖一隻「<strong>連結神經元</strong>」立繪
          （橋接兩科的 hub neuron）。
        </p>
        <p>
          11 科兩兩配對都有專屬的連結神經元，純收集、不能抽 — 把該配對的連線練強是唯一途徑。
          在「<a href="/collection">圖鑑</a>」可看已收集的連結神經元。
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
          共 22 張卡（4 階稀有度：P1 鑽石 ×2 / P2 金 ×5 / P3 銀 ×7 / P4 銅 ×8），
          抽到的卡同時觸發一次性事件 + 進入永久收集。
        </p>
        <p>
          <strong>出征觸發</strong>：每場 ⚔️ 出征清掉約 25% / 50% 目前錯題各 +1 draw（每日上限 2）。
          清越多錯題、抽得越多——把弱點變成抽卡機會。
        </p>
        <p>
          <strong>行為軸觸發</strong>：變體解鎖各 +1 draw（每日上限 3）。
        </p>
        <p>
          抽到的消耗品進背包、自選時機啟用：family-buff（某 family 能量水龍頭 ×2、1 hr）、
          surge（探索速度短暫提升）、bolus（迷宮能量短暫湧入）、
          variant-rate-up（下次抽卡 roll 兩次取較稀有）、quick-review-batch（5 題錯題快速複習，出征 mini-batch）、
          hidden-reveal（在 /dmn 頁顯示下一張未抽 P1 的剪影提示）。低機率抽到永久裝備/夥伴。
        </p>
        <p>
          全收集 + 永久陳列在「圖鑑 → <a href="/dmn">DMN</a>」分頁。
        </p>
      </>
    ),
  },
  {
    id: 'acceleration',
    icon: '⚡',
    title: '加速系統',
    body: (
      <>
        <p>
          DMN 抽到的東西分兩種：<strong>消耗品</strong>（進背包、自選時機啟用、有時限）+
          <strong>永久裝備</strong>（P1–P5 稀有度，永遠生效）。
        </p>
        <p>
          兩者都會疊加進兩個加速池：<strong>能量倍率</strong>（唸書 / 答對賺能量變快）+
          <strong>速度倍率</strong>（walker 走腦圖變快）。
          兩池都有硬上限（×2.5 / ×2.0），不會破壞節奏。
        </p>
      </>
    ),
  },
  {
    id: 'companion',
    icon: '🐛',
    title: '活體夥伴',
    body: (
      <>
        <p>
          永久裝備裡有一類是<strong>活體膠細胞夥伴</strong>（少突膠細胞 / 星形膠細胞）—
          它們不只給數值，還會在你出征時以小夥伴姿態跟著 walker 一起走。
        </p>
        <p>是純視覺加成，數值效果跟其他永久裝備一樣走加速池。</p>
      </>
    ),
  },
  {
    id: 'achievements',
    icon: '🏅',
    title: '成就',
    body: (
      <>
        <p>
          「圖鑑 → <a href="/achievements">成就</a>」分頁共 33 條 × 4 階
          （<strong>P1 鑽石 / P2 金 / P3 銀 / P4 銅</strong>），分 7 大類
          （學習 / 答題 / 變體 / 連線 / 精通 / 時運 / 隱藏）。
        </p>
        <p>
          <strong>P1 鑽石</strong>只給「綜合條件」（多面向同時達成）才解，純磨單一數字解不到。
          解鎖會自動掛在你的排行榜暱稱旁（最多 6 個徽章），部分送稱號可在 settings 切換。
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
          <strong>Opt-in</strong>：到「社群 → <a href="/leaderboard">排名</a>」分頁 → 點「公開到排行榜」
          → 設定 2–12 字的暱稱（NFKC + 小寫 normalize 撞名檢查）→ 同意公開即上榜。
          完全不上榜也可以正常玩，所有資料留在本機。
        </p>
        <p>
          公開的欄位：暱稱 / 變體解鎖數 / Action Potential 總量 / 累積唸書時間 / 探索進度（settle 數）。
          配 5 種 filter 分類：綜合排名 / 變體收集 / AP 排名 / 累積唸書時間 / 探索進度。
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
          發現 bug 或有建議？直接在 app 內回報最快 —— 會自動附上你目前的頁面、
          遊戲狀態統計與最近的錯誤訊息，省去你描述環境的功夫（每一項都可逐項取消）。
        </p>
        <p>
          需要先登入（避免匿名灌水、方便我們在你同意時追問）。也歡迎直接開{' '}
          <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
            GitHub Issue
          </a>{' '}
          或 PR。
        </p>
      </>
    ),
  },
  {
    id: 'source-pdf',
    icon: '📄',
    title: '原始詳解 PDF',
    body: <SourcePdfHelpBody />,
  },
  {
    id: 'account-reset',
    icon: '♻',
    title: '重置此帳號進度',
    body: <AccountResetControl />,
  },
]

export default function HelpMenu(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bugOpen, setBugOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  // Close the panel when the guided replay is requested so the overlay is visible.
  useEffect(() => onReplayGuided(() => setIsOpen(false)), [])

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
          font-family: var(--font-pixel-cjk);
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
          /* Teaching prose = legible (opt out of the global pixel default).
           * kbd / code chips below keep pixel-mono via more-specific selectors. */
          font-family: var(--font-legible);
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
          font-family: var(--font-pixel-num);
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
          font-family: var(--font-pixel-num);
          font-size: 0.92em;
        }
        .neurons-help-bugreport-btn {
          margin-top: 0.6rem;
          padding: 0.45rem 0.9rem;
          border-radius: 6px;
          border: 1px solid #b8893a;
          background: #d4a04d;
          color: #fff;
          font-family: inherit;
          font-weight: 700;
          font-size: 0.86rem;
          cursor: pointer;
        }
        .neurons-help-bugreport-btn:hover {
          background: #c8923f;
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
        <EmojiIcon char="❓" size={22} decorative />
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
              <h2>
                <EmojiIcon char="📖" size={16} decorative /> 說明選單
              </h2>
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
                          <EmojiIcon char={section.icon} size={20} decorative />
                        </span>
                        <span>{section.title}</span>
                      </summary>
                      <div className="neurons-help-body">
                        {section.body}
                        {section.id === 'bug-report' && (
                          <button
                            type="button"
                            className="neurons-help-bugreport-btn"
                            onClick={() => setBugOpen(true)}
                          >
                            <EmojiIcon char="🩺" size={15} decorative /> 開啟回報表單
                          </button>
                        )}
                      </div>
                    </details>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}

      <BugReportModal open={bugOpen} onClose={() => setBugOpen(false)} />
    </>
  )
}
