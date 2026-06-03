/**
 * BookmarksPage — `/bookmarks` route, a three-tab review hub:
 *   • 手動收藏    — all ⭐ bookmarked questions (replay + un-bookmark actions)
 *   • 目前未答對  — questionHistory rows where lastResult === 'wrong'
 *   • 歷史曾錯    — questionHistory rows where everWrong === true (never leaves)
 *
 * The two wrong-answer lists are live derived views of `questionHistory` —
 * no separate store. Rows there are display-only (per spec). A single shared
 * filter bar (科目 family + 年份 year + ✨/🤔 標記) applies across all three tabs.
 *
 * Spec: openspec/specs/neurons-wrong-answer-list/spec.md
 */

import { useMemo, useState } from 'react'
import type { ContentPack, Question } from '@study-rpg/core'
import { QuizModal } from '../components/QuizModal'
import { useAllBookmarks, removeBookmark } from '../lib/services/bookmarks'
import { useAllFlags } from '../lib/services/question-flags'
import { useQuestionHistory } from '../lib/services/question-history'
import {
  parseExamYear,
  matchesWrongAnswerFilter,
  type WrongAnswerFilterState,
} from '../lib/wrong-answer-filter'
import type { QuestionHistoryRow } from '../lib/db'

interface Props {
  pack: ContentPack
}

type TabKey = 'manual' | 'currentWrong' | 'historyWrong'

const MAX_RENDER = 200
const STEM_TRUNCATE_LEN = 100
const NT_BRANCHES = ['DA', '5HT', 'GABA', 'Glu'] as const
const YEAR_CHIP_COLOR = '#6a7b8c'

