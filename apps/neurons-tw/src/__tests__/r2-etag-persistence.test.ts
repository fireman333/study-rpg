/**
 * R2 ETag persistence (change reduce-r2-412-storm D2/D4).
 *
 * Pins: the push ETag persists to localStorage under a USER-SCOPED key so a warm
 * cache after reload uses If-Match (not If-None-Match:* → guaranteed 412); account
 * switch / wipe / reset clears every persisted etag. neurons is single-bundle, so
 * the key carries no bundle segment. vitest env is 'node' (no localStorage) so we
 * polyfill it — mirrors how etag.ts degrades to in-memory when localStorage is
 * absent.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getEtag, setEtag, clearEtag, clearAllPersistedEtags } from '../lib/sync/r2/etag'

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

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: MemLocalStorage }).localStorage = new MemLocalStorage()
  clearAllPersistedEtags() // also resets the module-level in-memory Map
})

describe('r2 etag persistence', () => {
  it('setEtag persists to a user-scoped localStorage key and getEtag returns it', () => {
    setEtag('userA', '"E1"')
    expect(localStorage.getItem('neurons-rpg.sync.etag.userA')).toBe('"E1"')
    expect(getEtag('userA')).toBe('"E1"')
  })

  it('getEtag falls back to localStorage after a simulated reload (cold in-memory map)', () => {
    // Seed localStorage directly = "previous session persisted, this process is
    // a fresh reload with an empty in-memory Map". The reload→If-Match win.
    localStorage.setItem('neurons-rpg.sync.etag.userA', '"E9"')
    expect(getEtag('userA')).toBe('"E9"')
  })

  it('is user-scoped — account B never sees account A etag', () => {
    setEtag('userA', '"EA"')
    expect(getEtag('userB')).toBeNull()
  })

  it('clearEtag removes both the in-memory and persisted entry', () => {
    setEtag('userA', '"E1"')
    clearEtag('userA')
    expect(getEtag('userA')).toBeNull()
    expect(localStorage.getItem('neurons-rpg.sync.etag.userA')).toBeNull()
  })

  it('setEtag(null) clears', () => {
    setEtag('userA', '"E1"')
    setEtag('userA', null)
    expect(getEtag('userA')).toBeNull()
  })

  it('clearAllPersistedEtags removes every etag (all users) and reaps a legacy global key', () => {
    setEtag('userA', '"E1"')
    setEtag('userB', '"E2"')
    localStorage.setItem('neurons-rpg.sync.etag.neurons', '"LEGACY"') // pre-D2 global key
    clearAllPersistedEtags()
    expect(getEtag('userA')).toBeNull()
    expect(getEtag('userB')).toBeNull()
    expect(localStorage.getItem('neurons-rpg.sync.etag.neurons')).toBeNull()
  })

  it('degrades to in-memory only when localStorage is unavailable', () => {
    ;(globalThis as unknown as { localStorage?: unknown }).localStorage = undefined as unknown as Storage
    // Should not throw; in-memory set/get still works.
    setEtag('userA', '"MEM"')
    expect(getEtag('userA')).toBe('"MEM"')
  })
})
