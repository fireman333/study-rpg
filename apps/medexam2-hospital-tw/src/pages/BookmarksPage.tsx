import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Question } from '@study-rpg/core'
import {
  toggleBookmark,
  triggerBookmarksDownload,
  useAllBookmarks,
} from '../services/bookmarks'
import { loadQuestionsByIdMap } from '../lib/quiz'

export function BookmarksPage() {
  const bookmarks = useAllBookmarks()
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
    <main className="app-shell bookmarks-page">
      <header className="app-header">
        <h1>📚 收藏題目 ({count})</h1>
        <div className="app-header__meta">
          <Link to="/" className="nav-link">
            ← 回首頁
          </Link>
          <button
            type="button"
            className="bookmarks-page__export"
            onClick={handleExport}
            disabled={count === 0 || !questionsById}
          >
            ⬇ 匯出 Markdown
          </button>
        </div>
      </header>

      {loading && <p className="bookmarks-page__loading">載入中…</p>}

      {!loading && count === 0 && (
        <p className="bookmarks-page__empty">
          還沒有收藏題目。答題時點右上 ⭐ 把題目收藏起來。
        </p>
      )}

      {!loading && count > 0 && (
        <ul className="bookmarks-page__list">
          {rows.map((row) => {
            const q = questionsById?.get(row.questionId)
            return (
              <li key={row.questionId} className="bookmarks-page__entry">
                <div className="bookmarks-page__entry-head">
                  <span className="bookmarks-page__entry-id">{row.questionId}</span>
                  <button
                    type="button"
                    className="bookmarks-page__entry-remove"
                    onClick={() => handleRemove(row.questionId)}
                  >
                    移除收藏
                  </button>
                </div>
                <hr className="bookmarks-page__entry-divider" />
                {q ? (
                  <>
                    <p className="bookmarks-page__entry-stem">{q.stem}</p>
                    <ul className="bookmarks-page__entry-options">
                      {Object.entries(q.options).map(([key, text]) => (
                        <li key={key}>
                          <span className="bookmarks-page__entry-option-key">({key})</span> {text}
                        </li>
                      ))}
                    </ul>
                    <p className="bookmarks-page__entry-answer">
                      <strong>正解：</strong>({q.answer})
                    </p>
                    <div className="bookmarks-page__entry-explanation">
                      <strong>詳解：</strong>
                      <pre className="bookmarks-page__entry-explanation-body">
                        {q.explanation || '（解析待補）'}
                      </pre>
                    </div>
                  </>
                ) : (
                  <p className="bookmarks-page__entry-orphan">
                    題目已不在題庫（可能因內容版本更新移除）。
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
