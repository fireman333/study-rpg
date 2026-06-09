/**
 * Shoutout board client adapter — calls the shared Worker `/shoutouts/neurons/*`
 * endpoints. Mirrors the neurons-leaderboard client transport (WORKER_URL +
 * authedFetch). Message types + client-side validation come from `@study-rpg/core`
 * (content-agnostic shoutout contract).
 *
 * Worker module: cloudflare/sync-worker/src/shoutout.ts
 * Spec: openspec/specs/neurons-shoutout-board + shoutout-board-backend
 *
 * Identity: the display name is server-joined from leaderboard_neurons — the
 * client never sends a name. Posting requires a leaderboard nickname (the Worker
 * returns `nickname_required` otherwise; the page routes to the nickname flow).
 */

import type { ShoutoutAvatar, ShoutoutBoard, ShoutoutMessage } from '@study-rpg/core'

const DEFAULT_WORKER_URL = 'https://study-rpg-sync-worker.tony85314.workers.dev'
const WORKER_URL =
  (import.meta.env.VITE_SYNC_WORKER_URL as string | undefined)?.trim() || DEFAULT_WORKER_URL

const APP = 'neurons'
const BASE = `/shoutouts/${APP}`

export type { ShoutoutAvatar, ShoutoutBoard, ShoutoutMessage }

export type PostResult =
  | { ok: true; message?: ShoutoutMessage; noop?: boolean }
  | { ok: false; error: string; retryAfterMs?: number }

export type ReportResult = { ok: true; hidden: boolean } | { ok: false; error: string }

interface AuthedFetchOptions {
  accessToken: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
}

async function authedFetch(path: string, opts: AuthedFetchOptions): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${opts.accessToken}` }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  return fetch(`${WORKER_URL}${path}`, {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

/** GET /shoutouts/neurons — latest 40 board messages (edge-cached, public). */
export async function fetchShoutoutBoard(): Promise<ShoutoutBoard> {
  const res = await fetch(`${WORKER_URL}${BASE}`)
  if (!res.ok) throw new Error(`shoutout board fetch failed: ${res.status}`)
  return (await res.json()) as ShoutoutBoard
}

/** PUT /shoutouts/neurons — compose/edit own message. */
export async function postShoutout(
  accessToken: string,
  payload: { avatar: ShoutoutAvatar; message: string },
): Promise<PostResult> {
  const res = await authedFetch(BASE, { accessToken, method: 'PUT', body: payload })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.ok && data.ok === true) {
    return { ok: true, message: data.message as ShoutoutMessage | undefined, noop: data.noop === true }
  }
  return {
    ok: false,
    error: typeof data.error === 'string' ? data.error : `http_${res.status}`,
    retryAfterMs: typeof data.retryAfterMs === 'number' ? data.retryAfterMs : undefined,
  }
}

/** DELETE /shoutouts/neurons — soft-delete own message. */
export async function deleteShoutout(accessToken: string): Promise<{ ok: boolean }> {
  const res = await authedFetch(BASE, { accessToken, method: 'DELETE' })
  return { ok: res.ok }
}

/** POST /shoutouts/neurons/report — report another message. */
export async function reportShoutout(
  accessToken: string,
  targetAuthorKey: string,
): Promise<ReportResult> {
  const res = await authedFetch(`${BASE}/report`, {
    accessToken,
    method: 'POST',
    body: { targetAuthorKey },
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.ok && data.ok === true) return { ok: true, hidden: data.hidden === true }
  return { ok: false, error: typeof data.error === 'string' ? data.error : `http_${res.status}` }
}
