/**
 * Device-local persistence for the granted PDF folder handle.
 *
 * Deliberately a standalone IndexedDB store, NOT the synced Dexie db:
 *  - MetaRow.value is typed `string` and can't hold a FileSystemDirectoryHandle.
 *  - Adding a Dexie table would bump the schema version (dexie-upgrade-fixture lint).
 *  - The grant is device-bound and MUST NOT reach cloud sync — keeping it outside
 *    the synced db makes that structural, not just a convention.
 * (add-neurons-local-pdf-provenance, design D6)
 */
const DB_NAME = 'neurons-local-pdf'
const STORE = 'handles'
const KEY = 'pdfFolder'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE)
        const req = run(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return tx('readwrite', (s) => s.put(handle, KEY)).then(() => undefined)
}

export function loadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  return tx<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get(KEY))
    .then((h) => h ?? null)
    .catch(() => null)
}

export function clearFolderHandle(): Promise<void> {
  return tx('readwrite', (s) => s.delete(KEY)).then(() => undefined)
}