export default function BookmarksPage({ pack }: Props): JSX.Element {
  const bookmarks = useAllBookmarks()
  const flags = useAllFlags()
  // Single subscription to the full history table; the two wrong-answer tabs
  // derive from it (目前未答對 = lastResult==='wrong', 歷史曾錯 = everWrong).
  const history = useQuestionHistory()

  const [tab, setTab] = useState<TabKey>('manual')
  const [excludedFamilies, setExcludedFamilies] = useState<Set<string>>(new Set())
  const [excludedYears, setExcludedYears] = useState<Set<string>>(new Set())
  const [filterEasyOnly, setFilterEasyOnly] = useState<boolean>(false)
  const [filterGuessedOnly, setFilterGuessedOnly] = useState<boolean>(false)
  const [replayQuestion, setReplayQuestion] = useState<Question | null>(null)

  // Lookup map: questionId → flag row (or undefined if no flags set)
  const flagMap = useMemo(() => {
    const m = new Map<string, { easyMarked: boolean; guessedMarked: boolean }>()
    for (const f of flags) {
      m.set(f.questionId, { easyMarked: f.easyMarked, guessedMarked: f.guessedMarked })
    }
    return m
  }, [flags])

  // Map for fast question lookup by id (avoids re-scanning pack.questions per row).
  const questionMap = useMemo(() => {
    const m = new Map<string, Question>()
    for (const q of pack.questions) m.set(q.id, q)
    return m
  }, [pack.questions])

  // Family display name + color lookup.
  const familyMap = useMemo(() => {
    const m = new Map<string, { displayName: string; color: string; group: string }>()
    for (const s of pack.subjects) {
      m.set(s.id, {
        displayName: s.displayName,
        color: s.color ?? '#8c6d4a',
        group: s.group ?? 'DA',
      })
    }
    return m
  }, [pack.subjects])

  // Distinct exam years for the chip set → stable, descending. `history` is the
  // superset of both wrong-answer tabs; `bookmarks` is scanned separately
  // because a bookmarked question may never have been answered (so its year
  // wouldn't appear in `history`).
  const yearOptions = useMemo(() => {
    const years = new Set<string>()
    for (const b of bookmarks) years.add(parseExamYear(b.questionId))
    for (const w of history) years.add(parseExamYear(w.questionId))
    return [...years].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  }, [bookmarks, history])

  const filter: WrongAnswerFilterState = useMemo(
    () => ({ excludedFamilies, excludedYears, easyOnly: filterEasyOnly, guessedOnly: filterGuessedOnly }),
    [excludedFamilies, excludedYears, filterEasyOnly, filterGuessedOnly],
  )

  const passesFilter = (item: { family: string; questionId: string }): boolean =>
    matchesWrongAnswerFilter(item, filter, flagMap.get(item.questionId))

  const filteredBookmarks = useMemo(
    () => bookmarks.filter((b) => passesFilter({ family: b.family, questionId: b.questionId })),
    [bookmarks, filter, flagMap],
  )
  // Derive both wrong-answer views from the single `history` subscription.
  const filteredCurrentWrong = useMemo(
    () => history.filter((w) => w.lastResult === 'wrong' && passesFilter({ family: w.family, questionId: w.questionId })),
    [history, filter, flagMap],
  )
  const filteredHistoryWrong = useMemo(
    () => history.filter((w) => w.everWrong && passesFilter({ family: w.family, questionId: w.questionId })),
    [history, filter, flagMap],
  )
  const hasAnyCurrentWrong = useMemo(() => history.some((w) => w.lastResult === 'wrong'), [history])
  const hasAnyHistoryWrong = useMemo(() => history.some((w) => w.everWrong), [history])

  const makeToggleChip =
    (setState: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (value: string): void => {
      setState((prev) => {
        const next = new Set(prev)
        if (next.has(value)) next.delete(value)
        else next.add(value)
        return next
      })
    }
  const toggleFamilyChip = makeToggleChip(setExcludedFamilies)
  const toggleYearChip = makeToggleChip(setExcludedYears)

  function handleReplay(questionId: string): void {
    const q = questionMap.get(questionId)
    if (q) setReplayQuestion(q)
  }

  function handleRemove(questionId: string): void {
    void removeBookmark(questionId)
  }

  function renderFlagChips(questionId: string): JSX.Element {
    const f = flagMap.get(questionId)
    return (
      <>
        {f?.easyMarked && (
          <span style={flagChipDisplayStyle('#d4a04d')} title="✨ 太簡單" aria-label="標記為太簡單">
            ✨
          </span>
        )}
        {f?.guessedMarked && (
          <span style={flagChipDisplayStyle('#6a9bc4')} title="🤔 我亂猜的" aria-label="標記為我亂猜的">
            🤔
          </span>
        )}
      </>
    )
  }

  // Shared row content (badge group + year + flags + time + truncated stem),
  // used by both the manual-bookmark list and the two wrong-answer lists. The
  // manual list appends its own action footer; wrong rows are display-only.
  function renderRowHeadAndStem(questionId: string, familyId: string, timeTs: number): JSX.Element {
    const q = questionMap.get(questionId)
    const family = familyMap.get(familyId)
    return (
      <>
        <header style={rowHeaderStyle}>
          <div style={badgeGroupStyle}>
            <span style={familyBadgeStyle(family?.color ?? '#8c6d4a')} title={family?.displayName ?? familyId}>
              {familyId}
            </span>
            <span style={yearBadgeStyle} title="考試年度（民國）">
              {parseExamYear(questionId)}年
            </span>
            {renderFlagChips(questionId)}
          </div>
          <span style={timeStyle}>{relativeTime(timeTs)}</span>
        </header>
        <p style={stemStyle}>
          {q ? truncate(q.stem, STEM_TRUNCATE_LEN) : '（題目資料缺失 — 可能是 content pack 已更新）'}
        </p>
      </>
    )
  }

  function renderWrongList(rows: QuestionHistoryRow[], hasAny: boolean, emptyText: string): JSX.Element {
    if (!hasAny) {
      return <p style={noMatchStyle}>{emptyText}</p>
    }
    if (rows.length === 0) {
      return (
        <p style={noMatchStyle}>目前篩選下沒有題目。調整上方的科目 / 年份 / 標記篩選把題目找回來。</p>
      )
    }
    return (
      <ul style={listStyle} role="list">
        {rows.slice(0, MAX_RENDER).map((row) => (
          <li key={row.questionId} style={rowStyle}>
            {renderRowHeadAndStem(row.questionId, row.family, row.lastAnsweredAt)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <header style={headerStyle}>
        <h1 style={titleStyle}>📚 收藏與錯題</h1>
        <p style={subtitleStyle}>
          手動收藏的題目，加上自動累積的錯題複習清單。錯題庫從這個功能上線後開始累積。
        </p>
      </header>

      {/* Shared filter bar — applies to all three tabs. */}
      <section style={filterBarStyle} aria-label="標記篩選">
        <div style={filterHeaderStyle}>
          <span style={filterLabelStyle}>🏷️ 依標記篩選</span>
          {(filterEasyOnly || filterGuessedOnly) && (
            <button
              type="button"
              style={resetBtnStyle}
              onClick={() => {
                setFilterEasyOnly(false)
                setFilterGuessedOnly(false)
              }}
            >
              清除標記篩選
            </button>
          )}
        </div>
        <div style={chipRowStyle}>
          <button
            type="button"
            onClick={() => setFilterEasyOnly((v) => !v)}
            style={filterEasyOnly ? flagFilterChipActiveStyle('#d4a04d') : flagFilterChipStyle('#d4a04d')}
            aria-pressed={filterEasyOnly}
          >
            ✨ 只看太簡單
          </button>
          <button
            type="button"
            onClick={() => setFilterGuessedOnly((v) => !v)}
            style={filterGuessedOnly ? flagFilterChipActiveStyle('#6a9bc4') : flagFilterChipStyle('#6a9bc4')}
            aria-pressed={filterGuessedOnly}
          >
            🤔 只看我亂猜的
          </button>
        </div>
      </section>

      {/* Family filter — chips grouped by NT branch, click toggles exclusion. */}
      <section style={filterBarStyle} aria-label="科目篩選">
        <div style={filterHeaderStyle}>
          <span style={filterLabelStyle}>📚 依科目篩選</span>
          {excludedFamilies.size > 0 && (
            <button type="button" style={resetBtnStyle} onClick={() => setExcludedFamilies(new Set())}>
              重置（顯示全部）
            </button>
          )}
        </div>
        <div style={chipRowStyle}>
          {NT_BRANCHES.flatMap((branch) =>
            pack.subjects
              .filter((s) => s.group === branch)
              .map((s) => {
                const excluded = excludedFamilies.has(s.id)
                const color = s.color ?? '#8c6d4a'
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleFamilyChip(s.id)}
                    style={excluded ? chipExcludedStyle(color) : chipIncludedStyle(color)}
                    aria-pressed={!excluded}
                    title={excluded ? `加入 ${s.id}` : `排除 ${s.id}`}
                  >
                    {s.id}
                  </button>
                )
              }),
          )}
        </div>
      </section>

      {/* Year filter — chips per 民國 exam year, click toggles exclusion. */}
      {yearOptions.length > 0 && (
        <section style={filterBarStyle} aria-label="年份篩選">
          <div style={filterHeaderStyle}>
            <span style={filterLabelStyle}>📅 依年份篩選</span>
            {excludedYears.size > 0 && (
              <button type="button" style={resetBtnStyle} onClick={() => setExcludedYears(new Set())}>
                重置（顯示全部）
              </button>
            )}
          </div>
          <div style={chipRowStyle}>
            {yearOptions.map((year) => {
              const excluded = excludedYears.has(year)
              const label = year === 'unknown' ? '其他' : `${year}年`
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => toggleYearChip(year)}
                  style={excluded ? chipExcludedStyle(YEAR_CHIP_COLOR) : chipIncludedStyle(YEAR_CHIP_COLOR)}
                  aria-pressed={!excluded}
                  title={excluded ? `加入 ${label}` : `排除 ${label}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Tab strip */}
      <div style={tabBarStyle} role="tablist" aria-label="收藏與錯題分頁">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'manual'}
          style={tab === 'manual' ? tabActiveStyle : tabStyle}
          onClick={() => setTab('manual')}
        >
          ⭐ 手動收藏 ({filteredBookmarks.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'currentWrong'}
          style={tab === 'currentWrong' ? tabActiveStyle : tabStyle}
          onClick={() => setTab('currentWrong')}
        >
          ❌ 目前未答對 ({filteredCurrentWrong.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'historyWrong'}
          style={tab === 'historyWrong' ? tabActiveStyle : tabStyle}
          onClick={() => setTab('historyWrong')}
        >
          📋 歷史曾錯 ({filteredHistoryWrong.length})
        </button>
      </div>

      {/* Active tab body */}
      {tab === 'manual' &&
        (bookmarks.length === 0 ? (
          <BookmarksEmptyState />
        ) : filteredBookmarks.length === 0 ? (
          <p style={noMatchStyle}>目前篩選下沒有收藏題目。調整上方的科目 / 年份 / 標記篩選把題目找回來。</p>
        ) : (
          <ul style={listStyle} role="list">
            {filteredBookmarks.slice(0, MAX_RENDER).map((b) => {
              const inPack = questionMap.has(b.questionId)
              return (
                <li key={b.questionId} style={rowStyle}>
                  {renderRowHeadAndStem(b.questionId, b.family, b.addedAt)}
                  <div style={rowActionsStyle}>
                    <button
                      type="button"
                      style={replayBtnStyle}
                      onClick={() => handleReplay(b.questionId)}
                      disabled={!inPack}
                      title={inPack ? '重新作答這一題' : '題目不在當前 content pack'}
                    >
                      🎯 重新作答
                    </button>
                    <button type="button" style={unbookmarkBtnStyle} onClick={() => handleRemove(b.questionId)} aria-label="取消收藏">
                      ★ 取消
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        ))}

      {tab === 'currentWrong' &&
        renderWrongList(
          filteredCurrentWrong,
          hasAnyCurrentWrong,
          '目前沒有未答對的題目。答錯題目時會自動出現在這裡；把題目答對後它就會離開這一頁（但仍保留在「歷史曾錯」）。',
        )}

      {tab === 'historyWrong' &&
        renderWrongList(
          filteredHistoryWrong,
          hasAnyHistoryWrong,
          '目前沒有曾經答錯的題目。只要答錯過一次，題目就會永久留在這裡供複習。',
        )}

      {replayQuestion && <QuizModal pool={[replayQuestion]} onClose={() => setReplayQuestion(null)} />}
    </>
  )
}

function BookmarksEmptyState(): JSX.Element {
  return (
    <section style={emptyStyle} aria-label="無收藏題目">
      <p style={{ fontSize: '2.5rem', margin: 0 }} aria-hidden>
        📭
      </p>
      <p>
        目前沒有收藏的題目。在答題時按 <strong>⭐ 收藏</strong> 按鈕或鍵盤 <kbd style={kbdStyle}>1</kbd> 加入收藏。
      </p>
      <a href="/" style={emptyLinkStyle}>
        ← 回總覽開始答題
      </a>
    </section>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '剛剛'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分鐘前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小時前`
  if (diff < 172_800_000) return '昨天'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  marginBottom: '1rem',
  padding: '0.85rem 1rem',
  background: 'linear-gradient(135deg, #fdf6e3 0%, #f4ecd8 100%)',
  border: '2px solid #8c6d4a',
  borderRadius: '6px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '1.35rem',
  margin: '0 0 0.25rem',
  color: '#3a2a1a',
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: '#5a3f29',
  fontSize: '0.9rem',
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.04rem 0.32rem',
  margin: '0 0.1rem',
  background: '#fdf6e3',
  border: '1px solid #8c6d4a',
  borderBottomWidth: '2px',
  borderRadius: '3px',
  fontFamily: "'VT323', 'Courier New', monospace",
  fontSize: '0.92em',
  color: '#3a2a1a',
  lineHeight: 1,
}

const filterBarStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  padding: '0.7rem 0.85rem',
  marginBottom: '1rem',
  borderRadius: '4px',
}

const filterHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.5rem',
}

const filterLabelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#3a2a1a',
  fontWeight: 700,
}

const resetBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #8c6d4a',
  borderRadius: '4px',
  padding: '0.2rem 0.55rem',
  fontSize: '0.75rem',
  color: '#5a3f29',
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
}

function chipIncludedStyle(color: string): React.CSSProperties {
  return {
    padding: '0.25rem 0.6rem',
    background: color,
    color: '#fff',
    border: `1px solid ${color}`,
    borderRadius: '999px',
    fontSize: '0.78rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  }
}

function chipExcludedStyle(color: string): React.CSSProperties {
  return {
    padding: '0.25rem 0.6rem',
    background: 'transparent',
    color: '#8c6d4a',
    border: `1px dashed ${color}`,
    borderRadius: '999px',
    fontSize: '0.78rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    opacity: 0.55,
  }
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
  marginBottom: '1rem',
}

const tabStyle: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  background: '#f4ecd8',
  color: '#5a3f29',
  border: '2px solid #c4a878',
  borderRadius: '6px',
  fontSize: '0.85rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const tabActiveStyle: React.CSSProperties = {
  ...tabStyle,
  background: '#8c6d4a',
  color: '#fff',
  border: '2px solid #6e5436',
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
  gap: '0.7rem',
}

const rowStyle: React.CSSProperties = {
  background: '#fff',
  border: '2px solid #d4c4a0',
  borderRadius: '6px',
  padding: '0.7rem 0.85rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  boxShadow: '0 1px 2px rgba(58, 42, 26, 0.06)',
}

const rowHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.5rem',
}

function familyBadgeStyle(color: string): React.CSSProperties {
  return {
    padding: '0.15rem 0.5rem',
    background: color,
    color: '#fff',
    borderRadius: '4px',
    fontSize: '0.78rem',
    fontWeight: 700,
  }
}

const yearBadgeStyle: React.CSSProperties = {
  padding: '0.15rem 0.45rem',
  background: '#fdf6e3',
  color: YEAR_CHIP_COLOR,
  border: `1px solid ${YEAR_CHIP_COLOR}`,
  borderRadius: '4px',
  fontSize: '0.74rem',
  fontWeight: 700,
}

const badgeGroupStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  flexWrap: 'wrap',
}

function flagChipDisplayStyle(color: string): React.CSSProperties {
  return {
    padding: '0.1rem 0.35rem',
    background: '#fdf6e3',
    color,
    border: `1px solid ${color}`,
    borderRadius: '4px',
    fontSize: '0.78rem',
    lineHeight: 1,
  }
}

function flagFilterChipStyle(color: string): React.CSSProperties {
  return {
    padding: '0.25rem 0.7rem',
    background: 'transparent',
    color: '#8c6d4a',
    border: `1px dashed ${color}`,
    borderRadius: '999px',
    fontSize: '0.78rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    opacity: 0.7,
  }
}

function flagFilterChipActiveStyle(color: string): React.CSSProperties {
  return {
    ...flagFilterChipStyle(color),
    background: color,
    color: '#fff',
    border: `1px solid ${color}`,
    opacity: 1,
  }
}

const timeStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#8c6d4a',
}

const stemStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.9rem',
  lineHeight: 1.5,
  color: '#3a2a1a',
  whiteSpace: 'pre-wrap',
}

const rowActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  marginTop: 'auto',
}

const replayBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.4rem 0.6rem',
  background: '#d4a04d',
  color: '#fff',
  border: '1px solid #b8893a',
  borderRadius: '4px',
  fontSize: '0.85rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const unbookmarkBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.7rem',
  background: 'transparent',
  color: '#c44d4d',
  border: '1px solid #c44d4d',
  borderRadius: '4px',
  fontSize: '0.82rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '3rem 1rem',
  background: '#f4ecd8',
  border: '2px dashed #c4a878',
  borderRadius: '6px',
  color: '#5a3f29',
}

const emptyLinkStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: '0.8rem',
  color: '#b8893a',
  textDecoration: 'underline',
  fontWeight: 600,
}

const noMatchStyle: React.CSSProperties = {
  padding: '1rem',
  background: '#fdf6e3',
  border: '1px dashed #c4a878',
  borderRadius: '4px',
  textAlign: 'center',
  color: '#8c6d4a',
}
