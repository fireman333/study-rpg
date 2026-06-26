/**
 * Build the question → {file, page} provenance map from the committed
 * explanation-figures manifest, so the local-PDF feature can open a player's own
 * source PDF at the right page (add-neurons-local-pdf-provenance).
 *
 * SOURCE of truth = this script + packages/content-neurons-tw/explanation-figures/manifest.json.
 * OUTPUT = apps/neurons-tw/public/provenance/question-pdf-map.v1.json — a gitignored
 * build artifact, regenerated on every prebuild / predev / CF Pages deploy (D3b).
 * NEVER hand-commit the output (public/ is build output per repo hygiene chore 8f1bae7).
 *
 * Deterministic: no wall-clock timestamp (would churn the JSON every build); a
 * sha256 of the manifest gives traceability without churn. Multi-page figures
 * collapse to the minimum page (MVP — 36 questions, design D3).
 *
 * Page indexing: the manifest's `provenance.page` is 0-based (it indexes PyMuPDF
 * `doc[page]` in reconcile/healthcheck/extract_figures.py). PDF viewers' `#page=N`
 * fragment is 1-based, so we emit `page + 1` here — the map holds real 1-based
 * page numbers a human (and the viewer) would use. (D3 / off-by-one fix)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'packages/content-neurons-tw/explanation-figures/manifest.json',
)
const OUT_DIR = resolve(__dirname, '..', 'public/provenance')
const OUT_FILE = resolve(OUT_DIR, 'question-pdf-map.v1.json')

const raw = readFileSync(MANIFEST, 'utf8')
const manifest = JSON.parse(raw)
const sourceHash = createHash('sha256').update(raw).digest('hex').slice(0, 16)

const entries = {}
let total = 0
let skipped = 0
let multiPage = 0
for (const [questionId, figs] of Object.entries(manifest)) {
  total += 1
  const pages = []
  let file = null
  for (const fig of Array.isArray(figs) ? figs : []) {
    const prov = fig?.provenance
    if (prov && prov.page != null && prov.sourcePdf) {
      pages.push(prov.page)
      file = prov.sourcePdf // real on-disk filename, verbatim
    }
  }
  if (file == null || pages.length === 0) {
    skipped += 1
    continue
  }
  if (new Set(pages).size > 1) multiPage += 1
  // Manifest pages are 0-based (PyMuPDF doc[page]); +1 → 1-based for #page=N viewers.
  entries[questionId] = { file, page: Math.min(...pages) + 1 }
}

const mapped = Object.keys(entries).length
const out = { version: 'v1', sourceHash, count: mapped, entries }

mkdirSync(OUT_DIR, { recursive: true })
// Stable key order + 2-space indent → deterministic bytes across builds.
const sortedEntries = {}
for (const k of Object.keys(entries).sort()) sortedEntries[k] = entries[k]
out.entries = sortedEntries
writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8')

console.log(
  `[provenance-map] mapped ${mapped} / skipped ${skipped} / total ${total} ` +
    `(multi-page→min: ${multiPage}; manifest ${sourceHash}) → public/provenance/question-pdf-map.v1.json`,
)
