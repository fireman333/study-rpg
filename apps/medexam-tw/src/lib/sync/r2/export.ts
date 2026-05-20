// R2-backed account export. Replaces the Supabase `export_my_data` RPC when
// the read backend is R2. Bundles all 3 blobs (m1, m2, bookmarks) into one
// JSON document mirroring the RPC shape (schema_version + exported_at +
// user_id + per-bundle payloads).
//
// Missing blobs are reported as `null` rather than failing — a user whose
// 二階 data has not yet synced should still be able to export their 一階 state.

import type { SupabaseClient } from '@supabase/supabase-js'
import { gunzipBundle, type BundleSnapshot } from './bundles'
import { requestPresign, type Bundle } from './client'

const ALL_BUNDLES: ReadonlyArray<Bundle> = ['m1', 'm2', 'bookmarks']

export interface R2ExportPayload {
  schema_version: string
  exported_at: string
  user_id: string
  bundles: Record<Bundle, BundleSnapshot | null>
}

async function fetchOne(
  supabase: SupabaseClient,
  bundle: Bundle,
): Promise<BundleSnapshot | null> {
  const { url } = await requestPresign(supabase, bundle, 'get')
  const res = await fetch(url, { method: 'GET' })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`r2_export_${bundle}_${res.status}: ${body.slice(0, 200)}`)
  }
  const blob = await res.blob()
  return await gunzipBundle(blob)
}

export async function exportAllBundlesFromR2(
  supabase: SupabaseClient,
  userId: string,
): Promise<R2ExportPayload> {
  // Sequential pulls keep this gentle on the presigner. The biggest bundle
  // for a heavy user is ~500 KB gzipped, so 3 round trips finish in a couple
  // of seconds even on a slow connection.
  const bundles: Record<Bundle, BundleSnapshot | null> = { m1: null, m2: null, bookmarks: null }
  for (const b of ALL_BUNDLES) {
    bundles[b] = await fetchOne(supabase, b)
  }
  return {
    schema_version: 'r2-bundle-v1',
    exported_at: new Date().toISOString(),
    user_id: userId,
    bundles,
  }
}
