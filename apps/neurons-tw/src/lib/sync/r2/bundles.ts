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
//   v11 — add-neurons-dupe-fusion 2026-06-03: adds the `neuronInstances` adapter
//        (the Pikmin-Bloom individual layer; Dexie v13). Each pull mints an
//        individual; tier-promote consumes K surplus individuals. Merge is UNION
//        by instanceId + `consumedAt` MONOTONIC-OR (a consumed/promoted-away
//        individual never resurrects — mirrors dmnEventLog/everWrong). Additive +
//        reader-tolerant: a v10 client reading a v11 bundle drops the new key; a
//        v11 client reading a v10 bundle (no neuronInstances key) preserves its
//        local instances (the v13 upgrade already expanded legacy copies). The
//        promote counters (`promoteCount` / `rarestPromotedRank`) stay LOCAL meta
//        (achievement ROWS sync via the achievements table).
//   v12 — promote-maze-to-home 2026-06-03: maze economy goes per-branch + synced.
//        Adds 8 meta keys to the allowlist — `maze:<branch>:earned` (faucet) +
//        `maze:<branch>:settles` (pull count) for DA/5HT/GABA/Glu — all MONOTONIC
//        (MAX-merge post-pass). No new Dexie store (meta kv). Additive +
//        reader-tolerant: a v11 client reading a v12 bundle drops the new keys; a
//        v12 client reading a v11 bundle treats absent per-branch keys as 0 (the
//        frontier recomputes; collected variants — hence the dex — are unaffected).
//        The retired global `neuralEnergyEarned/Spent` keys remain present-but-
//        unused for rollback safety.
//   v13 — add-neurons-instance-rename 2026-06-04: adds the `instanceNicknames`
//        adapter (per-instance custom nicknames; Dexie v14). Merge is per-row
//        LWW on `updatedAt` (NOT monotonic — nicknames are mutable + clearable;
//        a cleared nickname is an empty-string row with a fresh updatedAt, NOT a
//        delete). Additive + reader-tolerant: a v12 client reading a v13 bundle
//        drops the new key; a v13 client reading a v12 bundle (no
//        instanceNicknames key) applies an empty array → preserves its local
//        nicknames on omission (omission ≠ clear).
//   v14 — add-neurons-quiz-mode-chips-and-srs 2026-06-04: the `questionHistory`
//        rows gain SRS schedule fields (interval / easeFactor / nextDueAt /
//        attempts / correctCount). NO new adapter / meta key — the fields ride
//        inside the existing `questionHistory` row JSON under row-level LWW (the
//        everWrong monotonic-OR carve-out unchanged). Additive + reader-tolerant:
//        a v13 client reading a v14 bundle keeps the unknown fields in the row
//        JSON it doesn't interpret; a v14 client reading a v13 bundle sees rows
//        with no SRS fields → defaults to fresh (interval 0 / not due) and never
//        wipes a local schedule on a newer-but-pre-v15 incoming (preserve-on-
//        omission in the adapter merge).
//   v15 — add-neurons-first-pull 2026-06-04: adds 5 meta keys to the allowlist —
//        `firstPullDone` (once-only flag, MONOTONIC-OR via write-if-missing,
//        never written 'false') + `maze:<branch>:starterFamily` ×4 (one-time
//        immutable first-write-wins; drives the starter-lit maze node). NO new
//        adapter / Dexie bump — the first-pull variants ride the existing
//        `neuronVariants` / `neuronInstances` collection path. Additive +
//        reader-tolerant: a v14 client reading a v15 bundle drops the new keys; a
//        v15 client reading a v14 bundle sees no first-pull keys → treats
//        first-pull as not-yet-done (so a brand-new device offers it; once any
//        device sets firstPullDone it converges true and gating prevents a re-roll).
//   v16 — add-neurons-acceleration-system 2026-06-04: adds the `inventory`
//        adapter (consumable backpack stock, per-kind LWW on updatedAt) and the
//        `equipment` adapter (owned permanents, UNION by equipmentId + MONOTONIC
//        on presence — owning never un-owns, mirrors neuronInstances/dmnEventLog).
//        Dexie v16. NO new meta key (acceleration pools derive from inventory +
//        equipment + dmnActiveBuffs at render). Additive + reader-tolerant: a v15
//        client reading a v16 bundle drops the new keys; a v16 client reading a
//        v15 bundle (no inventory/equipment keys) preserves local (empty → stays
//        empty; non-empty not wiped on omission).
//   v17 — redesign-neurons-maze-rotjs-grid 2026-06-05: the maze economy goes from
//        4 per-branch pools to 11 per-FAMILY pools. The 8 `maze:{da,5ht,gaba,glu}:
//        {earned,settles}` keys are dropped from the allowlist; 22 per-family
//        `maze:<familyId>:{earned,settles}` keys are added (all MONOTONIC, MAX-merge
//        post-pass). The 4 `maze:<branch>:starterFamily` first-pull keys STAY. NO
//        new adapter / Dexie store (maze rides `meta` kv); Dexie bumps v16 → v17
//        (upgrade clears the retired branch economy keys, preserves starterFamily +
//        collection). Additive + reader-tolerant: a v16 client reading a v17 bundle
//        drops the unknown 11-family keys; a v17 client reading a v16 bundle finds
//        no 11-family keys → fresh per-family frontier (the dropped branch keys are
//        ignored — not in the allowlist). Worker is bundle-opaque (no Worker change).
//   v18 — add-neurons-first-pull-path-rep 2026-06-07: replaces the 4-branch first-pull
//        with a per-family first-pull. Adds the `firstPullFamilies` meta key (JSON-array
//        SET of first-pulled familyIds, MONOTONIC-UNION post-pass) to the allowlist and
//        DROPS the retired `firstPullDone` + 4 `maze:<branch>:starterFamily` keys. The
//        path representative reuses the existing `representativeVariants` key (LWW).
//        NO Dexie bump (reuses `meta` kv). Additive + reader-tolerant: a v17 client
//        reading a v18 bundle drops the unknown `firstPullFamilies` key; a v18 client
//        reading a v17 bundle finds none → local first-pull set preserved (union with
//        empty). Worker is bundle-opaque (no Worker change).
//   v19 — add-neurons-loop-celebration-animations 2026-06-08: adds 11
//        `mazeSecondLapCelebrated:<familyId>` meta keys (per-family second-lap
//        completion-celebration markers, synced one-shot guard) to the allowlist.
//        SET-ONCE markers → the metaAdapter's first-write-wins is sufficient (no
//        backfill post-pass; presence is all that matters). NO Dexie bump (rides
//        `meta` kv). Additive + reader-tolerant: a v18 client reading a v19 bundle
//        drops the unknown marker keys; a v19 client reading a v18 bundle finds
//        none → families simply un-celebrated (celebrate on next live completion).
//        Worker is bundle-opaque (no Worker change).

import type { NeuronsDB } from '../../db'
import { NEURONS_ADAPTERS } from '../tables'

export const SCHEMA_VERSION = 19
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
