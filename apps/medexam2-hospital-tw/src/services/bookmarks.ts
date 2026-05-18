/**
 * Bookmarks service — IDB-first persistence + Markdown export.
 *
 * Per add-quiz-question-id-and-bookmark design.md §2 / §5:
 *   - toggleBookmark: idempotent star/un-star, source of truth = local Dexie
 *   - useBookmark / useAllBookmarks: dexie-react-hooks live queries
 *   - exportBookmarksMarkdown: pure helper, content per design §5 sample
 *   - triggerBookmarksDownload: Blob + object URL + simulated <a download>
 *
 * Sync engine's Dexie hook auto-stamps `_updatedAt` on writes (see
 * `apps/medexam2-hospital-tw/src/lib/sync/engine.ts:85`); service code never
 * touches it manually.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import type { Question } from '@study-rpg/core'
import { getHospitalDB, type BookmarkRow } from '../db/schema'

export async function toggleBookmark(questionId: string): Promise<void> {
  const db = getHospitalDB()
  const existing = await db.bookmarks.get(questionId)
  if (existing) {
    await db.bookmarks.delete(questionId)
  } else {
    await db.bookmarks.put({ questionId, addedAt: Date.now() })
  }
}

export function useBookmark(questionId: string | undefined): BookmarkRow | undefined {
  return useLiveQuery(
    async () => (questionId ? await getHospitalDB().bookmarks.get(questionId) : undefined),
    [questionId],
  )
}

export function useAllBookmarks(): BookmarkRow[] | undefined {
  return useLiveQuery(() =>
    getHospitalDB().bookmarks.orderBy('addedAt').reverse().toArray(),
  )
}

/**
 * Pure helper — turn bookmark rows + question lookup into a Markdown string
 * per design.md §5. Missing questions render a stub section.
 */
export function exportBookmarksMarkdown(
  rows: readonly BookmarkRow[],
  questionsById: ReadonlyMap<string, Question>,
  now: Date = new Date(),
): string {
  const stamp =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` +
    ` ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const sections = rows.map((r) => {
    const q = questionsById.get(r.questionId)
    if (!q) {
      return [
        `## ${r.questionId}`,
        '',
        '> 題目已不在題庫（可能因內容版本更新移除）。',
      ].join('\n')
    }
    const optionsLines = Object.entries(q.options).map(([key, text]) => `- (${key}) ${text}`)
    const answerLine = q.disputed
      ? `**正解：** ⚖️ 送分題（考選部判定全部給分）`
      : `**正解：** (${q.answer})`
    return [
      `## ${q.id}`,
      '',
      q.stem,
      '',
      ...optionsLines,
      '',
      answerLine,
      '',
      `**詳解：** ${q.explanation}`,
    ].join('\n')
  })

  return [
    `# 收藏題目 (${rows.length})`,
    `匯出時間：${stamp}`,
    '',
    '---',
    '',
    sections.join('\n\n---\n\n'),
    '',
  ].join('\n')
}

export function downloadFilename(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `bookmarks-${y}-${m}-${d}.md`
}

export function triggerBookmarksDownload(
  rows: readonly BookmarkRow[],
  questionsById: ReadonlyMap<string, Question>,
): void {
  const now = new Date()
  const md = exportBookmarksMarkdown(rows, questionsById, now)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadFilename(now)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
