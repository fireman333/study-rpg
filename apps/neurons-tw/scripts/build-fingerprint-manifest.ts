/**
 * Build the per-booklet content-fingerprint manifest from the owner's LOCAL 陽明 PDFs, using
 * the SAME pdfjs the app bundles, so runtime fingerprints are comparable (design D1/D2).
 *
 * One-shot, like the provenance resolver — CI has no PDFs, so the OUTPUT is COMMITTED:
 *   packages/content-neurons-tw/provenance/fingerprint-manifest.json
 * Re-run only when the booklet set changes or pdfjs is bumped.
 *
 *   YM_PDF_DIR=... pnpm --filter @study-rpg/neurons-tw exec tsx scripts/build-fingerprint-manifest.ts
 *   (defaults to ~/Desktop/國考/一階國考/陽明國考考古)
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Bundled pdfjs (legacy build runs in Node). Same package version the app ships → hash parity.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { computeFingerprint, type BookletManifestEntry } from '../src/platform/fingerprint.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', '..', '..', 'packages/content-neurons-tw/provenance/fingerprint-manifest.json')
const PDF_DIR = process.env.YM_PDF_DIR || join(process.env.HOME || '', 'Desktop/國考/一階國考/陽明國考考古')

const sha256hex = (s: string): Promise<string> =>
  Promise.resolve(createHash('sha256').update(s, 'utf8').digest('hex'))

/**
 * Map an (inconsistently-named) booklet filename → canonical bookletId "<year>-<session>-醫學[一二]".
 * Handles all the real-world variants: "104-1醫學(一).pdf", "113-2_醫學一總檔.pdf",
 * "112-1醫學一 詳解.pdf", "114-1_醫學一總檔案（修訂版）.pdf", "112-2醫學一(全)_merged.pdf", …
 */
function bookletIdFromFile(name: string): string | null {
  const ys = name.match(/^(\d+)-(\d+)/)
  if (!ys) return null
  let book: string | null = null
  if (/醫學[(（]?一/.test(name)) book = '醫學一'
  else if (/醫學[(（]?二/.test(name)) book = '醫學二'
  if (!book) return null
  return `${ys[1]}-${ys[2]}-${book}`
}

async function main(): Promise<void> {
  const files = readdirSync(PDF_DIR).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()
  if (files.length === 0) throw new Error(`No PDFs in ${PDF_DIR} (set YM_PDF_DIR)`)
  const EMPTY_HASH = await sha256hex('')
  const entries: BookletManifestEntry[] = []
  let textOk = 0
  let sizeOnly = 0
  for (const file of files) {
    const bookletId = bookletIdFromFile(file)
    if (!bookletId) {
      console.warn(`[fingerprint] skip unrecognized filename: ${file}`)
      continue
    }
    const path = join(PDF_DIR, file)
    const size = statSync(path).size
    const data = new Uint8Array(readFileSync(path))
    const pdf = await getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise
    const fp = await computeFingerprint(pdf, sha256hex)
    await pdf.destroy()
    const textFingerprintable = fp.fingerprints.some((h) => h !== EMPTY_HASH)
    if (textFingerprintable) textOk++
    else sizeOnly++
    entries.push({
      bookletId,
      canonicalFile: file,
      ...fp,
      textFingerprintable,
      expectedSizeRange: [Math.floor(size * 0.4), Math.ceil(size * 2.5)],
    })
    console.log(`[fingerprint] ${bookletId}  pages=${fp.pageCount}  text=${textFingerprintable ? 'yes' : 'SIZE-ONLY'}  (${file})`)
  }
  entries.sort((a, b) => a.bookletId.localeCompare(b.bookletId))
  const srcHash = createHash('sha256').update(entries.map((e) => e.canonicalFile).join('|')).digest('hex').slice(0, 12)
  writeFileSync(
    OUT,
    JSON.stringify({ version: 'fp-v1', sourceHash: srcHash, count: entries.length, entries }, null, 2) + '\n',
  )
  console.log(`[fingerprint] wrote ${entries.length} booklets (text=${textOk}, size-only=${sizeOnly}) → ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
