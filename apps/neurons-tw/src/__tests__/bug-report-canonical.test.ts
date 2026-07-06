import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  NEURONS_BUG_REPORT_CATEGORIES,
  BUG_REPORT_APPS,
  QUIZ_BUG_TARGETS,
  QUIZ_BUG_TARGET_TO_CATEGORY,
} from '@study-rpg/core'

/**
 * add-neurons-bug-report §7.3 + §7.4 — canonical-form guard.
 *
 * Every category the neurons UI can submit (form set + inline-flow mapped set)
 * MUST appear in the migration 0017 `category` CHECK, else Postgres rejects the
 * INSERT with 23514. These pure assertions catch UI↔DB drift without a DB.
 */

const migrationSql = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../supabase/migrations/0017_neurons_bug_reports.sql',
      import.meta.url,
    ),
  ),
  'utf8',
)

// The category CHECK is re-created (with 'desktop-app' added) by migration 0018, so the
// authoritative category list is the LATEST additive migration — 0019 (adds
// 'concept-tag-error', stacked on 0018's 'desktop-app'), not 0017.
const categoryMigrationSql = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../supabase/migrations/0019_neurons_concept_tag_category.sql',
      import.meta.url,
    ),
  ),
  'utf8',
)

/** Extract the quoted values inside a `<name> CHECK (<col> IN ( ... ))` block. */
function checkValues(sql: string, constraintName: string): Set<string> {
  const marker = `${constraintName} CHECK (`
  const start = sql.indexOf(marker)
  if (start === -1) throw new Error(`constraint ${constraintName} not found in migration`)
  // Find the matching IN ( ... ) close — first `))` after the marker.
  const tail = sql.slice(start)
  const close = tail.indexOf('))')
  const block = tail.slice(0, close)
  const values = [...block.matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
  return new Set(values)
}

describe('bug_reports migration 0017 canonical form', () => {
  const categoryCheck = checkValues(categoryMigrationSql, 'bug_reports_category_check')
  const appCheck = checkValues(migrationSql, 'bug_reports_app_check')

  it('every neurons form category is present in the category CHECK', () => {
    for (const c of NEURONS_BUG_REPORT_CATEGORIES) {
      expect(categoryCheck.has(c), `category "${c}" missing from migration CHECK`).toBe(true)
    }
  })

  it('every inline-flow mapped category is present in the category CHECK', () => {
    for (const target of QUIZ_BUG_TARGETS) {
      const cat = QUIZ_BUG_TARGET_TO_CATEGORY[target]
      expect(categoryCheck.has(cat), `inline category "${cat}" missing from migration CHECK`).toBe(
        true,
      )
    }
  })

  it("app CHECK includes 'neurons-tw' and core BUG_REPORT_APPS agrees", () => {
    expect(appCheck.has('neurons-tw')).toBe(true)
    expect(BUG_REPORT_APPS).toContain('neurons-tw')
  })

  it('the four neurons-unique categories are in the CHECK', () => {
    for (const c of ['maze-exploration', 'variant-collection', 'synapse', 'dmn-fate-cards']) {
      expect(categoryCheck.has(c)).toBe(true)
    }
  })
})

describe('inline quiz bug-target mapping', () => {
  it('every QUIZ_BUG_TARGET has a category mapping (exhaustive)', () => {
    for (const t of QUIZ_BUG_TARGETS) {
      expect(typeof QUIZ_BUG_TARGET_TO_CATEGORY[t]).toBe('string')
    }
  })
})
