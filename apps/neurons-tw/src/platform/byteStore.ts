/**
 * Swappable byte-store for cached booklet PDFs (add-neurons-pdf-drive-autofetch, design D2/D3).
 *
 * v1 backend = the Cache API; the interface is the seam for a future OPFS impl. The Cache API:
 *  - streams a fetch `Response` to disk, so a 20–96 MB PDF is never materialized in JS;
 *  - answers the cache-state questions itself — `get` = "is it cached?" + bytes, `list` =
 *    cached-booklet keys (offline-all completion + a future manage-storage UI) — so NO new
 *    Dexie table / NO schema bump is needed;
 *  - works cross-browser incl. mobile Safari (unlike large IndexedDB blobs).
 * Eviction is a harmless re-fetch (the source is always re-fetchable), so there is no LRU and
 * no persistence guarantee.
 *
 * Booklets are keyed by their stable `bookletKey` (e.g. "104-1-醫學二"). Cache API entries are
 * addressed by URL, so the key is encoded into a synthetic same-shape URL under a private origin.
 */

const CACHE_NAME = 'neurons-pdf-v1'
const KEY_ORIGIN = 'https://neurons-pdf-cache.local/'

export interface ByteStore {
  /** Cached `Response` for this booklet, or undefined if not cached. */
  get(key: string): Promise<Response | undefined>
  /** Store the response bytes for this booklet (streams to disk; consumes the response). */
  put(key: string, response: Response): Promise<void>
  /** Remove one booklet from the cache. */
  delete(key: string): Promise<void>
  /** List the cached booklet keys. */
  list(): Promise<string[]>
}

function keyUrl(key: string): string {
  return KEY_ORIGIN + encodeURIComponent(key)
}
function urlKey(url: string): string {
  return decodeURIComponent(url.slice(KEY_ORIGIN.length))
}

/** Cache API byte-store. `cacheStorage` is injectable so tests pass a fake CacheStorage. */
export function createCacheByteStore(
  cacheStorage: CacheStorage,
  cacheName: string = CACHE_NAME,
): ByteStore {
  const open = (): Promise<Cache> => cacheStorage.open(cacheName)
  return {
    async get(key) {
      return (await open()).match(keyUrl(key))
    },
    async put(key, response) {
      await (await open()).put(keyUrl(key), response)
    },
    async delete(key) {
      await (await open()).delete(keyUrl(key))
    },
    async list() {
      const reqs = await (await open()).keys()
      return reqs.map((r) => urlKey(r.url))
    },
  }
}

/**
 * Default singleton over the real Cache API. In a non-browser context (SSR / unit tests with
 * no `caches`) the methods reject lazily; production code always runs in the browser, and tests
 * inject a fake store via `createCacheByteStore`.
 */
export const byteStore: ByteStore = createCacheByteStore(
  typeof caches !== 'undefined' ? caches : (undefined as unknown as CacheStorage),
)
