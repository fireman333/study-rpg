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
import { QuizModal } from '../components/QuizModal'
import { MockExamRunner, type MockResumeState } from '../components/MockExamRunner'
import { useQuestionHistory } from '../lib/services/question-history'
import {
  buildExamSetExpeditionPool,
  buildExamSetPaper,
  listExamPapersWithCoverage,
} from '../lib/services/expedition'
import { loadMockDraft, deleteMockDraft } from '../lib/services/mock-exam-draft'
import { isDraftFresh } from '@study-rpg/core'

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

  // 模考 (moved off the homepage CTA → 題庫 tab, per tidy-neurons-homepage-ui).
  // Pure practice: the drill opens QuizModal with `practice` (no energy / walker /
  // variant / connectome) and NO onComplete (no DMN draw credit). questionHistory
  // (coverage + everWrong) + SRS still record, so wrong answers still feed 出征.
  const questionHistory = useQuestionHistory()
  const [examMenuOpen, setExamMenuOpen] = useState(false)
  const [examSelection, setExamSelection] = useState<{
    year: number
    session: number
    book: string
  } | null>(null)
  // Mode picked after selecting a paper: null = mode chooser showing; 'immediate' =
  // existing per-冊 remainder practice; 'mock' = full-paper 模擬考試 runner.
  const [examMode, setExamMode] = useState<'immediate' | 'mock' | null>(null)
  const [mockResume, setMockResume] = useState<MockResumeState | null>(null)
  const [pendingResume, setPendingResume] = useState<MockResumeState | null>(null)
  const [resumePrompt, setResumePrompt] = useState(false)
  const examPapers = useMemo(
    () => (examMenuOpen ? listExamPapersWithCoverage(pack.questions, questionHistory) : []),
    [examMenuOpen, pack.questions, questionHistory],
  )
  // 即時詳解 pool = unanswered remainder (resumable coverage grind).
  const examSetPool = useMemo(
    () =>
      examSelection
        ? buildExamSetExpeditionPool(
            pack.questions,
            questionHistory,
            examSelection.year,
            examSelection.session,
            examSelection.book,
          )
        : [],
    [examSelection, pack.questions, questionHistory],
  )
  // 模擬考試 pool = the WHOLE 冊 in order (incl. already-answered).
  const mockPaperPool = useMemo(
    () =>
      examSelection
        ? buildExamSetPaper(pack.questions, examSelection.year, examSelection.session, examSelection.book)
        : [],
    [examSelection, pack.questions],
  )
  const openExamMenu = (): void => {
    closeExam()
    setExamMenuOpen(true)
  }
  const chooseExamPaper = (year: number, session: number, book: string): void => {
    setExamMenuOpen(false)
    setExamSelection({ year, session, book })
    setExamMode(null) // → mode chooser
  }
  function closeExam(): void {
    setExamSelection(null)
    setExamMode(null)
    setMockResume(null)
    setPendingResume(null)
    setResumePrompt(false)
  }
  const chooseMock = async (): Promise<void> => {
    if (!examSelection) return
    // mockPaperPool is already memoized for the selected paper — reuse it.
    const draft = await loadMockDraft(examSelection)
    if (draft && isDraftFresh(draft, mockPaperPool)) {
      setPendingResume({
        answers: draft.answers,
        flaggedIndexes: draft.flaggedIndexes,
        index: draft.index,
        startedAt: draft.startedAt,
      })
      setResumePrompt(true)
    } else {
      if (draft) await deleteMockDraft(examSelection) // stale → discard
      setMockResume(null)
      setExamMode('mock')
    }
  }
  const resumeMock = (): void => {
    setMockResume(pendingResume)
    setResumePrompt(false)
    setExamMode('mock')
  }
  const restartMock = (): void => {
    if (examSelection) void deleteMockDraft(examSelection)
    setMockResume(null)
    setPendingResume(null)
    setResumePrompt(false)
    setExamMode('mock')
  }

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

      <button type="button" style={examEntryBtnStyle} onClick={openExamMenu} aria-label="模考：選一份考卷練習">
        <span style={examEntryMainStyle}>📋 模考 · 選一份考卷</span>
        <span style={examEntrySubStyle}>
          整冊約 100 題依序作答 · 純練習，不影響養成進度（答錯仍記入錯題，可之後出征修復）
        </span>
      </button>

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

      {examMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="模考選單"
          style={examBackdropStyle}
          onClick={() => setExamMenuOpen(false)}
        >
          <div style={examPanelStyle} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setExamMenuOpen(false)} style={examBackStyle}>
              ← 關閉
            </button>
            <h2 style={examTitleStyle}>模考 · 選試卷</h2>
            <div style={examListStyle}>
              {examPapers.map((p) => (
                <button
                  key={`${p.year}-${p.session}-${p.book}`}
                  type="button"
                  onClick={() => chooseExamPaper(p.year, p.session, p.book)}
                  style={examRowStyle}
                  title={p.complete ? '已全部作答 — 可用模擬考試整卷重做' : `剩 ${p.total - p.answered} 題未答`}
                >
                  <span>
                    {p.year} 第{p.session}次 · {p.book}
                  </span>
                  <span style={examBadgeStyle}>
                    {p.complete ? '✓ 完成' : `已答 ${p.answered}/${p.total}`}
                  </span>
                </button>
              ))}
            </div>
            <p style={examHintStyle}>
              每份＝該年該次的單冊（醫學一或醫學二）約 100 題，依題號順序；已答過的題（任何模式）會跳過、累積到答完整冊。模考為純練習：不給能量、不抽神經元、不長連線，但答錯仍記入錯題清單，可之後出征修復。
            </p>
          </div>
        </div>
      )}

      {/* Mode chooser — after a paper is selected, pick 即時詳解 (remainder practice)
          or 模擬考試 (full-paper closed-book runner). */}
      {examSelection && examMode === null && !resumePrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="選擇作答模式"
          style={examBackdropStyle}
          onClick={closeExam}
        >
          <div style={examPanelStyle} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={closeExam} style={examBackStyle}>
              ← 重選試卷
            </button>
            <h2 style={examTitleStyle}>
              {examSelection.year} 第{examSelection.session}次 · {examSelection.book}
            </h2>
            <div style={examListStyle}>
              <button
                type="button"
                onClick={() => setExamMode('immediate')}
                disabled={examSetPool.length === 0}
                style={examSetPool.length === 0 ? examRowDoneStyle : examRowStyle}
                title={examSetPool.length === 0 ? '本冊已全部作答，改用模擬考試重做' : undefined}
              >
                <span>📖 即時詳解</span>
                <span style={examBadgeStyle}>
                  {examSetPool.length === 0 ? '已全部作答' : `剩 ${examSetPool.length} 題`}
                </span>
              </button>
              <button type="button" onClick={() => void chooseMock()} style={examRowStyle}>
                <span>📝 模擬考試</span>
                <span style={examBadgeStyle}>整卷 {mockPaperPool.length} 題</span>
              </button>
            </div>
            <p style={examHintStyle}>
              即時詳解＝逐題作答即看答案，只練未作答的題；模擬考試＝整冊閉卷作答，全部送出後一次看詳解、各科分數與國考換算分。兩者皆為純練習：不給能量、不抽神經元、不長連線，但答錯仍記入錯題清單，可之後出征修復。
            </p>
          </div>
        </div>
      )}

      {/* Resume prompt — a fresh draft exists for this paper's 模擬考試. */}
      {resumePrompt && (
        <div role="dialog" aria-modal="true" aria-label="繼續模擬考試" style={examBackdropStyle} onClick={closeExam}>
          <div style={examPanelStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={examTitleStyle}>繼續上次的模擬考試？</h2>
            <p style={examHintStyle}>
              偵測到這份試卷有未完成的作答進度。要從上次中斷處繼續，還是重新開始整卷？
            </p>
            <div style={examListStyle}>
              <button type="button" onClick={resumeMock} style={examRowStyle}>
                <span>▶ 繼續上次進度</span>
                <span style={examBadgeStyle}>已答 {pendingResume?.answers.filter((a) => a !== null).length ?? 0} 題</span>
              </button>
              <button type="button" onClick={restartMock} style={examRowStyle}>
                <span>↺ 重新開始整卷</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 即時詳解 — pure practice (tidy-neurons-homepage-ui): `practice` suppresses
          energy / walker / variant / connectome; NO onComplete ⇒ no DMN draw credit.
          questionHistory (coverage + everWrong) + SRS still record. */}
      {examSelection && examMode === 'immediate' && examSetPool.length > 0 && (
        <QuizModal pool={examSetPool} preserveOrder practice onClose={closeExam} />
      )}

      {/* 模擬考試 — full-paper closed-book runner (add-neurons-exam-set-mock-mode).
          Pure practice; wrong + unanswered batch-written to 錯題本 at 送出. */}
      {examSelection && examMode === 'mock' && mockPaperPool.length > 0 && (
        <MockExamRunner
          pool={mockPaperPool}
          paperLabel={`${examSelection.year} 第${examSelection.session}次 · ${examSelection.book}`}
          paperKey={examSelection}
          resume={mockResume ?? undefined}
          onClose={closeExam}
        />
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
// Exam content (stem / option text / answer / 詳解 body / AI note) — legible, never
// pixel (opt out of the global pixel default). Filter chips + count stay pixel chrome.
const stemStyle: React.CSSProperties = { fontSize: '0.95rem', color: '#2a2118', lineHeight: 1.6, margin: '0.4rem 0', fontFamily: 'var(--font-legible)' }
const optionsStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: '0.3rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }
const optionItemStyle: React.CSSProperties = { fontSize: '0.9rem', color: '#3a2a1a', lineHeight: 1.5, fontFamily: 'var(--font-legible)' }
const optionKeyStyle: React.CSSProperties = { fontWeight: 700, color: '#8c6d4a' }
const answerStyle: React.CSSProperties = { fontSize: '0.9rem', color: '#4d8c4d', fontWeight: 600, margin: '0.5rem 0 0.3rem', fontFamily: 'var(--font-legible)' }
const explanationStyle: React.CSSProperties = { marginTop: '0.4rem', background: '#f4ecd8', border: '1px solid #c9ad7f', borderRadius: '4px', padding: '0.4rem 0.6rem' }
const explanationSummaryStyle: React.CSSProperties = { fontWeight: 700, color: '#8c6d4a', cursor: 'pointer', fontSize: '0.86rem' }
const explanationBodyStyle: React.CSSProperties = { whiteSpace: 'pre-wrap', fontSize: '0.86rem', color: '#3a2a1a', lineHeight: 1.65, marginTop: '0.4rem', fontFamily: 'var(--font-legible)' }
const aiNoteStyle: React.CSSProperties = { fontSize: '0.74rem', color: '#a07a3a', marginTop: '0.4rem', fontStyle: 'italic', fontFamily: 'var(--font-legible)' }
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

// ─── 模考 entry + picker (moved from homepage CTA, enlarged) ──────────────────

const examEntryBtnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '0.2rem',
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.9rem 1.1rem',
  marginBottom: '0.8rem',
  background: '#d4a04d',
  color: '#fff',
  border: '2px solid #b8893a',
  borderRadius: '8px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
}
const examEntryMainStyle: React.CSSProperties = { fontSize: '1.1rem', fontWeight: 700 }
const examEntrySubStyle: React.CSSProperties = { fontSize: '0.78rem', opacity: 0.95, lineHeight: 1.5 }
const examBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
}
const examPanelStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: '8px',
  width: 'min(440px, 100%)',
  maxHeight: '85vh',
  overflow: 'auto',
  padding: '0.9rem 1rem 1rem',
}
const examBackStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#8c6d4a',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  cursor: 'pointer',
  padding: 0,
}
const examTitleStyle: React.CSSProperties = { fontSize: '1.15rem', color: '#3a2a1a', margin: '0.4rem 0 0.7rem' }
const examListStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem' }
const examRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0.5rem 0.7rem',
  background: '#f4ecd8',
  color: '#3a2a1a',
  border: '1px solid #c9ad7f',
  borderRadius: '6px',
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  cursor: 'pointer',
  textAlign: 'left',
}
const examRowDoneStyle: React.CSSProperties = {
  ...examRowStyle,
  opacity: 0.55,
  cursor: 'not-allowed',
}
const examBadgeStyle: React.CSSProperties = {
  fontSize: '0.76rem',
  color: '#8c6d4a',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}
const examHintStyle: React.CSSProperties = {
  fontSize: '0.76rem',
  color: '#6a5238',
  lineHeight: 1.6,
  margin: '0.7rem 0 0',
}
