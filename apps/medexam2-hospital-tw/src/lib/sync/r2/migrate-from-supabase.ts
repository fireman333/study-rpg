// One-time migration: paginated SELECT from Supabase sync tables → build R2
// bundle → PUT via Worker presign. Used by `MigrationBanner` for M4-era users
// who already have Supabase row data but no R2 blobs.
//
// Phase 1 scope: M1 bundle only (一階 — player_state / srs_cards /
// item_instances / mentor_backlog). M2 + bookmarks are added by Phase 2
// (task 4.5).
//
// Idempotent: re-running after a partial failure skips bundles whose R2 blob
// already exists (HEAD-style probe via presigned GET).

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  gzipBundle,
  validateBundleMeta,
  type BundleSnapshot,
  getClientId,
} from './bundles'
import { requestPresign, type Bundle } from './client'
import { setEtag } from './etag'

const PAGE_SIZE = 1000  // Supabase default; chunked for `srs_cards` / `item_instances`
const SCHEMA_VERSION = 1

interface BundleSpec {
  bundle: Bundle
  postgresTables: ReadonlyArray<{ table: string; pkColumns: ReadonlyArray<string> }>
}

const M1_BUNDLE_SPEC: BundleSpec = {
  bundle: 'm1',
  postgresTables: [
    { table: 'player_state', pkColumns: [] },           // singleton: one row per user
    { table: 'srs_cards', pkColumns: ['question_id'] },
    { table: 'item_instances', pkColumns: ['id'] },
    { table: 'mentor_backlog', pkColumns: [] },         // singleton
  ],
}

const M2_BUNDLE_SPEC: BundleSpec = {
  bundle: 'm2',
  postgresTables: [
    { table: 'hospital_state', pkColumns: [] },                            // singleton
    { table: 'hospital_doctors', pkColumns: ['id'] },
    { table: 'hospital_mastery', pkColumns: ['subject_id'] },
    { table: 'hospital_question_history', pkColumns: ['question_id'] },
    { table: 'targeted_tickets', pkColumns: ['id'] },
    { table: 'targeted_ticket_history', pkColumns: ['ticket_id', 'event'] },
    { table: 'hospital_monotonic_counters', pkColumns: [] },               // singleton
  ],
}

const BOOKMARKS_BUNDLE_SPEC: BundleSpec = {
  bundle: 'bookmarks',
  postgresTables: [
    { table: 'question_bookmarks', pkColumns: ['question_id'] },
  ],
}

export const ALL_BUNDLE_SPECS: ReadonlyArray<BundleSpec> = [
  M1_BUNDLE_SPEC,
  M2_BUNDLE_SPEC,
  BOOKMARKS_BUNDLE_SPEC,
]

export interface MigrationResult {
  bundle: Bundle
  status: 'uploaded' | 'already-present' | 'no-rows' | 'failed'
  rowsByTable: Record<string, number>
  bytes?: number
  error?: string
}

export async function migrateM1FromSupabase(
  supabase: SupabaseClient,
  userId: string,
): Promise<MigrationResult> {
  return migrateBundle(supabase, userId, M1_BUNDLE_SPEC)
}

export async function migrateAllBundlesFromSupabase(
  supabase: SupabaseClient,
  userId: string,
): Promise<MigrationResult[]> {
  // Serial — keep this gentle on Supabase rate limits and presigner concurrency
  // limits. The biggest bundle (M2) caps around a few thousand rows for power
  // users; serial 3-bundle migration runs in single-digit seconds.
  const results: MigrationResult[] = []
  for (const spec of ALL_BUNDLE_SPECS) {
    results.push(await migrateBundle(supabase, userId, spec))
  }
  return results
}

