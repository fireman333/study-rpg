// Bundle build / apply / gzip — wraps Dexie state into the R2 blob shape
// for the `neurons` bundle.
//
// Bundle name on the server: users/<sub>/neurons-snapshot.json.gz
//
// SCHEMA_VERSION history:
//   v1 — initial (add-neurons-deploy 2026-05-25): synapses / familyAccrual /
//        meta / familyMastery / neuronVariants / leaderboardProfile /
//        achievements
//   v2 — add-neurons-dmn-fate-card 2026-05-27: adds dmnCards / dmnEventLog /
//        dmnActiveBuffs adapters + 8 new dmn-* keys to the meta allowlist.
//        Schema is additive — v1 clients pulling v2 bundles silently drop
//        unknown adapter keys (see validateBundleMeta below).
//   v3 — add-neurons-question-bookmarks 2026-05-29: adds questionBookmarks
//        and questionBookmarkTombstones adapters. Additive — v2 clients drop
//        the new keys, no breaking changes.
//   v4 — add-neurons-srs-binary-modifiers 2026-05-29: adds questionFlags
//        adapter (✨ 太簡單 / 🤔 我亂猜的 binary flags). Additive — v3
//        clients drop the new field.
//   v5 — add-neurons-wrong-questions-subtab 2026-06-01: adds questionHistory
//        adapter (per-question lastResult + everWrong, backs the 錯題 sub-tabs).
//        everWrong merges via MONOTONIC-OR (see tables.ts). Additive — v4
//        clients drop the new key.
//   v6 — add-neurons-variant-collection-view 2026-06-01: adds the
//        `representativeVariants` synced meta key (per-family representative
//        selection). LWW via backfill/representatives.ts. Additive — v5
//        clients drop the key. (NOTE: the parked add-neurons-variant-provenance
//        change therefore bumps 6 → 7, not 5 → 6.)
//   v7 — add-neurons-variant-provenance 2026-06-01: adds the optional
//        `provenance` study-context object onto neuronVariants rows. NO new
//        adapter / meta key — the field rides inside the existing
//        `neuronVariants` whole-row JSON (adapter unchanged, stays first-write-
//        wins immutable). Forward-compat: a v6 client reading a v7 bundle
//        preserves `provenance` in the row JSON (it does not interpret it); a
//        v7 client reading a v6 bundle sees rows with no `provenance` → 元老.
//   v8 — add-neurons-study-squad 2026-06-02: adds the `activeSquad` synced meta
//        key (active-squad selection envelope). LWW via backfill/active-squad.ts.
//        Additive — v7 clients drop the key; a v8 client reading a v7 bundle (no
//        activeSquad) preserves its local squad. NO Dexie bump (rides meta).
//   v9 — rework-neurons-collection-gacha 2026-06-02 (Collection 2.0 spine): the
//        gacha flip. neuronVariants rows gain a `copies` field (MAX-merge carve-out
//        in the adapter); familyAccrual gains `pullCount` (MAX-merge, P0 pity);
//        two new currency meta keys `neuralEnergyEarned` / `neuralEnergySpent`
//        (MAX-merge counters). NO new adapter — all ride existing tables/meta.
//        Additive + reader-tolerant: a v8 client reading a v9 bundle drops the new
//        meta keys and ignores copies/pullCount; a v9 client reading a v8 bundle
//        sees no currency keys (balance starts at 0) and copies/pullCount default.
//   v10 — rework-neurons-variant-pyramid 2026-06-02: the slot model widens from a
//        fixed 6 slots/family to a per-family P0–P5 pyramid (slotIndex 0..N-1,
//        explicit per-variant rarity). NO new adapter / meta key — variants still
//        ride the existing `neuronVariants` rows (PK [familyId+slotIndex] retained;
//        the `copies` MAX-merge carve-out unchanged). The whole collection resets
//        on the Dexie v11 upgrade. Additive + reader-tolerant: a v9 client reading
//        a v10 bundle sees the same row shape (just more slotIndex values); a v10
//        client reading a v9 bundle preserves rows on omission.

