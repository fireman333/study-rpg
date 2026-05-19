import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Question } from '@study-rpg/core'
import {
  toggleBookmark,
  triggerBookmarksDownload,
  useAllBookmarks,
  useBookmark,
} from '../services/bookmarks'
import { useWrongAnswers } from '../services/wrong-answers'
import { loadQuestionsByIdMap } from '../lib/quiz'
import { ExplanationMarkdown } from '../components/ExplanationMarkdown'

type TabId = 'manual' | 'wrong'

const VALID_TABS: readonly TabId[] = ['manual', 'wrong'] as const

function parseTab(raw: string | null): TabId {
  return raw && (VALID_TABS as readonly string[]).includes(raw) ? (raw as TabId) : 'manual'
}

export function BookmarksPage() {
  const [params, setParams] = useSearchParams()
  const activeTab: TabId = parseTab(params.get('tab'))

  const [questionsById, setQuestionsById] = useState<ReadonlyMap<string, Question> | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadQuestionsByIdMap().then((map) => {
      if (!cancelled) setQuestionsById(map)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const setTab = (next: TabId): void => {
    if (next === activeTab) return
    const nextParams = new URLSearchParams(params)
    nextParams.set('tab', next)
    setParams(nextParams, { replace: true })
  }

  return (
    <main className="app-shell bookmarks-page">
      <header className="app-header">
        <h1>📚 我的題目</h1>
        <div className="app-header__meta">
          <Link to="/" className="nav-link">
            ← 回首頁
          </Link>
        </div>
      </header>

      <nav className="bookmarks-tabs" role="tablist" aria-label="收藏分類">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'manual'}
          className={`bookmarks-tabs__tab${activeTab === 'manual' ? ' bookmarks-tabs__tab--active' : ''}`}
          onClick={() => setTab('manual')}
        >
          ⭐ 手動收藏
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'wrong'}
          className={`bookmarks-tabs__tab${activeTab === 'wrong' ? ' bookmarks-tabs__tab--active' : ''}`}
          onClick={() => setTab('wrong')}
        >
          ❌ 錯題
        </button>
      </nav>

      {activeTab === 'manual' ? (
        <ManualBookmarksTab questionsById={questionsById} />
      ) : (
        <WrongAnswersTab questionsById={questionsById} />
      )}
    </main>
  )
}

// ─── Tab: Manual bookmarks ───────────────────────────────────────────────────

function ManualBookmarksTab({
  questionsById,
}: {
  questionsById: ReadonlyMap<string, Question> | null
}) {
  const bookmarks = useAllBookmarks()
  const loading = bookmarks === undefined || questionsById === null
  const rows = bookmarks ?? []
  const count = rows.length

  const handleRemove = (questionId: string): void => {
    if (!window.confirm('確定要移除這則收藏？')) return
    void toggleBookmark(questionId)
  }

  const handleExport = (): void => {
    if (!questionsById || rows.length === 0) return
    triggerBookmarksDownload(rows, questionsById)
  }

  return (
    <section className="bookmarks-tab bookmarks-tab--manual">
      <div className="bookmarks-tab__toolbar">
        <span className="bookmarks-tab__count">共 {count} 題</span>
        <button
          type="button"
          className="bookmarks-page__export"
          onClick={handleExport}
          disabled={count === 0 || !questionsById}
        >
          ⬇ 匯出 Markdown
        </button>
      </div>

      {loading && <p className="bookmarks-page__loading">載入中…</p>}

      {!loading && count === 0 && (
        <p className="bookmarks-page__empty">
          還沒有收藏題目。答題時點右上 ⭐ 把題目收藏起來。
        </p>
      )}

      {!loading && count > 0 && (
        <ul className="bookmarks-page__list">
          {rows.map((row) => (
            <EntryRow
              key={row.questionId}
              questionId={row.questionId}
              question={questionsById?.get(row.questionId)}
              rightAction={
                <button
                  type="button"
                  className="bookmarks-page__entry-remove"
                  onClick={() => handleRemove(row.questionId)}
                >
                  移除收藏
                </button>
              }
            />
          ))}
        </ul>
      )}
    </section>
  )
}

// ─── Tab: Wrong answers (derived view) ───────────────────────────────────────

function WrongAnswersTab({
  questionsById,
}: {
  questionsById: ReadonlyMap<string, Question> | null
}) {
  const wrongs = useWrongAnswers()
  const loading = wrongs === undefined || questionsById === null
  const rows = wrongs ?? []
  const count = rows.length

  return (
    <section className="bookmarks-tab bookmarks-tab--wrong">
      <p className="bookmarks-tab__helper">
        📌 <strong>錯題</strong> = 你最近一次答錯的題。下次答對會自動離開此清單。
        <br />
        想永久保留？點任一題的 <strong>⭐</strong> 加入「手動收藏」。
      </p>

      <div className="bookmarks-tab__toolbar">
        <span className="bookmarks-tab__count">共 {count} 題</span>
      </div>

      {loading && <p className="bookmarks-page__loading">載入中…</p>}

      {!loading && count === 0 && (
        <p className="bookmarks-page__empty">
          目前還沒有答錯的題目 — 答錯後會自動收進這裡。
        </p>
      )}

      {!loading && count > 0 && (
        <ul className="bookmarks-page__list">
          {rows.map((row) => (
            <EntryRow
              key={row.questionId}
              questionId={row.questionId}
              question={questionsById?.get(row.questionId)}
              rightAction={<PromoteStar questionId={row.questionId} />}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function PromoteStar({ questionId }: { questionId: string }) {
  const bookmarked = !!useBookmark(questionId)
  return (
    <button
      type="button"
      className={`bookmarks-page__entry-promote${bookmarked ? ' bookmarks-page__entry-promote--on' : ''}`}
      onClick={() => void toggleBookmark(questionId)}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? '取消手動收藏' : '加入手動收藏'}
      title={bookmarked ? '已加入手動收藏' : '加入手動收藏'}
    >
      {bookmarked ? '⭐ 已收藏' : '☆ 加入收藏'}
    </button>
  )
}

// ─── Shared per-entry row component ──────────────────────────────────────────

function EntryRow({
  questionId,
  question,
  rightAction,
}: {
  questionId: string
  question: Question | undefined
  rightAction: React.ReactNode
}) {
  return (
    <li className="bookmarks-page__entry">
      <div className="bookmarks-page__entry-head">
        <span className="bookmarks-page__entry-id">{questionId}</span>
        {rightAction}
      </div>
      <hr className="bookmarks-page__entry-divider" />
      {question ? (
        <>
          <p className="bookmarks-page__entry-stem">{question.stem}</p>
          <ul className="bookmarks-page__entry-options">
            {Object.entries(question.options).map(([key, text]) => (
              <li key={key}>
                <span className="bookmarks-page__entry-option-key">({key})</span> {text}
              </li>
            ))}
          </ul>
          <p className="bookmarks-page__entry-answer">
            <strong>正解：</strong>
            {question.disputed ? '⚖️ 送分題（考選部判定全部給分）' : `(${question.answer})`}
          </p>
          <div className="bookmarks-page__entry-explanation">
            <strong>詳解：</strong>
            <ExplanationMarkdown text={question.explanation ?? ''} />
          </div>
        </>
      ) : (
        <p className="bookmarks-page__entry-orphan">
          題目已不在題庫（可能因內容版本更新移除）。
        </p>
      )}
    </li>
  )
}