async function migrateBundle(
  supabase: SupabaseClient,
  userId: string,
  spec: BundleSpec,
): Promise<MigrationResult> {
  const rowsByTable: Record<string, number> = {}

  try {
    // Step 0 — idempotency check. If a blob already exists at this key, skip.
    const exists = await r2BlobExists(supabase, spec.bundle)
    if (exists) {
      return { bundle: spec.bundle, status: 'already-present', rowsByTable }
    }

    // Step 1 — paginated SELECT from each sync table for this user.
    const data: Record<string, unknown[]> = {}
    let maxUpdatedAt = new Date(0).toISOString()
    let totalRows = 0

    for (const { table, pkColumns } of spec.postgresTables) {
      const rows = await paginatedSelect(supabase, table, userId, pkColumns)
      data[table] = rows
      rowsByTable[table] = rows.length
      totalRows += rows.length
      for (const row of rows) {
        const ts = (row as { updated_at?: string }).updated_at
        if (typeof ts === 'string' && ts > maxUpdatedAt) maxUpdatedAt = ts
      }
    }

    if (totalRows === 0) {
      // M4-era user with no rows is indistinguishable from a brand-new user.
      // No migration needed; banner detection will hide.
      return { bundle: spec.bundle, status: 'no-rows', rowsByTable }
    }

    // Step 2 — assemble bundle in spec's canonical shape (matches buildBundleSnapshot output).
    const snapshot: BundleSnapshot = {
      meta: {
        schema_version: SCHEMA_VERSION,
        updated_at: maxUpdatedAt,
        client_id: getClientId(),
      },
      data: data as Record<string, never>,  // RowPayload[] union with paginated rows
    }
    validateBundleMeta(snapshot)

    // Step 3 — gzip + PUT via presign. First push for this user → If-None-Match: *.
    const gz = await gzipBundle(snapshot)
    const { url } = await requestPresign(supabase, spec.bundle, 'put')
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/gzip',
        'If-None-Match': '*',
      },
      body: gz,
    })

    if (!res.ok) {
      // 412/428 — another device already pushed. Treat as already-present.
      if (res.status === 412 || res.status === 428) {
        return { bundle: spec.bundle, status: 'already-present', rowsByTable, bytes: gz.size }
      }
      const body = await res.text().catch(() => '')
      throw new Error(`r2_migrate_put_${res.status}: ${body.slice(0, 200)}`)
    }

    const etag = res.headers.get('ETag')
    if (etag) setEtag(spec.bundle, etag)

    return { bundle: spec.bundle, status: 'uploaded', rowsByTable, bytes: gz.size }
  } catch (err) {
    return {
      bundle: spec.bundle,
      status: 'failed',
      rowsByTable,
      error: (err as { message?: string })?.message ?? String(err),
    }
  }
}

async function paginatedSelect(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  pkColumns: ReadonlyArray<string>,
): Promise<unknown[]> {
  const all: unknown[] = []
  let from = 0
  // Order by pk columns for deterministic pagination. Singletons skip ordering.
  const orderColumns = pkColumns.length ? pkColumns : ['user_id']

  while (true) {
    let q = supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .range(from, from + PAGE_SIZE - 1)
    for (const col of orderColumns) {
      q = q.order(col, { ascending: true })
    }
    const { data, error } = await q
    if (error) throw new Error(`r2_migrate_select_${table}: ${error.message}`)
    if (!data || !data.length) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

async function r2BlobExists(supabase: SupabaseClient, bundle: Bundle): Promise<boolean> {
  try {
    const { url } = await requestPresign(supabase, bundle, 'get')
    // Range fetch — pulls just the first byte to confirm existence cheaply.
    const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
    return res.ok || res.status === 206
  } catch {
    return false
  }
}

export async function detectSupabaseHasM1Rows(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  return detectSupabaseHasRowsForBundle(supabase, userId, M1_BUNDLE_SPEC)
}

async function detectSupabaseHasRowsForBundle(
  supabase: SupabaseClient,
  userId: string,
  spec: BundleSpec,
): Promise<boolean> {
  // Probe each table in the bundle; first hit short-circuits true. Single-table
  // failures (RLS, transient 5xx) don't block the rest — we'd rather show the
  // banner on incomplete info than silently hide it.
  for (const { table } of spec.postgresTables) {
    const { count, error } = await supabase
      .from(table)
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .limit(1)
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[migrate-from-supabase] count probe ${table} failed:`, error.message)
      continue
    }
    if ((count ?? 0) > 0) return true
  }
  return false
}

export interface BundleMigrationProbe {
  bundle: Bundle
  supabaseHasRows: boolean
  r2HasBlob: boolean
  needsMigration: boolean
}

export async function detectM1NeedsMigration(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ supabaseHasRows: boolean; r2HasBlob: boolean; needsMigration: boolean }> {
  const [supabaseHasRows, r2HasBlob] = await Promise.all([
    detectSupabaseHasM1Rows(supabase, userId),
    r2BlobExists(supabase, 'm1'),
  ])
  return {
    supabaseHasRows,
    r2HasBlob,
    needsMigration: supabaseHasRows && !r2HasBlob,
  }
}

/**
 * Phase 2 detection — probes all 3 bundles in parallel. Banner triggers when
 * ANY bundle has Supabase rows but no R2 blob.
 */
export async function detectAllBundlesMigrationNeeded(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  probes: BundleMigrationProbe[]
  needsMigration: boolean
}> {
  const probes = await Promise.all(
    ALL_BUNDLE_SPECS.map(async (spec): Promise<BundleMigrationProbe> => {
      const [supabaseHasRows, r2HasBlob] = await Promise.all([
        detectSupabaseHasRowsForBundle(supabase, userId, spec),
        r2BlobExists(supabase, spec.bundle),
      ])
      return {
        bundle: spec.bundle,
        supabaseHasRows,
        r2HasBlob,
        needsMigration: supabaseHasRows && !r2HasBlob,
      }
    }),
  )
  return {
    probes,
    needsMigration: probes.some((p) => p.needsMigration),
  }
}
