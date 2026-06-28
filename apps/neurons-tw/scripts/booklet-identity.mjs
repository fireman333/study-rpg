/**
 * Pure booklet-identity helpers — resolve a source-PDF filename to its stable
 * `bookletKey` and the publisher's Drive file id. Shared by the provenance-map
 * builder (build-provenance-map.mjs) and its unit test (booklet-identity.test.ts).
 * (add-neurons-pdf-drive-autofetch, design D4)
 *
 * Filenames drift — parens (一)/（修） vs bare 一, 合併檔案 / 詳解 / _merged /
 * 修訂版 suffixes, NFC vs NFD — so the bookletKey ({year}-{session}-醫學{一|二})
 * is the stable identity boundary; the filename stays display/debug only.
 */

/** Derive a booklet's stable key from a source-PDF filename, or null if unrecognizable. */
export function deriveBookletKey(file) {
  const m = /^(\d{3})-(\d).*醫學[（(]?([一二])/.exec(file || '')
  return m ? `${m[1]}-${m[2]}-醫學${m[3]}` : null
}

/** Pull the Drive resourceKey out of a viewUrl (legacy 0B… files carry one), or undefined. */
export function parseResourceKey(viewUrl) {
  const m = /[?&]resourcekey=([^&]+)/.exec(viewUrl || '')
  return m ? decodeURIComponent(m[1]) : undefined
}

/**
 * Resolve a filename to its booklet identity via the committed links manifest
 * (bookletKey → { driveFileId, viewUrl }). Returns
 * { bookletKey, driveFileId, resourceKey? } or null when unresolvable.
 */
export function resolveBooklet(file, links) {
  const bookletKey = deriveBookletKey(file)
  if (!bookletKey) return null
  const link = links?.[bookletKey]
  if (!link?.driveFileId) return null
  const resourceKey = parseResourceKey(link.viewUrl)
  return resourceKey
    ? { bookletKey, driveFileId: link.driveFileId, resourceKey }
    : { bookletKey, driveFileId: link.driveFileId }
}
