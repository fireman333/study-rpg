/**
 * Lazy loader for the 考前講義(beta) dataset (add-neurons-anatomy-handout).
 *
 * handout.json is a build product (packages/content-neurons-tw → copy-content → public/content)
 * that is NOT part of getContentPack's initial bundle — the /cram/handout scene fetches it on
 * demand so the homepage/quiz paths never pay its cost. Cached module-wide after the first load.
 * Mirrors lib/cram.ts.
 */
import { useEffect, useState } from 'react'
import type { HandoutData, HandoutSubject } from '@study-rpg/content-neurons-tw'

// MUST include the Vite base (`/neurons/` in prod, `/` in dev) — a bare `/content/...` path hits
// the SPA index.html fallback in prod (200 HTML → JSON.parse fails). Same rule as cram.ts.
const DEFAULT_URL = `${import.meta.env.BASE_URL}content/neurons-tw/handout.json`

let cache: HandoutData | null = null
let inflight: Promise<HandoutData | null> | null = null

export async function loadHandout(url = DEFAULT_URL): Promise<HandoutData | null> {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<HandoutData>
      })
      .then((d) => (cache = d))
      .catch((e) => {
        // Surface the failure, don't swallow it — the app stays usable without the handout.
        console.warn(`[handout] load failed (${url}):`, (e as Error)?.message ?? e)
        return null
      })
  }
  return inflight
}

/** React hook: returns the handout dataset (null until loaded / on failure). */
export function useHandout(url = DEFAULT_URL): HandoutData | null {
  const [data, setData] = useState<HandoutData | null>(cache)
  useEffect(() => {
    let alive = true
    void loadHandout(url).then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [url])
  return data
}

export type { HandoutData, HandoutSubject }
