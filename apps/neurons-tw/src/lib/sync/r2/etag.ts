// ETag cache for R2 bundle-level optimistic concurrency.
//
// localStorage-backed and USER-SCOPED (change reduce-r2-412-storm D2): persisting
// the etag across reloads lets a warm-cache push send `If-Match: <etag>` instead
// of `If-None-Match: *` against an existing blob — the latter guaranteed a 412 +
// pull + retry on every reload, driving a PutObject 412 retry storm and real R2
// Class A billing. The key is scoped to userId so account A's etag is never used
// for account B's push (a single global key made B's first push reuse A's etag →
// If-Match mismatch → 412). neurons is single-bundle, so the key carries no
// bundle segment. An in-memory Map layers over localStorage for speed
// (read-through / write-through). Account switch / wipe / reset calls
// clearAllPersistedEtags. Cold-start force-pull still bypasses this cache
// (unconditional GET) — see engine-r2.ts pullBundle `force` handling.

const KEY_PREFIX = 'neurons-rpg.sync.etag.'

const mem = new Map<string, string>() // key: userId

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

export function getEtag(userId: string): string | null {
  const cached = mem.get(userId)
  if (cached != null) return cached
  if (typeof localStorage === 'undefined') return null
  try {
    const v = localStorage.getItem(keyFor(userId))
    if (v && v.length > 0) {
      mem.set(userId, v) // warm the in-memory cache
      return v
    }
    return null
  } catch {
    return null
  }
}

export function setEtag(userId: string, value: string | null): void {
  if (!value) {
    clearEtag(userId)
    return
  }
  mem.set(userId, value)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(keyFor(userId), value)
  } catch {
    // quota / private mode — degrade to in-memory only
  }
}

export function clearEtag(userId: string): void {
  mem.delete(userId)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(keyFor(userId))
  } catch {
    // ignore
  }
}

/** Clear the in-memory map AND every persisted (localStorage) ETag for every
 *  user. Called on account switch / local wipe / in-place reset so the next
 *  user's first push is never gated by a previous user's stale etag
 *  (reduce-r2-412-storm D4). Also reaps any legacy global key under the prefix. */
export function clearAllPersistedEtags(): void {
  mem.clear()
  if (typeof localStorage === 'undefined') return
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(KEY_PREFIX)) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  } catch {
    // ignore
  }
}