import type { NeuronsDB } from '../../db'
import { NEURONS_ADAPTERS } from '../tables'

export const SCHEMA_VERSION = 10
export const BUNDLE_APP_VERSION = '0.4.0'

const CLIENT_ID_KEY = 'neurons-rpg.sync.clientId'

export interface BundleMeta {
  schema_version: number
  updated_at: string  // ISO 8601
  client_id: string
  app_version: string
}

export interface BundleSnapshot {
  meta: BundleMeta
  data: Record<string, unknown[]>  // keyed by adapter.name
}

export function getClientId(): string {
  // Defensive: tolerate environments where localStorage is undefined (Node
  // tests), a partial shim missing methods, or read-throws (private browsing
  // quota errors). Returns an ephemeral id rather than throwing.
  if (
    typeof localStorage === 'undefined' ||
    typeof (localStorage as { getItem?: unknown })?.getItem !== 'function'
  ) {
    return 'no-storage'
  }
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      try {
        localStorage.setItem(CLIENT_ID_KEY, id)
      } catch {
        // quota / private mode — ephemeral id
      }
    }
    return id
  } catch {
    return 'no-storage'
  }
}

export async function buildBundleSnapshot(db: NeuronsDB): Promise<BundleSnapshot> {
  const data: Record<string, unknown[]> = {}
  for (const adapter of NEURONS_ADAPTERS) {
    data[adapter.name] = await adapter.snapshot(db)
  }
  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
      client_id: getClientId(),
      app_version: BUNDLE_APP_VERSION,
    },
    data,
  }
}

export interface ApplyResult {
  applied: number
  skipped: number
  perTable: Record<string, { applied: number; skipped: number }>
}

export async function applyBundleSnapshot(
  db: NeuronsDB,
  snapshot: BundleSnapshot,
): Promise<ApplyResult> {
  let applied = 0
  let skipped = 0
  const perTable: Record<string, { applied: number; skipped: number }> = {}
  for (const adapter of NEURONS_ADAPTERS) {
    const rows = snapshot.data[adapter.name] ?? []
    const result = await adapter.apply(db, rows)
    perTable[adapter.name] = result
    applied += result.applied
    skipped += result.skipped
  }
  return { applied, skipped, perTable }
}

export function validateBundleMeta(
  snapshot: unknown,
): asserts snapshot is BundleSnapshot {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('invalid_bundle_root')
  const s = snapshot as Partial<BundleSnapshot>
  if (!s.meta || typeof s.meta !== 'object') throw new Error('invalid_bundle_meta')
  if (typeof s.meta.schema_version !== 'number' || s.meta.schema_version < 1) {
    throw new Error('invalid_schema_version')
  }
  // Forward-compat tolerance (per add-neurons-dmn-fate-card spec
  // "neurons-deploy MODIFIED"): clients SHALL accept bundles with
  // `schema_version > SCHEMA_VERSION`. Unknown adapter keys are silently
  // dropped at apply time because applyBundleSnapshot iterates only the local
  // NEURONS_ADAPTERS — keys not registered locally are never read. We log
  // once per pull so operators can see when newer clients are pushing.
  if (s.meta.schema_version > SCHEMA_VERSION) {
    console.info(
      `[sync] bundle schema_version ${s.meta.schema_version} > local ${SCHEMA_VERSION}; unknown fields will be dropped`,
    )
  }
  if (typeof s.meta.updated_at !== 'string') throw new Error('invalid_meta_updated_at')
  if (typeof s.meta.client_id !== 'string') throw new Error('invalid_meta_client_id')
  if (!s.data || typeof s.data !== 'object') throw new Error('invalid_bundle_data')
}

export async function gzipBundle(snapshot: BundleSnapshot): Promise<Blob> {
  const json = JSON.stringify(snapshot)
  const stream = new Blob([json], { type: 'application/json' }).stream()
  const compressed = stream.pipeThrough(new CompressionStream('gzip'))
  return new Response(compressed).blob()
}

export async function gunzipBundle(blob: Blob): Promise<BundleSnapshot> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  const parsed = JSON.parse(text)
  validateBundleMeta(parsed)
  return parsed
}
