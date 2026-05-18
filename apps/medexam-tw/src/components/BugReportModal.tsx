import { useEffect, useMemo, useState } from 'react'
import {
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_SEVERITIES,
  BUG_REPORT_REPRODUCIBILITY,
  type BugReportAutoContext,
  type BugReportCategory,
  type BugReportReproducibility,
  type BugReportSeverity,
} from '@study-rpg/core'
import { useAuth } from '../lib/auth/AuthContext'
import {
  buildAutoContext,
  submitBugReport,
  type BugReportAutoKey,
} from '../services/bug-report'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Pre-fill category when opened via the inline-sheet escape hatch. */
  initialCategory?: BugReportCategory
  /** Pre-fill what_happened when opened via the inline-sheet escape hatch. */
  initialWhatHappened?: string
}

const CATEGORY_LABEL: Record<BugReportCategory, string> = {
  'app-stability': '🎮 整體 — 卡住 / 崩潰 / 載入失敗',
  'hospital-management': '🏥 醫院經營 — 房間、設施、升級',
  doctors: '👨‍⚕️ 醫師 — 招募、進修、退休',
  'study-session': '📖 唸書 — 計時、暫停、累積錯誤',
  'events-fate-cards': '🎲 事件 / 命運卡 — 彈窗、獎勵',
  'numbers-wrong': '💰 數字不對 — 營收、聲望、薪水算錯',
  'visual-glitch': '🎨 畫面顯示 — 圖片破、文字錯位、按鈕不見',
  'cloud-sync': '☁️ 雲端同步 — 登入、跨裝置、資料消失',
  corpus: '📚 題庫 — 內容、答案、詳解',
  'feature-request': '💡 建議 / 想要 — 新功能、改善',
  other: '🤷 其他 / 不確定',
  'question-error': '📝 題目本身有錯（答題情境內回報）',
  'image-broken': '🖼️ 題目圖片有問題（答題情境內回報）',
  'explanation-error': '📑 詳解有錯（答題情境內回報）',
}

const SEVERITY_LABEL: Record<BugReportSeverity, string> = {
  blocker: '🔴 完全玩不下去（卡死、崩潰、無法繼續）',
  annoying: '🟡 可以玩但很煩（顯示錯、數字怪、有 workaround）',
  minor: '🟢 小問題（typo、視覺微錯）',
  suggestion: '💡 不是 bug 是建議',
}

const REPRODUCIBILITY_LABEL: Record<BugReportReproducibility, string> = {
  always: '每次',
  sometimes: '偶爾',
  once: '一次',
  unsure: '不知道',
}

const AUTO_CONTEXT_KEYS: BugReportAutoKey[] = [
  'app_version',
  'commit_sha',
  'route',
  'game_state',
  'user_agent',
  'viewport',
  'recent_console_errors',
]

const AUTO_CONTEXT_LABEL: Record<BugReportAutoKey, string> = {
  app_version: 'App 版本',
  commit_sha: 'Commit SHA',
  route: '當前頁面 (route)',
  game_state: '遊戲狀態 (game_state)',
  user_agent: '瀏覽器 (user_agent)',
  viewport: '視窗大小',
  recent_console_errors: '近期 console 錯誤 (最多 5 條)',
}

function previewValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value.length > 80 ? value.slice(0, 77) + '…' : value
  if (Array.isArray(value)) return `${value.length} 條`
  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    return json.length > 80 ? json.slice(0, 77) + '…' : json
  }
  return String(value)
}

