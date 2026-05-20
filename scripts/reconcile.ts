/**
 * Reconcile Supabase sync rows ↔ R2 bundle blob for the dual-write bake window.
 *
 * Implements OpenSpec change `add-r2-cloud-sync-migration` tasks 3.10 + 4.4.
 *
 * Two run modes:
 *   self  (default) — uses owner's Supabase JWT to pull own rows AND own R2 blob
 *                     via Worker /presign. No service-role key needed.
 *   admin (TODO)   — sample N users via service-role; reads R2 via S3 client
 *                     bypassing Worker. Requires SUPABASE_SERVICE_ROLE_KEY and
 *                     R2 S3 credentials. Stub returns error until lit up.
 *
 * Usage:
 *   pnpm reconcile --session ./scratch/sb-session.json
 *   pnpm reconcile --session ./scratch/sb-session.json --bundles m2,bookmarks
 *   pnpm reconcile --session ./scratch/sb-session.json --out ./scratch/diff.json
 *
 * Get session JSON: sign in on localhost:5173, in devtools run
 *   copy(localStorage.getItem('sb-jakdyjxojokyqxeiuukx-auth-token'))
 * paste into a file, point --session at it.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { promises as fs } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'

// ─── Bundle schema (mirrors apps/*/src/lib/sync/r2/migrate-from-supabase.ts) ──

type Bundle = 'm1' | 'm2' | 'bookmarks'

interface BundleSpec {
  bundle: Bundle
  postgresTables: ReadonlyArray<{ table: string; pkColumns: ReadonlyArray<string> }>
}

const M1_BUNDLE_SPEC: BundleSpec = {
  bundle: 'm1',
  postgresTables: [
    { table: 'player_state', pkColumns: [] },
    { table: 'srs_cards', pkColumns: ['question_id'] },
    { table: 'item_instances', pkColumns: ['id'] },
    { table: 'mentor_backlog', pkColumns: [] },
  ],
}

const M2_BUNDLE_SPEC: BundleSpec = {
  bundle: 'm2',
  postgresTables: [
    { table: 'hospital_state', pkColumns: [] },
    { table: 'hospital_doctors', pkColumns: ['id'] },
    { table: 'hospital_mastery', pkColumns: ['subject_id'] },
    { table: 'hospital_question_history', pkColumns: ['question_id'] },
    { table: 'targeted_tickets', pkColumns: ['id'] },
    { table: 'targeted_ticket_history', pkColumns: ['ticket_id', 'event'] },
    { table: 'hospital_monotonic_counters', pkColumns: [] },
  ],
}

const BOOKMARKS_BUNDLE_SPEC: BundleSpec = {
  bundle: 'bookmarks',
  postgresTables: [
    { table: 'question_bookmarks', pkColumns: ['question_id'] },
  ],
}

const ALL_BUNDLES: ReadonlyArray<BundleSpec> = [M1_BUNDLE_SPEC, M2_BUNDLE_SPEC, BOOKMARKS_BUNDLE_SPEC]

// ─── CLI parsing ──────────────────────────────────────────────────────────────

interface Args {
  mode: 'self' | 'admin'
  sessionPath?: string
  refreshToken?: string
  bundles: ReadonlyArray<Bundle>
  outPath?: string
  envPath: string
  workerUrl?: string
  toleranceMs: number
}

function parseArgs(argv: ReadonlyArray<string>): Args {
  const args: Args = {
    mode: 'self',
    bundles: ALL_BUNDLES.map((b) => b.bundle),
    envPath: 'apps/medexam-tw/.env.local',
    toleranceMs: 1000,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
      case '--mode':
        args.mode = argv[++i] as Args['mode']
        break
      case '--session':
        args.sessionPath = argv[++i]
        break
      case '--refresh-token':
        args.refreshToken = argv[++i]
        break
      case '--bundles': {
        const raw = argv[++i] ?? 'all'
        args.bundles = raw === 'all'
          ? ALL_BUNDLES.map((b) => b.bundle)
          : (raw.split(',').map((s) => s.trim()) as Bundle[])
        break
      }
      case '--out':
        args.outPath = argv[++i]
        break
      case '--env':
        args.envPath = argv[++i]
        break
      case '--worker':
        args.workerUrl = argv[++i]
        break
      case '--tolerance-ms':
        args.toleranceMs = Number(argv[++i])
        break
      default:
        throw new Error(`Unknown arg: ${a}`)
    }
  }
  return args
}

