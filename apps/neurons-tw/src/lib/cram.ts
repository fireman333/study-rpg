/**
 * Lazy loader for the 考前猜題 (cram) dataset (add-neurons-cram-tab).
 *
 * cram.json is a build product (packages/content-neurons-tw → copy-content → public/content) that
 * is NOT part of getContentPack's initial bundle — the /cram route fetches it on demand so the
 * homepage/quiz paths never pay its ~330KB cost. Cached module-wide after the first load.
 */
import { useEffect, useState } from 'react'
import type { CramData } from '@study-rpg/content-neurons-tw'

// MUST include the Vite base (`/neurons/` in prod, `/` in dev) — a bare `/content/...` path hits
// the SPA index.html fallback in prod (200 HTML → JSON.parse fails). Same rule as concept-tags.ts.
const DEFAULT_URL = `${import.meta.env.BASE_URL}content/neurons-tw/cram.json`

let cache: CramData | null = null
let inflight: Promise<CramData | null> | null = null

export async function loadCram(url = DEFAULT_URL): Promise<CramData | null> {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<CramData>
      })
      .then((d) => (cache = d))
      .catch((e) => {
        // Surface the failure, don't swallow it — but the app stays usable without /cram.
        console.warn(`[cram] load failed (${url}):`, (e as Error)?.message ?? e)
        return null
      })
  }
  return inflight
}

/** React hook: returns the cram dataset (null until loaded / on failure). */
export function useCram(url = DEFAULT_URL): CramData | null {
  const [data, setData] = useState<CramData | null>(cache)
  useEffect(() => {
    let alive = true
    void loadCram(url).then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [url])
  return data
}
