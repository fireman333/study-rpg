/**
 * Parse the publisher's official per-booklet Google Drive links (committed, human-auditable
 * source `booklet-drive-links.source.txt`) into `booklet-drive-links.json`:
 *   { bookletId: { driveFileId, viewUrl } }   bookletId = "<year>-<session>-<book>"
 *
 * The app only LINKS to these official files — it hosts/mirrors/bundles ZERO copyrighted bytes
 * (add-neurons-guided-pdf-onboarding). Two source URL forms are normalized to a canonical
 * `/file/d/<ID>/view` viewUrl; a `resourcekey` (older Drive files) is preserved as a query param.
 * Static one-shot parse — no PDFs needed; safe to re-run in CI.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROV = resolve(__dirname, '..', '..', '..', 'packages/content-neurons-tw/provenance')
const SRC = resolve(PROV, 'booklet-drive-links.source.txt')
const OUT = resolve(PROV, 'booklet-drive-links.json')

/** Pull the Drive file id (+ optional resourcekey) out of either URL form. */
function parseDriveUrl(url) {
  let id = null
  let resourcekey = null
  const m1 = url.match(/\/file\/d\/([^/]+)\//)
  if (m1) id = m1[1]
  const m2 = url.match(/[?&]id=([^&]+)/)
  if (!id && m2) id = m2[1]
  const rk = url.match(/[?&]resourcekey=([^&]+)/)
  if (rk) resourcekey = rk[1]
  return { id, resourcekey }
}

const lines = readFileSync(SRC, 'utf8').split('\n')
const out = {}
let parsed = 0
let skipped = 0
for (const line of lines) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  // "<year>-<session> <book>：<url>"
  const m = t.match(/^(\d+)-(\d+)\s+(醫學[一二])[：:]\s*(\S+)$/)
  if (!m) {
    skipped++
    console.warn(`[booklet-links] unparsed line: ${t}`)
    continue
  }
  const [, year, session, book, url] = m
  const bookletId = `${year}-${session}-${book}`
  const { id, resourcekey } = parseDriveUrl(url)
  if (!id) {
    skipped++
    console.warn(`[booklet-links] no file id in: ${url}`)
    continue
  }
  let viewUrl = `https://drive.google.com/file/d/${id}/view`
  if (resourcekey) viewUrl += `?resourcekey=${resourcekey}`
  out[bookletId] = { driveFileId: id, viewUrl }
  parsed++
}

const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]))
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n')
console.log(`[booklet-links] parsed ${parsed}, skipped ${skipped}, wrote ${Object.keys(out).length} booklets → ${OUT}`)
