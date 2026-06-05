/**
 * QuestionBankPage — /bank 題庫 browse route.
 *
 * Lays out the entire 一階國考 corpus (题目 + 選項 + 詳解) filterable by
 * 科別 (subject) / 年份 (meta.year) / 次別 (meta.session, 第一次 / 第二次).
 * Read-only reference surface; complements the gamified quiz + /bookmarks.
 * Each row keeps a question-scoped 🐞 report that submits to the shared
 * Supabase `bug_reports` table via the same `submitBugReport` service the
 * in-quiz inline reporter uses (so reports land identically, with question_id).
 */
import { useEffect, useMemo, useState } from 'react'
import {
  QUIZ_BUG_TARGETS,
  QUIZ_BUG_TARGET_TO_CATEGORY,
  type ContentPack,
  type Question,
  type QuizBugTarget,
} from '@study-rpg/core'
import { useAuth } from '../lib/auth/AuthContext'
import { submitBugReport } from '../lib/services/bug-report'

const PAGE_SIZE = 50

function qYear(q: Question): number | undefined {
  return (q.meta as { year?: number } | undefined)?.year
}
function qSession(q: Question): number | undefined {
  return (q.meta as { session?: number } | undefined)?.session
}
function sessionLabel(s: number): string {
  if (s === 1) return '第一次'
  if (s === 2) return '第二次'
  return `第${s}次`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function QuestionBankPage({ pack }: { pack: ContentPack }): JSX.Element {
  const questions = useMemo(
    () => [...pack.questions].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [pack.questions],
  )
  const subjects = useMemo(() => pack.subjects.map((s) => s.id), [pack.subjects])

  const years = useMemo(() => {
    const s = new Set<number>()
    for (const q of questions) {
      const y = qYear(q)
      if (y != null) s.add(y)
    }
    return [...s].sort((a, b) => b - a)
  }, [questions])

  const sessions = useMemo(() => {
    const s = new Set<number>()
    for (const q of questions) {
      const v = qSession(q)
      if (v != null) s.add(v)
    }
    return [...s].sort((a, b) => a - b)
  }, [questions])

  const [selSubjects, setSelSubjects] = useState<Set<string>>(new Set())
  const [selYears, setSelYears] = useState<Set<number>>(new Set())
  const [selSessions, setSelSessions] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(0)
  const [bugForQ, setBugForQ] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      questions.filter((q) => {
        if (selSubjects.size > 0 && !selSubjects.has(q.subject)) return false
        if (selYears.size > 0) {
          const y = qYear(q)
          if (y == null || !selYears.has(y)) return false
        }
        if (selSessions.size > 0) {
          const v = qSession(q)
          if (v == null || !selSessions.has(v)) return false
        }
        return true
      }),
    [questions, selSubjects, selYears, selSessions],
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const paged = filtered.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE)

  useEffect(() => {
    setPage(0)
  }, [selSubjects, selYears, selSessions])

  function toggle<T>(set: Set<T>, value: T, apply: (next: Set<T>) => void): void {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

  const hasFilter = selSubjects.size > 0 || selYears.size > 0 || selSessions.size > 0

  return (
    <section aria-label="題庫">
      <h2 style={titleStyle}>📖 題庫</h2>
      <p style={helperStyle}>
        全部 {questions.length} 題依科別、年份、次別篩選後完整陳列題目、選項與詳解。
        發現題目 / 詳解有誤可點每題的 🐞 回報。
      </p>

      <div style={filterBarStyle}>
        <ChipGroup
          label="科別"
          options={subjects.map((s) => ({ key: s, label: s }))}
          isAllSelected={selSubjects.size === 0}
          isSelected={(k) => selSubjects.has(k as string)}
          onAll={() => setSelSubjects(new Set())}
          onToggle={(k) => toggle(selSubjects, k as string, setSelSubjects)}
        />
        <ChipGroup
          label="年份"
          options={years.map((y) => ({ key: y, label: String(y) }))}
          isAllSelected={selYears.size === 0}
          isSelected={(k) => selYears.has(k as number)}
          onAll={() => setSelYears(new Set())}
          onToggle={(k) => toggle(selYears, k as number, setSelYears)}
        />
        {sessions.length > 0 && (
          <ChipGroup
            label="次別"
            options={sessions.map((s) => ({ key: s, label: sessionLabel(s) }))}
            isAllSelected={selSessions.size === 0}
            isSelected={(k) => selSessions.has(k as number)}
            onAll={() => setSelSessions(new Set())}
            onToggle={(k) => toggle(selSessions, k as number, setSelSessions)}
          />
        )}
        <span style={countStyle}>
          {filtered.length} / {questions.length} 題
        </span>
      </div>

      {filtered.length === 0 && hasFilter && (
        <p style={emptyStyle}>沒有符合篩選條件的題目。</p>
      )}

      <ul style={listStyle}>
        {paged.map((q) => (
          <QuestionEntry key={q.id} q={q} onReport={() => setBugForQ(q.id)} />
        ))}
      </ul>

      <Pager page={clampedPage} pageCount={pageCount} onPageChange={setPage} />

      {bugForQ && (
        <QuestionBugReportSheet questionId={bugForQ} onClose={() => setBugForQ(null)} />
      )}
    </section>
  )
}

// ─── Filter chip group (flex-wrap, matches YearFilterBar aesthetic) ──────────

function ChipGroup({
  label,
  options,
  isAllSelected,
  isSelected,
  onAll,
  onToggle,
}: {
  label: string
  options: { key: string | number; label: string }[]
  isAllSelected: boolean
  isSelected: (key: string | number) => boolean
  onAll: () => void
  onToggle: (key: string | number) => void
}): JSX.Element {
  return (
    <div style={groupStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={chipRowStyle} role="group" aria-label={`${label}多選`}>
        <button type="button" style={isAllSelected ? chipActiveStyle : chipStyle} aria-pressed={isAllSelected} onClick={onAll}>
          全部
        </button>
        {options.map((o) => (
          <button
            key={String(o.key)}
            type="button"
            style={isSelected(o.key) ? chipActiveStyle : chipStyle}
            aria-pressed={isSelected(o.key)}
            onClick={() => onToggle(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Per-question entry ──────────────────────────────────────────────────────

function QuestionEntry({ q, onReport }: { q: Question; onReport: () => void }): JSX.Element {
  const year = qYear(q)
  const session = qSession(q)
  return (
    <li style={entryStyle}>
      <div style={entryHeadStyle}>
        <span style={entryIdStyle}>{q.id}</span>
        <button type="button" style={reportBtnStyle} onClick={onReport} aria-label="回報這題" title="回報這題">
          🐞 回報
        </button>
      </div>
      <div style={tagRowStyle}>
        {year != null && <span style={tagStyle}>{year} 年</span>}
        {session != null && <span style={tagStyle}>{sessionLabel(session)}</span>}
        <span style={tagStyle}>{q.subject}</span>
      </div>
      <p style={stemStyle}>{q.stem}</p>
      <ul style={optionsStyle}>
        {Object.entries(q.options).map(([key, text]) => (
          <li key={key} style={optionItemStyle}>
            <span style={optionKeyStyle}>({key})</span> {text}
          </li>
        ))}
      </ul>
      <p style={answerStyle}>
        <strong>正解：</strong>
        {(q as { disputed?: boolean }).disputed ? '⚖ 送分題（考選部判定全部給分）' : `(${q.answer})`}
      </p>
      {q.explanation && (
        <details style={explanationStyle} open>
          <summary style={explanationSummaryStyle}>📖 詳解</summary>
          <div style={explanationBodyStyle}>{q.explanation}</div>
          {(q as { explanationSource?: string }).explanationSource === 'ai-generated' && (
            <p style={aiNoteStyle}>※ 本題詳解由 AI 生成，僅供參考。</p>
          )}
        </details>
      )}
    </li>
  )
}

// ─── Pagination ──────────────────────────────────────────────────────────────

function Pager({
  page,
  pageCount,
  onPageChange,
}: {
  page: number
  pageCount: number
  onPageChange: (next: number) => void
}): JSX.Element | null {
  if (pageCount <= 1) return null
  return (
    <div style={pagerStyle}>
      <button
        type="button"
        style={page === 0 ? pagerBtnDisabled : pagerBtnStyle}
        aria-label="上一頁"
        disabled={page === 0}
        onClick={() => page > 0 && onPageChange(page - 1)}
      >
        ‹
      </button>
      <span style={pagerIndicatorStyle} aria-live="polite">
        {page + 1} / {pageCount}
      </span>
      <button
        type="button"
        style={page === pageCount - 1 ? pagerBtnDisabled : pagerBtnStyle}
        aria-label="下一頁"
        disabled={page === pageCount - 1}
        onClick={() => page < pageCount - 1 && onPageChange(page + 1)}
      >
        ›
      </button>
    </div>
  )
}

// ─── Question-scoped 🐞 report sheet (mirrors QuizModal inline reporter) ──────

const TARGET_LABELS: Record<QuizBugTarget, string> = {
  question: '題目內容有誤',
  image: '圖片問題',
  explanation: '答案 / 詳解有誤',
  other: '其他',
}

function QuestionBugReportSheet({
  questionId,
  onClose,
}: {
  questionId: string
  onClose: () => void
}): JSX.Element {
  const { user, signInWithGoogle } = useAuth()
  const [target, setTarget] = useState<QuizBugTarget>('question')
  const [desc, setDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const canSubmit = desc.trim().length > 0 && !submitting

  async function handleSubmit(): Promise<void> {
    if (!user || !canSubmit) return
    setSubmitting(true)
    setResult(null)
    const res = await submitBugReport(
      {
        category: QUIZ_BUG_TARGET_TO_CATEGORY[target],
        severity: 'minor',
        what_doing: `題庫回報 ${questionId}（${TARGET_LABELS[target]}）`,
        what_happened: desc.trim(),
        question_id: questionId,
      },
      {},
      { authStatus: 'authed', userId: user.id },
    )
    setSubmitting(false)
    setResult(res.ok ? { ok: true, msg: '✅ 已送出，謝謝！' } : { ok: false, msg: `送出失敗：${res.error}` })
  }

  return (
    <div style={sheetBackdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="回報題目問題">
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <header style={sheetHeaderStyle}>
          <span>🐞 回報這題</span>
          <button style={sheetCloseStyle} onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </header>
        <div style={{ padding: '0.9rem 1rem' }}>
          <p style={sheetQidStyle}>題號 {questionId}</p>
          {!user ? (
            <>
              <p style={{ color: '#5a3f29', fontSize: '0.86rem', lineHeight: 1.6 }}>回報需要先登入。</p>
              <button style={primaryBtnStyle} onClick={() => void signInWithGoogle()}>
                使用 Google 登入
              </button>
            </>
          ) : result?.ok ? (
            <>
              <p style={{ color: '#4d8c4d', fontWeight: 600, margin: '0.8rem 0', textAlign: 'center' }}>{result.msg}</p>
              <button style={primaryBtnStyle} onClick={onClose}>
                關閉
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.7rem' }}>
                {QUIZ_BUG_TARGETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    style={target === t ? chipActiveStyle : chipStyle}
                    aria-pressed={target === t}
                    onClick={() => setTarget(t)}
                  >
                    {TARGET_LABELS[t]}
                  </button>
                ))}
              </div>
              <textarea
                style={sheetTextareaStyle}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="簡短說明哪裡有問題…"
                rows={3}
              />
              {result && !result.ok && (
                <p style={{ color: '#c44d4d', fontSize: '0.82rem', marginTop: '0.5rem' }}>{result.msg}</p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.8rem' }}>
                <button style={secondaryBtnStyle} onClick={onClose}>
                  取消
                </button>
                <button
                  style={canSubmit ? primaryBtnStyle : { ...primaryBtnStyle, opacity: 0.5, cursor: 'not-allowed' }}
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                >
                  {submitting ? '送出中…' : '送出'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles (cream/brown pixel aesthetic, matches YearFilterBar / QuizModal) ──

const titleStyle: React.CSSProperties = { fontSize: '1.3rem', color: '#3a2a1a', margin: '0.2rem 0 0.4rem' }
const helperStyle: React.CSSProperties = {
  fontSize: '0.84rem',
  color: '#6a5238',
  lineHeight: 1.6,
  margin: '0 0 0.7rem',
}
const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  padding: '0.6rem 0.8rem',
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
  marginBottom: '0.8rem',
}
const groupStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }
const labelStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#3a2a1a',
  minWidth: '2.6rem',
  paddingTop: '0.25rem',
}
const chipRowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.35rem', flex: 1 }
const chipStyle: React.CSSProperties = {
  padding: '0.2rem 0.55rem',
  background: 'transparent',
  color: '#8c6d4a',
  border: '1px dashed #b8893a',
  borderRadius: '999px',
  fontSize: '0.78rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  opacity: 0.7,
}
const chipActiveStyle: React.CSSProperties = {
  ...chipStyle,
  background: '#d4a04d',
  color: '#fff',
  border: '1px solid #b8893a',
  opacity: 1,
}
const countStyle: React.CSSProperties = { fontSize: '0.78rem', color: '#8c6d4a', fontWeight: 600, alignSelf: 'flex-end' }
const emptyStyle: React.CSSProperties = { color: '#8c6d4a', fontSize: '0.9rem', padding: '1rem 0', textAlign: 'center' }
const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }
const entryStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #c9ad7f',
  borderRadius: '6px',
  padding: '0.8rem 1rem',
}
const entryHeadStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }
const entryIdStyle: React.CSSProperties = { fontSize: '0.78rem', color: '#8c6d4a', fontWeight: 700 }
const reportBtnStyle: React.CSSProperties = {
  padding: '0.18rem 0.55rem',
  background: 'transparent',
  color: '#c44d4d',
  border: '1px solid #c44d4d',
  borderRadius: '4px',
  fontSize: '0.76rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
const tagRowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.4rem 0' }
const tagStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#6a5238',
  background: '#efe3c8',
  border: '1px solid #c9ad7f',
  borderRadius: '999px',
  padding: '0.05rem 0.5rem',
}
const stemStyle: React.CSSProperties = { fontSize: '0.95rem', color: '#2a2118', lineHeight: 1.6, margin: '0.4rem 0' }
const optionsStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: '0.3rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }
const optionItemStyle: React.CSSProperties = { fontSize: '0.9rem', color: '#3a2a1a', lineHeight: 1.5 }
const optionKeyStyle: React.CSSProperties = { fontWeight: 700, color: '#8c6d4a' }
const answerStyle: React.CSSProperties = { fontSize: '0.9rem', color: '#4d8c4d', fontWeight: 600, margin: '0.5rem 0 0.3rem' }
const explanationStyle: React.CSSProperties = { marginTop: '0.4rem', background: '#f4ecd8', border: '1px solid #c9ad7f', borderRadius: '4px', padding: '0.4rem 0.6rem' }
const explanationSummaryStyle: React.CSSProperties = { fontWeight: 700, color: '#8c6d4a', cursor: 'pointer', fontSize: '0.86rem' }
const explanationBodyStyle: React.CSSProperties = { whiteSpace: 'pre-wrap', fontSize: '0.86rem', color: '#3a2a1a', lineHeight: 1.65, marginTop: '0.4rem' }
const aiNoteStyle: React.CSSProperties = { fontSize: '0.74rem', color: '#a07a3a', marginTop: '0.4rem', fontStyle: 'italic' }
const pagerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', margin: '1rem 0' }
const pagerBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.8rem',
  background: '#d4a04d',
  color: '#fff',
  border: '1px solid #b8893a',
  borderRadius: '4px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  fontSize: '1rem',
}
const pagerBtnDisabled: React.CSSProperties = { ...pagerBtnStyle, opacity: 0.4, cursor: 'not-allowed' }
const pagerIndicatorStyle: React.CSSProperties = { fontSize: '0.85rem', color: '#6a5238', fontWeight: 600 }

const sheetBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
}
const sheetStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: '8px',
  width: 'min(420px, 100%)',
  maxHeight: '85vh',
  overflow: 'auto',
}
const sheetHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.7rem 1rem',
  borderBottom: '1px solid #c9ad7f',
  fontWeight: 700,
  color: '#3a2a1a',
}
const sheetCloseStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#8c6d4a' }
const sheetQidStyle: React.CSSProperties = { fontSize: '0.78rem', color: '#8c6d4a', marginBottom: '0.6rem' }
const sheetTextareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.5rem',
  border: '1px solid #c9ad7f',
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontSize: '0.88rem',
  resize: 'vertical',
}
const primaryBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.9rem',
  background: '#d4a04d',
  color: '#fff',
  border: '1px solid #b8893a',
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
}
const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.9rem',
  background: 'transparent',
  color: '#8c6d4a',
  border: '1px solid #b8893a',
  borderRadius: '4px',
  fontFamily: 'inherit',
  cursor: 'pointer',
}