export function BugReportModal({
  isOpen,
  onClose,
  initialCategory,
  initialWhatHappened,
}: Props) {
  const { user, signInWithGoogle } = useAuth()

  const [category, setCategory] = useState<BugReportCategory | ''>(initialCategory ?? '')
  const [severity, setSeverity] = useState<BugReportSeverity | ''>('')
  const [whatDoing, setWhatDoing] = useState('')
  const [whatHappened, setWhatHappened] = useState(initialWhatHappened ?? '')
  const [whatExpected, setWhatExpected] = useState('')
  const [reproducibility, setReproducibility] = useState<BugReportReproducibility | ''>('')
  const [contactInfo, setContactInfo] = useState('')
  const [allowFollowup, setAllowFollowup] = useState(false)

  const [autoContext, setAutoContext] = useState<BugReportAutoContext | null>(null)
  const [optOut, setOptOut] = useState<Set<BugReportAutoKey>>(() => new Set())

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (!user) return
    let cancelled = false
    void buildAutoContext().then((ctx) => {
      if (!cancelled) setAutoContext(ctx)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, user])

  useEffect(() => {
    if (!submitSuccess) return
    const timer = setTimeout(() => {
      onClose()
    }, 2000)
    return () => clearTimeout(timer)
  }, [submitSuccess, onClose])

  useEffect(() => {
    // Reset / re-apply prefill on each open transition. Effect was previously
    // `if (!isOpen)` which never fired on the open-with-new-prefill path, so
    // escape-hatch handoff from QuizBugReportSheet didn't pre-fill category
    // or whatHappened. (Fixed during add-quiz-inline-bug-report live smoke.)
    if (isOpen) {
      setCategory(initialCategory ?? '')
      setSeverity('')
      setWhatDoing('')
      setWhatHappened(initialWhatHappened ?? '')
      setWhatExpected('')
      setReproducibility('')
      setContactInfo('')
      setAllowFollowup(false)
      setOptOut(new Set())
      setSubmitError(null)
      setSubmitSuccess(false)
      setAutoContext(null)
    }
  }, [isOpen, initialCategory, initialWhatHappened])

  const canSubmit = useMemo(
    () =>
      !!user &&
      !!category &&
      !!severity &&
      whatDoing.trim().length > 0 &&
      whatHappened.trim().length > 0 &&
      !submitting,
    [user, category, severity, whatDoing, whatHappened, submitting],
  )

  if (!isOpen) return null

  function toggleOptOut(key: BugReportAutoKey) {
    setOptOut((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleSubmit() {
    if (!canSubmit || !category || !severity) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const ctx = autoContext ?? (await buildAutoContext())
      await submitBugReport(
        {
          category,
          severity,
          what_doing: whatDoing.trim(),
          what_happened: whatHappened.trim(),
          what_expected: whatExpected.trim() || undefined,
          reproducibility: reproducibility || undefined,
          contact_info: contactInfo.trim() || undefined,
          allow_followup: allowFollowup,
        },
        ctx,
        optOut,
      )
      setSubmitSuccess(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="回報問題">
      <div
        className="modal frame bug-report-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>💬 回報問題 / 建議</h2>
          <button
            type="button"
            className="bug-report-modal__close"
            onClick={onClose}
            aria-label="關閉"
          >
            ✕
          </button>
        </div>

        {!user ? (
          <div className="bug-report-modal__login-gate">
            <p>請先登入再提交（這樣我才能跟你 follow-up）</p>
            <button
              type="button"
              className="bug-report-modal__signin-btn"
              onClick={() => void signInWithGoogle()}
            >
              用 Google 登入
            </button>
          </div>
        ) : submitSuccess ? (
          <div className="bug-report-modal__success">
            ✓ 謝謝你的回報！
          </div>
        ) : (
          <div className="bug-report-modal__body">
            <fieldset className="bug-report-modal__fieldset">
              <legend>這是哪種問題？*</legend>
              <div className="bug-report-modal__radio-grid">
                {BUG_REPORT_CATEGORIES.map((c) => (
                  <label key={c} className="bug-report-modal__radio">
                    <input
                      type="radio"
                      name="category"
                      value={c}
                      checked={category === c}
                      onChange={() => setCategory(c)}
                    />
                    <span>{CATEGORY_LABEL[c]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="bug-report-modal__fieldset">
              <legend>嚴重度 *</legend>
              <div className="bug-report-modal__radio-grid bug-report-modal__radio-grid--single">
                {BUG_REPORT_SEVERITIES.map((s) => (
                  <label key={s} className="bug-report-modal__radio">
                    <input
                      type="radio"
                      name="severity"
                      value={s}
                      checked={severity === s}
                      onChange={() => setSeverity(s)}
                    />
                    <span>{SEVERITY_LABEL[s]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="bug-report-modal__field">
              <span>你在做什麼？*</span>
              <textarea
                value={whatDoing}
                onChange={(e) => setWhatDoing(e.target.value)}
                rows={2}
                placeholder="例：在進修頁面點 P3→P2 升級"
                required
              />
            </label>

            <label className="bug-report-modal__field">
              <span>實際發生什麼？*</span>
              <textarea
                value={whatHappened}
                onChange={(e) => setWhatHappened(e.target.value)}
                rows={2}
                placeholder="例：按鈕沒反應，console 噴 Error: ..."
                required
              />
            </label>

            <label className="bug-report-modal__field">
              <span>你期待什麼？（可選）</span>
              <textarea
                value={whatExpected}
                onChange={(e) => setWhatExpected(e.target.value)}
                rows={2}
                placeholder="例：應該扣營收 + 出現 pity counter"
              />
            </label>

            <fieldset className="bug-report-modal__fieldset">
              <legend>能重現嗎？（可選）</legend>
              <div className="bug-report-modal__radio-row">
                {BUG_REPORT_REPRODUCIBILITY.map((r) => (
                  <label key={r} className="bug-report-modal__radio">
                    <input
                      type="radio"
                      name="reproducibility"
                      value={r}
                      checked={reproducibility === r}
                      onChange={() => setReproducibility(r)}
                    />
                    <span>{REPRODUCIBILITY_LABEL[r]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="bug-report-modal__field">
              <span>聯絡方式（可選 — email / IG / Threads 留空 = 匿名）</span>
              <input
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="留空 = 匿名"
              />
            </label>

            <label className="bug-report-modal__checkbox">
              <input
                type="checkbox"
                checked={allowFollowup}
                onChange={(e) => setAllowFollowup(e.target.checked)}
              />
              <span>同意被聯絡 follow-up</span>
            </label>

            <details className="bug-report-modal__auto-context" open>
              <summary>系統自動附帶（你可以逐欄取消勾選）</summary>
              <ul>
                {AUTO_CONTEXT_KEYS.map((key) => (
                  <li key={key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!optOut.has(key)}
                        onChange={() => toggleOptOut(key)}
                      />
                      <span>{AUTO_CONTEXT_LABEL[key]}：</span>
                      <code>{previewValue(autoContext?.[key])}</code>
                    </label>
                  </li>
                ))}
              </ul>
            </details>

            {submitError && (
              <div className="bug-report-modal__error">送出失敗：{submitError}</div>
            )}

            <div className="bug-report-modal__actions">
              <button
                type="button"
                className="bug-report-modal__cancel"
                onClick={onClose}
                disabled={submitting}
              >
                取消
              </button>
              <button
                type="button"
                className="bug-report-modal__submit"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
              >
                {submitting ? '送出中…' : '送出'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