function printHelp(): void {
  console.log(`
Reconcile Supabase sync rows ↔ R2 bundle blob.

Usage:
  pnpm reconcile --session <path>                       reconcile all 3 bundles
  pnpm reconcile --session <path> --bundles m1,m2       subset
  pnpm reconcile --session <path> --out ./diff.json     dump detail to JSON

Flags:
  --mode self|admin       self (default) uses owner JWT; admin needs service-role (TODO)
  --session <path>        JSON file holding { access_token, refresh_token, user: { id } }
                          Grab via devtools on a signed-in localhost session:
                            copy(localStorage.getItem('sb-jakdyjxojokyqxeiuukx-auth-token'))
  --refresh-token <tok>   Alternative to --session — only needs the short refresh token
                          (12-char string). access_token is auto-refreshed via Supabase Auth.
                          Useful when JWT exfil checks block raw access_token copy.
  --bundles m1|m2|bookmarks|all      comma-separated (default: all)
  --env <path>            dotenv file with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
                          + VITE_SYNC_WORKER_URL (default: apps/medexam-tw/.env.local)
  --worker <url>          override worker URL (else from env)
  --tolerance-ms <ms>     updated_at drift tolerance (default 1000)
  --out <path>            write detailed diff JSON

Exit code is 0 even when drift is found — this is a diagnostic, not a gate.
`)
}

// ─── Env loading (lightweight dotenv parse) ───────────────────────────────────

interface EnvBag {
  supabaseUrl: string
  supabaseAnonKey: string
  workerUrl: string
}

async function loadEnv(envPath: string, workerOverride?: string): Promise<EnvBag> {
  let raw = ''
  try {
    raw = await fs.readFile(envPath, 'utf8')
  } catch (err) {
    throw new Error(
      `Cannot read env file at ${envPath}: ${(err as Error).message}. ` +
        `Either copy apps/medexam-tw/.env.local into place or pass --env <path>.`,
    )
  }
  const map: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    map[m[1]] = v
  }
  const supabaseUrl = map.VITE_SUPABASE_URL
  const supabaseAnonKey = map.VITE_SUPABASE_ANON_KEY
  const workerUrl = workerOverride ?? map.VITE_SYNC_WORKER_URL
  if (!supabaseUrl) throw new Error(`VITE_SUPABASE_URL missing in ${envPath}`)
  if (!supabaseAnonKey) throw new Error(`VITE_SUPABASE_ANON_KEY missing in ${envPath}`)
  if (!workerUrl) throw new Error(`VITE_SYNC_WORKER_URL missing in ${envPath} and no --worker flag`)
  return { supabaseUrl, supabaseAnonKey, workerUrl }
}

// ─── Session loading ──────────────────────────────────────────────────────────

interface SessionShape {
  access_token: string
  refresh_token: string
  user?: { id?: string }
  // Supabase JS v2 stores currentSession at top level; older snapshots wrap it.
  // We accept both shapes.
}

async function loadSession(p: string): Promise<SessionShape> {
  const raw = await fs.readFile(p, 'utf8')
  // localStorage value may itself be a JSON string OR a JSON-encoded JSON string.
  let parsed: unknown = JSON.parse(raw)
  if (typeof parsed === 'string') parsed = JSON.parse(parsed)
  const obj = parsed as Record<string, unknown>

  // Supabase JS v2 localStorage shape: { access_token, refresh_token, user: { id } }
  // Older / nested shape: { currentSession: { ... } }
  const session =
    (obj.access_token ? obj : (obj.currentSession as Record<string, unknown> | undefined)) ?? obj
  const s = session as Partial<SessionShape>
  if (!s.access_token || !s.refresh_token) {
    throw new Error(
      `Session file at ${p} missing access_token / refresh_token. ` +
        `Sign in on localhost:5173 and copy localStorage 'sb-<ref>-auth-token' value into the file.`,
    )
  }
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    user: s.user,
  }
}

// ─── Self-mode: pull R2 blob via Worker presign ───────────────────────────────

