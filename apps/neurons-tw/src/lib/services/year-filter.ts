/**
 * Exam-year filter for the homepage quiz pool. Mirrors 二階
 * `services/year-filter.ts`: a Dexie-meta-persisted set of 民國 years that
 * gates which questions the quiz can serve. `null` / `[]` both mean「全選」.
 *
 * neurons difference: `MetaRow.value` is a string, so the year array is
 * JSON-encoded (二階's meta value is freeform).
 *
 * Local-only — NOT added to lib/sync `SYNCED_META_KEYS` (gameplay preference,
 * matches 二階).
 *
 * Spec: openspec/specs/neurons-quiz-year-filter/spec.md
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '../db'

export const YEAR_FILTER_META_KEY = 'quiz.yearFilter'

/** 民國 years available in the neurons (一階) corpus (104, 105, 106–114, 115). */
export const ALL_YEARS: readonly number[] = [104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115]

const ALL_YEARS_SET: ReadonlySet<number> = new Set(ALL_YEARS)

/**
 * Read the persisted year selection. Never throws — a missing row, non-string
 * value, parse error, or non-array all resolve to `null` (= all years via
 * effectiveYearSet). Unknown years are dropped.
 */
export async function getYearFilter(): Promise<number[] | null> {
  const row = await db.meta.get(YEAR_FILTER_META_KEY)
  if (!row || typeof row.value !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(row.value)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const cleaned: number[] = []
  for (const v of parsed) {
    if (typeof v === 'number' && ALL_YEARS_SET.has(v)) cleaned.push(v)
  }
  return cleaned
}

/** Persist the year selection (filtered to valid years, descending). */
export async function setYearFilter(years: number[]): Promise<void> {
  const cleaned = years.filter((y) => ALL_YEARS_SET.has(y)).sort((a, b) => b - a)
  await db.meta.put({ key: YEAR_FILTER_META_KEY, value: JSON.stringify(cleaned) })
}

/**
 * Derive the effective year Set. Both `null` (no row) AND `[]` (empty array)
 * map to「全選 9 年」 — single source of truth for the "default = everything"
 * semantics, so chips, the bar, and the pool gate all agree.
 */
export function effectiveYearSet(persisted: number[] | null): Set<number> {
  if (!persisted || persisted.length === 0) return new Set(ALL_YEARS)
  return new Set(persisted)
}

/** Reactive hook — the persisted year array (or null while loading / unset). */
export function useYearFilter(): number[] | null {
  const [years, setYears] = useState<number[] | null>(null)
  useEffect(() => {
    const sub = liveQuery(() => getYearFilter()).subscribe({
      next: (val) => setYears(val),
      error: () => setYears(null),
    })
    return () => sub.unsubscribe()
  }, [])
  return years
}
