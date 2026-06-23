/**
 * R2 single-flight push (change port-neurons-r2-single-flight-push S1/S2/S4).
 *
 * Pins the two primitives the engine + account-reset compose for single-flight:
 *  - withPushLock serializes per user — same name runs one at a time, distinct
 *    names run concurrently — both with a mocked Web Locks manager AND via the
 *    in-tab per-user promise-chain fallback when navigator.locks is absent (old
 *    Safari / node test env). A throwing push must not poison the next push.
 *  - refreshEtagFromStore makes a serialized writer pick up the ETag another tab
 *    persisted after this tab's in-memory copy went stale (the cross-tab S2 win).
 *
 * The composition (pushBundleSerialized = lock + refresh + pushBundle) is pinned
 * in r2-push-serialized.test.ts; the two-overlapping-push integration assertion
 * is deferred to the Chrome MCP live smoke (no fetch-mock harness here, matching
 * reduce-r2-412-storm's test discipline).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { withPushLock } from '../lib/sync/r2/push-lock'
import { getEtag, setEtag, refreshEtagFromStore, clearAllPersistedEtags } from '../lib/sync/r2/etag'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

class MemLocalStorage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v))
  }
  removeItem(k: string): void {
    this.m.delete(k)
  }
  clear(): void {
    this.m.clear()
  }
}

// Minimal Web Locks mock with real per-name exclusive serialization: each
// request on a name chains after the previous holder's callback settles.
class MockLockManager {
  private tail = new Map<string, Promise<unknown>>()
  request(name: string, cb: (lock: unknown) => unknown): Promise<unknown> {
    const prev = this.tail.get(name) ?? Promise.resolve()
    const run = prev.then(
      () => cb({ name }),
      () => cb({ name }),
    )
    this.tail.set(
      name,
      run.then(
        () => {},
        () => {},
      ),
    )
    return run
  }
}

// navigator is a read-only global in node 21+ → use vi.stubGlobal (handles
// getter-only globals); unstub after each test.
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('withPushLock — Web Locks path', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { locks: new MockLockManager() })
  })

  it('serializes two pushes for the SAME user (no overlap)', async () => {
    const order: string[] = []
    const task = (label: string, ms: number) => async () => {
      order.push(`${label}:start`)
      await sleep(ms)
      order.push(`${label}:end`)
    }
    await Promise.all([withPushLock('u', task('A', 20)), withPushLock('u', task('B', 5))])
    // A acquires first; B waits for A to fully release.
    expect(order).toEqual(['A:start', 'A:end', 'B:start', 'B:end'])
  })

  it('does NOT serialize pushes for DIFFERENT users (run concurrently)', async () => {
    const order: string[] = []
    const task = (label: string, ms: number) => async () => {
      order.push(`${label}:start`)
      await sleep(ms)
      order.push(`${label}:end`)
    }
    await Promise.all([withPushLock('u1', task('A', 20)), withPushLock('u2', task('B', 5))])
    // Distinct lock names → concurrent → the 5ms task ends before the 20ms one.
    expect(order).toEqual(['A:start', 'B:start', 'B:end', 'A:end'])
  })

  it('returns the callback result', async () => {
    await expect(withPushLock('u', async () => 42)).resolves.toBe(42)
  })
})

describe('withPushLock — fallback path (no navigator.locks)', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {}) // navigator defined but no .locks → in-tab fallback
  })

  it('serializes same-tab pushes via the promise chain', async () => {
    const order: string[] = []
    const task = (label: string, ms: number) => async () => {
      order.push(`${label}:start`)
      await sleep(ms)
      order.push(`${label}:end`)
    }
    await Promise.all([withPushLock('u', task('A', 20)), withPushLock('u', task('B', 5))])
    expect(order).toEqual(['A:start', 'A:end', 'B:start', 'B:end'])
  })

  it('a throwing push does not poison the next push', async () => {
    await expect(
      withPushLock('u', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    await expect(withPushLock('u', async () => 7)).resolves.toBe(7)
  })

  it('does NOT serialize DISTINCT users in the fallback (per-user chains)', async () => {
    const order: string[] = []
    const task = (label: string, ms: number) => async () => {
      order.push(`${label}:start`)
      await sleep(ms)
      order.push(`${label}:end`)
    }
    await Promise.all([withPushLock('u1', task('A', 20)), withPushLock('u2', task('B', 5))])
    // Distinct users → independent chains → concurrent (5ms ends before 20ms).
    expect(order).toEqual(['A:start', 'B:start', 'B:end', 'A:end'])
  })
})

describe('refreshEtagFromStore — cross-tab S2 freshness', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { localStorage: MemLocalStorage }).localStorage =
      new MemLocalStorage()
    clearAllPersistedEtags()
  })

  it('picks up an ETag another tab persisted after this in-memory copy went stale', () => {
    setEtag('u', '"E0"') // this tab: mem=E0, localStorage=E0
    localStorage.setItem('neurons-rpg.sync.etag.u', '"E1"') // another tab persisted E1
    expect(getEtag('u')).toBe('"E0"') // mem-first → stale before refresh
    refreshEtagFromStore('u')
    expect(getEtag('u')).toBe('"E1"') // now fresh → If-Match:<E1>
  })

  it('drops the in-memory entry when the persisted key was cleared (404 in another tab)', () => {
    setEtag('u', '"E0"')
    localStorage.removeItem('neurons-rpg.sync.etag.u') // another tab cleared on 404
    refreshEtagFromStore('u')
    expect(getEtag('u')).toBeNull() // → next push falls back to If-None-Match:*
  })

  it('is a no-op when localStorage is unavailable', () => {
    setEtag('u', '"MEM"')
    ;(globalThis as unknown as { localStorage?: unknown }).localStorage = undefined
    expect(() => refreshEtagFromStore('u')).not.toThrow()
    expect(getEtag('u')).toBe('"MEM"') // in-memory value preserved
  })
})