async function requestPresign(
  workerUrl: string,
  accessToken: string,
  bundle: Bundle,
  op: 'get' | 'put',
): Promise<string> {
  const res = await fetch(`${workerUrl}/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ bundle, op }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`presign_failed_${res.status}: ${body.slice(0, 200)}`)
  }
  const { url } = (await res.json()) as { url: string }
  return url
}

interface BlobFetchResult {
  present: boolean
  schemaVersion?: number
  updatedAt?: string
  clientId?: string
  rowsByTable: Record<string, ReadonlyArray<Record<string, unknown>>>
  bytes?: number
}

async function fetchR2Blob(
  workerUrl: string,
  accessToken: string,
  bundle: Bundle,
): Promise<BlobFetchResult> {
  const url = await requestPresign(workerUrl, accessToken, bundle, 'get')
  const res = await fetch(url, { method: 'GET' })
  if (res.status === 404) {
    return { present: false, rowsByTable: {} }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`r2_get_${res.status}: ${body.slice(0, 200)}`)
  }
  const gz = Buffer.from(await res.arrayBuffer())
  const text = gunzipSync(gz).toString('utf8')
  const parsed = JSON.parse(text) as {
    meta?: { schema_version?: number; updated_at?: string; client_id?: string }
    data?: Record<string, ReadonlyArray<Record<string, unknown>>>
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.meta || !parsed.data) {
    throw new Error('invalid_bundle_structure')
  }
  return {
    present: true,
    schemaVersion: parsed.meta.schema_version,
    updatedAt: parsed.meta.updated_at,
    clientId: parsed.meta.client_id,
    rowsByTable: parsed.data,
    bytes: gz.byteLength,
  }
}

// ─── Supabase row pulling ─────────────────────────────────────────────────────

async function pullSupabaseRows(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  pkColumns: ReadonlyArray<string>,
): Promise<Record<string, unknown>[]> {
  const PAGE_SIZE = 1000
  const out: Record<string, unknown>[] = []
  const order = pkColumns.length ? pkColumns : ['user_id']
  let from = 0
  while (true) {
    let q = supabase.from(table).select('*').eq('user_id', userId).range(from, from + PAGE_SIZE - 1)
    for (const col of order) q = q.order(col, { ascending: true })
    const { data, error } = await q
    if (error) throw new Error(`select_${table}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return out
}

// ─── Diff core ────────────────────────────────────────────────────────────────

interface DiffRow {
  table: string
  pk: string
  kind: 'only-supabase' | 'only-r2' | 'updated-at-drift'
  supabaseUpdatedAt?: string
  r2UpdatedAt?: string
  driftMs?: number
}

interface TableDiff {
  table: string
  supabaseCount: number
  r2Count: number
  mismatches: DiffRow[]
}

interface BundleDiff {
  bundle: Bundle
  r2Present: boolean
  r2Bytes?: number
  r2SchemaVersion?: number
  r2UpdatedAt?: string
  r2ClientId?: string
  perTable: TableDiff[]
  totalMismatches: number
}

function makePk(row: Record<string, unknown>, pkColumns: ReadonlyArray<string>): string {
  if (pkColumns.length === 0) return ''
  return pkColumns.map((c) => String(row[c] ?? '')).join('|')
}

function diffTable(
  table: string,
  pkColumns: ReadonlyArray<string>,
  supabaseRows: ReadonlyArray<Record<string, unknown>>,
  r2Rows: ReadonlyArray<Record<string, unknown>>,
  toleranceMs: number,
): TableDiff {
  const supMap = new Map<string, Record<string, unknown>>()
  for (const r of supabaseRows) supMap.set(makePk(r, pkColumns), r)
  const r2Map = new Map<string, Record<string, unknown>>()
  for (const r of r2Rows) r2Map.set(makePk(r, pkColumns), r)

  const mismatches: DiffRow[] = []
  for (const [pk, supRow] of supMap) {
    const r2Row = r2Map.get(pk)
    if (!r2Row) {
      mismatches.push({
        table,
        pk,
        kind: 'only-supabase',
        supabaseUpdatedAt: String(supRow.updated_at ?? ''),
      })
      continue
    }
    const supTs = String(supRow.updated_at ?? '')
    const r2Ts = String(r2Row.updated_at ?? '')
    if (supTs && r2Ts) {
      const drift = Math.abs(Date.parse(supTs) - Date.parse(r2Ts))
      if (drift > toleranceMs) {
        mismatches.push({
          table,
          pk,
          kind: 'updated-at-drift',
          supabaseUpdatedAt: supTs,
          r2UpdatedAt: r2Ts,
          driftMs: drift,
        })
      }
    }
  }
  for (const [pk, r2Row] of r2Map) {
    if (!supMap.has(pk)) {
      mismatches.push({
        table,
        pk,
        kind: 'only-r2',
        r2UpdatedAt: String(r2Row.updated_at ?? ''),
      })
    }
  }

  return {
    table,
    supabaseCount: supMap.size,
    r2Count: r2Map.size,
    mismatches,
  }
}

// ─── Reconcile orchestration ──────────────────────────────────────────────────

async function reconcileOneBundle(
  supabase: SupabaseClient,
  workerUrl: string,
  accessToken: string,
  userId: string,
  spec: BundleSpec,
  toleranceMs: number,
): Promise<BundleDiff> {
  const blob = await fetchR2Blob(workerUrl, accessToken, spec.bundle)

  const perTable: TableDiff[] = []
  for (const { table, pkColumns } of spec.postgresTables) {
    const supabaseRows = await pullSupabaseRows(supabase, table, userId, pkColumns)
    const r2Rows = blob.present ? (blob.rowsByTable[table] ?? []) : []
    perTable.push(diffTable(table, pkColumns, supabaseRows, r2Rows, toleranceMs))
  }
  const totalMismatches = perTable.reduce((acc, t) => acc + t.mismatches.length, 0)

  return {
    bundle: spec.bundle,
    r2Present: blob.present,
    r2Bytes: blob.bytes,
    r2SchemaVersion: blob.schemaVersion,
    r2UpdatedAt: blob.updatedAt,
    r2ClientId: blob.clientId,
    perTable,
    totalMismatches,
  }
}

// ─── Pretty printer ───────────────────────────────────────────────────────────

function printBundleDiff(d: BundleDiff): void {
  const tag = d.totalMismatches === 0 ? '✓' : '⚠'
  const presence = d.r2Present
    ? `r2 ${d.r2Bytes ?? '?'}B, schema_v${d.r2SchemaVersion ?? '?'}, updated_at=${d.r2UpdatedAt ?? '?'}`
    : 'r2 BLOB MISSING'
  console.log(`\n=== [${d.bundle}] ${tag} ${d.totalMismatches} mismatch(es) — ${presence} ===`)
  for (const t of d.perTable) {
    const driftCount = t.mismatches.length
    const status = driftCount === 0 ? '✓' : `⚠ ${driftCount} drift`
    console.log(`  ${t.table.padEnd(32)} supabase=${String(t.supabaseCount).padStart(5)} r2=${String(t.r2Count).padStart(5)} ${status}`)
    for (const m of t.mismatches.slice(0, 10)) {
      const detail =
        m.kind === 'updated-at-drift'
          ? `${m.kind} (drift=${m.driftMs}ms; supabase=${m.supabaseUpdatedAt}, r2=${m.r2UpdatedAt})`
          : `${m.kind} (updated_at=${m.supabaseUpdatedAt ?? m.r2UpdatedAt ?? ''})`
      console.log(`     - pk='${m.pk}': ${detail}`)
    }
    if (t.mismatches.length > 10) {
      console.log(`     … +${t.mismatches.length - 10} more (see --out JSON for full list)`)
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.mode === 'admin') {
    console.error('admin mode not implemented yet — needs SUPABASE_SERVICE_ROLE_KEY + R2 S3 client')
    console.error('(blocked on multi-user dogfood + R2 access key provisioning; see design.md)')
    process.exit(2)
  }
  if (!args.sessionPath && !args.refreshToken) {
    console.error('--session <path> or --refresh-token <tok> is required in self mode')
    process.exit(2)
  }

  const env = await loadEnv(args.envPath, args.workerUrl)
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let accessToken: string
  let userId: string | undefined
  if (args.sessionPath) {
    const session = await loadSession(args.sessionPath)
    const { data, error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
    if (error) throw new Error(`setSession failed: ${error.message}`)
    accessToken = data.session?.access_token ?? session.access_token
    userId = data.session?.user.id ?? session.user?.id
  } else {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: args.refreshToken!,
    })
    if (error) throw new Error(`refreshSession failed: ${error.message}`)
    if (!data.session) throw new Error('refreshSession returned no session (token expired?)')
    accessToken = data.session.access_token
    userId = data.session.user.id
  }
  if (!userId) throw new Error('No user_id resolved from session — token may be expired')

  console.log(`[reconcile] mode=self user=${userId} worker=${env.workerUrl}`)
  console.log(`[reconcile] bundles=${args.bundles.join(',')} tolerance=${args.toleranceMs}ms`)

  const specs = ALL_BUNDLES.filter((s) => args.bundles.includes(s.bundle))
  const results: BundleDiff[] = []
  for (const spec of specs) {
    results.push(await reconcileOneBundle(
      supabase, env.workerUrl, accessToken, userId, spec, args.toleranceMs,
    ))
  }

  for (const r of results) printBundleDiff(r)

  const grandTotal = results.reduce((acc, r) => acc + r.totalMismatches, 0)
  console.log(`\n[reconcile] DONE — ${grandTotal} total mismatch(es) across ${results.length} bundle(s)`)

  if (args.outPath) {
    const out = {
      mode: args.mode,
      userId,
      workerUrl: env.workerUrl,
      toleranceMs: args.toleranceMs,
      generatedAt: new Date().toISOString(),
      bundles: results,
    }
    await fs.mkdir(path.dirname(args.outPath), { recursive: true })
    await fs.writeFile(args.outPath, JSON.stringify(out, null, 2), 'utf8')
    console.log(`[reconcile] wrote detail JSON → ${args.outPath}`)
  }
}

main().catch((err) => {
  console.error(`[reconcile] FAIL: ${(err as Error).message}`)
  process.exit(1)
})
