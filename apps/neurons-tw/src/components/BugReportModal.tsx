/**
 * BugReportModal — neurons-tw in-app structured bug / suggestion form
 * (add-neurons-bug-report). Opened from the HelpMenu「回報問題」section.
 *
 * Force sign-in: renders a sign-in CTA when no user (RLS requires auth.uid()).
 * Captures category + severity + free-text + per-field opt-out auto-context,
 * then inserts into Supabase `bug_reports` with app='neurons-tw'.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import {
  NEURONS_BUG_REPORT_CATEGORIES,
  BUG_REPORT_SEVERITIES,
  BUG_REPORT_REPRODUCIBILITY,
  type BugReportReproducibility,
  type BugReportSeverity,
} from '@study-rpg/core'
import { useAuth } from '../lib/auth/AuthContext'
import {
  submitBugReport,
  AUTO_CONTEXT_FIELDS,
  type AutoContextOptOuts,
} from '../lib/services/bug-report'

const CATEGORY_LABELS: Record<string, string> = {
  'app-stability': '🩺 當機 / 卡住',
  'maze-exploration': '🧭 迷宮探索',
  'variant-collection': '🧬 變體收集（抽卡）',
  synapse: '🔗 Synapse 連結',
  'dmn-fate-cards': '💎 DMN 抽卡',
  'study-session': '📖 答題 / 唸書',
  'numbers-wrong': '🔢 數值不對',
  'visual-glitch': '🎨 畫面破圖',
  'cloud-sync': '☁️ 雲端同步',
  corpus: '📚 題庫內容',
  'feature-request': '💡 功能建議',
  other: '❓ 其他',
}

const SEVERITY_LABELS: Record<BugReportSeverity, string> = {
  blocker: '🚫 卡住沒法玩',
  annoying: '😣 很煩但能玩',
  minor: '🐜 小問題',
  suggestion: '💡 建議',
}

const REPRO_LABELS: Record<BugReportReproducibility, string> = {
  always: '每次都會',
  sometimes: '有時候',
  once: '只發生一次',
  unsure: '不確定',
}

const AUTO_CONTEXT_LABELS: Record<string, string> = {
  app_version: '版本號',
  commit_sha: '版本 commit',
  route: '目前頁面',
  game_state: '遊戲狀態快照（純數字統計）',
  user_agent: '瀏覽器資訊',
  viewport: '視窗大小',
  recent_console_errors: '最近的 console 錯誤',
  sync_metadata: '同步診斷快照',
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function BugReportModal({ open, onClose }: Props): JSX.Element | null {
  const { user, signInWithGoogle } = useAuth()
  const [category, setCategory] = useState<string>('app-stability')
  const [severity, setSeverity] = useState<BugReportSeverity>('annoying')
  const [whatDoing, setWhatDoing] = useState('')
  const [whatHappened, setWhatHappened] = useState('')
  const [whatExpected, setWhatExpected] = useState('')
  const [repro, setRepro] = useState<BugReportReproducibility | ''>('')
  const [contact, setContact] = useState('')
  const [allowFollowup, setAllowFollowup] = useState(false)
  // Opt-out map: true = omit. Default all included (false).
  const [optOuts, setOptOuts] = useState<AutoContextOptOuts>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Reset to a fresh form each time the modal opens. This component stays mounted
  // (renders null when closed), so without this the previous submission's success
  // screen (result.ok) persists and reopening lands on 「已送出」 — the player had to
  // reload to file another report (回報 bug: 連續回報停在上次的回報完成畫面).
  useEffect(() => {
    if (!open) return
    setCategory('app-stability')
    setSeverity('annoying')
    setWhatDoing('')
    setWhatHappened('')
    setWhatExpected('')
    setRepro('')
    setContact('')
    setAllowFollowup(false)
    setOptOuts({})
    setSubmitting(false)
    setResult(null)
  }, [open])

  if (!open) return null

  const canSubmit = whatDoing.trim().length > 0 && whatHappened.trim().length > 0 && !submitting

  async function handleSubmit(): Promise<void> {
    if (!user || !canSubmit) return
    setSubmitting(true)
    setResult(null)
    const res = await submitBugReport(
      {
        category,
        severity,
        what_doing: whatDoing.trim(),
        what_happened: whatHappened.trim(),
        what_expected: whatExpected.trim() || undefined,
        reproducibility: repro || undefined,
        contact_info: contact.trim() || undefined,
        allow_followup: allowFollowup,
      },
      optOuts,
      { authStatus: 'authed', userId: user.id },
    )
    setSubmitting(false)
    if (res.ok) {
      setResult({ ok: true, msg: '✅ 已送出，謝謝你的回報！' })
    } else {
      setResult({ ok: false, msg: `送出失敗：${res.error}` })
    }
  }

  return (
    <div style={backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="回報問題">
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <header style={header}>
          <span>🩺 回報問題 / 建議</span>
          <button style={closeBtn} onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </header>

        {!user ? (
          <div style={body}>
            <p style={{ color: '#5a3f29', lineHeight: 1.7 }}>
              回報需要先登入（這樣才能在你同意時跟進，也避免匿名灌水）。
            </p>
            <button style={primaryBtn} onClick={() => void signInWithGoogle()}>
              使用 Google 登入
            </button>
          </div>
        ) : result?.ok ? (
          <div style={body}>
            <p style={{ color: '#4d8c4d', fontWeight: 600, margin: '1.5rem 0', textAlign: 'center' }}>
              {result.msg}
            </p>
            <button style={primaryBtn} onClick={onClose}>
              關閉
            </button>
          </div>
        ) : (
          <div style={body}>
            <label style={fieldLabel}>分類</label>
            <div style={chipWrap}>
              {NEURONS_BUG_REPORT_CATEGORIES.filter((c) => c !== 'desktop-app').map((c) => (
                <button
                  key={c}
                  type="button"
                  style={category === c ? chipActive : chip}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {CATEGORY_LABELS[c] ?? c}
                </button>
              ))}
            </div>

            <label style={fieldLabel}>嚴重程度</label>
            <div style={chipWrap}>
              {BUG_REPORT_SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  style={severity === s ? chipActive : chip}
                  aria-pressed={severity === s}
                  onClick={() => setSeverity(s)}
                >
                  {SEVERITY_LABELS[s]}
                </button>
              ))}
            </div>

            <label style={fieldLabel}>
              你當時在做什麼？<span style={req}>*</span>
            </label>
            <textarea
              style={textarea}
              value={whatDoing}
              onChange={(e) => setWhatDoing(e.target.value)}
              placeholder="例如：在 藥理學 抽卡 / 出征答題 / 看排行榜…"
              rows={2}
            />

            <label style={fieldLabel}>
              發生了什麼？<span style={req}>*</span>
            </label>
            <textarea
              style={textarea}
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              placeholder="實際看到的狀況 / 錯誤畫面…"
              rows={3}
            />

            <label style={fieldLabel}>你預期應該怎樣？（選填）</label>
            <textarea
              style={textarea}
              value={whatExpected}
              onChange={(e) => setWhatExpected(e.target.value)}
              rows={2}
            />

            <label style={fieldLabel}>重現頻率（選填）</label>
            <div style={chipWrap}>
              {BUG_REPORT_REPRODUCIBILITY.map((r) => (
                <button
                  key={r}
                  type="button"
                  style={repro === r ? chipActive : chip}
                  aria-pressed={repro === r}
                  onClick={() => setRepro(repro === r ? '' : r)}
                >
                  {REPRO_LABELS[r]}
                </button>
              ))}
            </div>

            <label style={fieldLabel}>聯絡方式（選填，方便我們追問）</label>
            <input
              style={input}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="email / Threads / Discord…"
            />
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={allowFollowup}
                onChange={(e) => setAllowFollowup(e.target.checked)}
              />
              <span>願意接受後續追問</span>
            </label>

            <details style={autoCtxBox}>
              <summary style={autoCtxSummary}>
                📎 一併附上的診斷資訊（可逐項取消）
              </summary>
              <div style={{ marginTop: '0.5rem' }}>
                {AUTO_CONTEXT_FIELDS.map((f) => (
                  <label key={f} style={checkRow}>
                    <input
                      type="checkbox"
                      checked={!optOuts[f]}
                      onChange={(e) =>
                        setOptOuts((prev) => ({ ...prev, [f]: !e.target.checked }))
                      }
                    />
                    <span>{AUTO_CONTEXT_LABELS[f] ?? f}</span>
                  </label>
                ))}
                <p style={autoCtxNote}>
                  遊戲狀態快照只含數字統計（變體數 / synapse 數 / 答題數…），不含任何個人資訊。
                </p>
              </div>
            </details>

            {result && !result.ok && <p style={errLine}>{result.msg}</p>}

            <div style={footerRow}>
              <button style={secondaryBtn} onClick={onClose}>
                取消
              </button>
              <button
                style={canSubmit ? primaryBtn : primaryBtnDisabled}
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
              >
                {submitting ? '送出中…' : '送出回報'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── styles (warm neurons palette, Cubic 11) ──────────────────────────────
const backdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(20, 12, 30, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  padding: '1rem',
}
const modal: CSSProperties = {
  background: '#fdf8ee',
  border: '2px solid #d4a04d',
  borderRadius: 10,
  boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
  width: '100%',
  maxWidth: 520,
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: 'var(--font-pixel-cjk)',
  color: '#3a2a1a',
}
const header: CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid #d4c4a0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: '#f5e6d3',
  fontWeight: 700,
  color: '#5a3f29',
}
const closeBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: '1.2rem',
  cursor: 'pointer',
  color: '#8c6d4a',
  padding: '0.2rem 0.5rem',
}
const body: CSSProperties = { padding: '1rem 1.1rem', overflowY: 'auto', flex: 1 }
const fieldLabel: CSSProperties = {
  display: 'block',
  fontWeight: 700,
  fontSize: '0.86rem',
  color: '#5a3f29',
  margin: '0.85rem 0 0.4rem',
}
const req: CSSProperties = { color: '#c44d4d', marginLeft: 2 }
const chipWrap: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }
const chip: CSSProperties = {
  padding: '0.32rem 0.6rem',
  borderRadius: 6,
  border: '1px solid #c4a878',
  background: 'transparent',
  color: '#5a3f29',
  fontSize: '0.82rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const chipActive: CSSProperties = {
  ...chip,
  background: '#d4a04d',
  color: '#fff',
  borderColor: '#b8893a',
  fontWeight: 600,
}
const textarea: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.5rem 0.6rem',
  borderRadius: 6,
  border: '1px solid #c4a878',
  background: '#fff',
  // User-typed prose — legible, never pixel.
  fontFamily: 'var(--font-legible)',
  fontSize: '0.9rem',
  color: '#3a2a1a',
  resize: 'vertical',
}
const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.45rem 0.6rem',
  borderRadius: 6,
  border: '1px solid #c4a878',
  background: '#fff',
  // User-typed text — legible, never pixel.
  fontFamily: 'var(--font-legible)',
  fontSize: '0.9rem',
  color: '#3a2a1a',
}
const checkRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
  fontSize: '0.84rem',
  color: '#5a3f29',
  margin: '0.4rem 0',
  cursor: 'pointer',
}
const autoCtxBox: CSSProperties = {
  marginTop: '0.9rem',
  padding: '0.5rem 0.7rem',
  border: '1px dashed #c9b890',
  borderRadius: 6,
  background: '#faf6ec',
}
const autoCtxSummary: CSSProperties = {
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.84rem',
  color: '#5a3f29',
}
const autoCtxNote: CSSProperties = {
  fontSize: '0.74rem',
  color: '#8a7a5a',
  lineHeight: 1.5,
  marginTop: '0.4rem',
}
const errLine: CSSProperties = {
  marginTop: '0.7rem',
  color: '#c44d4d',
  fontSize: '0.84rem',
  lineHeight: 1.5,
}
const footerRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.6rem',
  marginTop: '1.1rem',
}
const baseBtn: CSSProperties = {
  padding: '0.5rem 1.1rem',
  borderRadius: 6,
  fontSize: '0.92rem',
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid #d4a04d',
}
const primaryBtn: CSSProperties = { ...baseBtn, background: '#d4a04d', color: '#fff' }
const primaryBtnDisabled: CSSProperties = {
  ...primaryBtn,
  opacity: 0.5,
  cursor: 'not-allowed',
}
const secondaryBtn: CSSProperties = { ...baseBtn, background: 'transparent', color: '#5a3f29' }
