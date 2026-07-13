/**
 * BookmarkToggleButton — standalone ⭐ bookmark toggle for review surfaces that
 * render a question OUTSIDE the interactive QuizModal (收藏頁 錯題 lists, 題庫).
 *
 * Wraps `useIsBookmarked` in its own component so the hook isn't called inside a
 * `.map()` (React hooks rule), and writes straight to the existing
 * `questionBookmarks` store via id + family — no Question object needed, so it
 * works even when the id is no longer in the content pack. Gold accent, filled
 * when active (matches the QuizModal bookmark button).
 */
import type { CSSProperties } from 'react'
import { addBookmark, removeBookmark, useIsBookmarked } from '../lib/services/bookmarks'

export function BookmarkToggleButton({
  questionId,
  family,
}: {
  questionId: string
  family: string
}): JSX.Element {
  const bookmarked = useIsBookmarked(questionId)
  return (
    <button
      type="button"
      style={bookmarked ? activeStyle : baseStyle}
      onClick={() => {
        if (bookmarked) void removeBookmark(questionId)
        else void addBookmark(questionId, family)
      }}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? '取消收藏' : '收藏題目'}
    >
      {bookmarked ? '★ 已收藏' : '☆ 收藏'}
    </button>
  )
}

const baseStyle: CSSProperties = {
  padding: '0.4rem 0.7rem',
  background: 'transparent',
  color: '#b8893a',
  border: '1px solid #d4a04d',
  borderRadius: '4px',
  fontSize: '0.82rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const activeStyle: CSSProperties = {
  ...baseStyle,
  background: '#d4a04d',
  color: '#fff',
  border: '1px solid #d4a04d',
}
