import { describe, it, expect } from 'vitest'
import { createCacheByteStore } from '../platform/byteStore'

// Minimal fake of the Cache API (match/put/keys/delete keyed by the URL string we pass).
class FakeCache {
  store = new Map<string, Response>()
  async match(req: string): Promise<Response | undefined> {
    return this.store.get(req)
  }
  async put(req: string, res: Response): Promise<void> {
    this.store.set(req, res)
  }
  async delete(req: string): Promise<boolean> {
    return this.store.delete(req)
  }
  async keys(): Promise<Array<{ url: string }>> {
    return [...this.store.keys()].map((url) => ({ url }))
  }
}
class FakeCacheStorage {
  caches = new Map<string, FakeCache>()
  async open(name: string): Promise<FakeCache> {
    let c = this.caches.get(name)
    if (!c) {
      c = new FakeCache()
      this.caches.set(name, c)
    }
    return c
  }
}

describe('byteStore (Cache API v1) — get/put/delete/list', () => {
  it('round-trips bytes by bookletKey and lists/deletes them', async () => {
    const cs = new FakeCacheStorage() as unknown as CacheStorage
    const store = createCacheByteStore(cs, 'test-cache')

    expect(await store.get('104-1-醫學一')).toBeUndefined()
    expect(await store.list()).toEqual([])

    await store.put('104-1-醫學一', new Response('PDF-A', { headers: { 'content-type': 'application/pdf' } }))
    await store.put('104-1-醫學二', new Response('PDF-B', { headers: { 'content-type': 'application/pdf' } }))

    const got = await store.get('104-1-醫學一')
    expect(got).toBeDefined()
    expect(await got!.text()).toBe('PDF-A')

    expect((await store.list()).sort()).toEqual(['104-1-醫學一', '104-1-醫學二'])

    await store.delete('104-1-醫學一')
    expect(await store.get('104-1-醫學一')).toBeUndefined()
    expect(await store.list()).toEqual(['104-1-醫學二'])
  })

  it('encodes/decodes keys safely (CJK + punctuation round-trip)', async () => {
    const cs = new FakeCacheStorage() as unknown as CacheStorage
    const store = createCacheByteStore(cs, 'test-cache-2')
    await store.put('114-2-醫學二', new Response('x'))
    expect(await store.list()).toEqual(['114-2-醫學二'])
  })
})
