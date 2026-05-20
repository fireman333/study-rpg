import type { Question } from '@study-rpg/core'

export const QUESTION_YEAR_FILTER_STORAGE_KEY = 'medexam2-question-year-filter-v1'
export const QUESTION_YEAR_FILTER_CHANGED_EVENT = 'medexam2-question-year-filter-changed'

interface StoredQuestionYearFilter {
  enabledYears?: unknown
}

function uniqSortedYears(years: Iterable<number>): number[] {
  return Array.from(new Set(years))
    .filter((year) => Number.isInteger(year))
    .sort((a, b) => a - b)
}

export function getQuestionYear(question: Question): number | null {
  const raw = question.meta?.year
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function normalizeEnabledQuestionYears(
  years: Iterable<number>,
  availableYears: ReadonlyArray<number>,
): number[] {
  const availableSet = new Set(availableYears)
  const normalized = uniqSortedYears(years).filter((year) => availableSet.has(year))
  return normalized.length > 0 ? normalized : [...availableYears]
}

export function getEnabledQuestionYears(availableYears: ReadonlyArray<number>): number[] {
  if (typeof localStorage === 'undefined') return [...availableYears]
  try {
    const raw = localStorage.getItem(QUESTION_YEAR_FILTER_STORAGE_KEY)
    if (!raw) return [...availableYears]
    const parsed = JSON.parse(raw) as StoredQuestionYearFilter
    if (!Array.isArray(parsed.enabledYears)) return [...availableYears]
    return normalizeEnabledQuestionYears(
      parsed.enabledYears.filter((year): year is number => typeof year === 'number'),
      availableYears,
    )
  } catch {
    return [...availableYears]
  }
}

export function setEnabledQuestionYears(
  years: Iterable<number>,
  availableYears: ReadonlyArray<number>,
): number[] {
  const normalized = normalizeEnabledQuestionYears(years, availableYears)
  if (typeof localStorage !== 'undefined') {
    try {
      if (normalized.length === availableYears.length) {
        localStorage.removeItem(QUESTION_YEAR_FILTER_STORAGE_KEY)
      } else {
        localStorage.setItem(
          QUESTION_YEAR_FILTER_STORAGE_KEY,
          JSON.stringify({ enabledYears: normalized }),
        )
      }
      window.dispatchEvent(
        new CustomEvent(QUESTION_YEAR_FILTER_CHANGED_EVENT, {
          detail: { enabledYears: normalized },
        }),
      )
    } catch {
      // Storage can fail in private browsing or quota-constrained contexts.
    }
  }
  return normalized
}

export function questionMatchesEnabledYears(
  question: Question,
  enabledYears: ReadonlySet<number>,
): boolean {
  const year = getQuestionYear(question)
  return year === null || enabledYears.has(year)
}

export function subscribeQuestionYearFilterChanges(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => callback()
  window.addEventListener(QUESTION_YEAR_FILTER_CHANGED_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(QUESTION_YEAR_FILTER_CHANGED_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}
