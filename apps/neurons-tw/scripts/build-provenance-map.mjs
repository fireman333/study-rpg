/**
 * Build the question → {file, page} provenance map from two committed sources, so
 * the local-PDF feature can open a player's own source PDF at the right page:
 *   1. explanation-figures/manifest.json — figure/table questions (bbox-precise page).
 *   2. provenance/question-page-map.json — text questions, deterministically resolved
 *      by reconcile/healthcheck/resolve_all_pages.py (anchor + stem cross-check).
 * Manifest wins on overlap (bbox page is most precise). The text map only carries
 * non-figure questions, so in practice they are disjoint.
 * (add-neurons-local-pdf-provenance + expand-neurons-pdf-provenance-coverage)
 *
 * SOURCE of truth = this script + the two committed JSON sources above.
 * OUTPUT = apps/neurons-tw/public/provenance/question-pdf-map.v1.json — a gitignored
 * build artifact, regenerated on every prebuild / predev / CF Pages deploy (D3b).
 * NEVER hand-commit the output (public/ is build output per repo hygiene chore 8f1bae7).
 *
 * Deterministic: no wall-clock timestamp (would churn the JSON every build); a
 * sha256 over both sources gives traceability without churn.
 *
 * Page indexing: BOTH sources store 0-based pages (PyMuPDF `doc[page]`). PDF viewers'
 * `#page=N` fragment is 1-based, so we emit `page + 1` — the map holds real 1-based
 * page numbers a human (and the viewer) would use. (D3 / off-by-one fix)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { resolveBooklet } from './booklet-identity.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = resolve(__dirname, '..', '..', '..', 'packages/content-neurons-tw')
const MANIFEST = resolve(PKG, 'explanation-figures/manifest.json')
const TEXTMAP = resolve(PKG, 'provenance/question-page-map.json')
const RESIDUALMAP = resolve(PKG, 'provenance/question-page-map-residual.json')
const BASECORR = resolve(PKG, 'provenance/base-corrections.json')
const OVERRIDES = resolve(PKG, 'provenance/verified-overrides.json')
const LINKS = resolve(PKG, 'provenance/booklet-drive-links.json')
const OUT_DIR = resolve(__dirname, '..', 'public/provenance')
const OUT_FILE = resolve(OUT_DIR, 'question-pdf-map.v1.json')

const raw = readFileSync(MANIFEST, 'utf8')
const manifest = JSON.parse(raw)
const hash = createHash('sha256').update(raw)

const entries = {}
let figures = 0
let multiPage = 0
for (const [questionId, figs] of Object.entries(manifest)) {
  const pages = []
  let file = null
  for (const fig of Array.isArray(figs) ? figs : []) {
    const prov = fig?.provenance
    if (prov && prov.page != null && prov.sourcePdf) {
      pages.push(prov.page)
      file = prov.sourcePdf // real on-disk filename, verbatim
    }
  }
  if (file == null || pages.length === 0) continue
  if (new Set(pages).size > 1) multiPage += 1
  // 0-based manifest page → +1 for 1-based #page=N viewers.
  entries[questionId] = { file, page: Math.min(...pages) + 1 }
  figures += 1
}

// Text questions: fill in any question not already covered by a figure (manifest wins).
let text = 0
if (existsSync(TEXTMAP)) {
  const rawText = readFileSync(TEXTMAP, 'utf8')
  hash.update(rawText)
  for (const [questionId, ent] of Object.entries(JSON.parse(rawText))) {
    if (questionId in entries) continue
    if (!ent?.file || ent.page == null) continue
    entries[questionId] = { file: ent.file, page: ent.page + 1 } // 0-based → 1-based
    text += 1
  }
}

// Residual questions (second-layer resolver: multi-token vote + numeric/Latin + agent-verified).
// Earlier sources win, so this only fills questions still uncovered.
let residual = 0
if (existsSync(RESIDUALMAP)) {
  const rawResidual = readFileSync(RESIDUALMAP, 'utf8')
  hash.update(rawResidual)
  for (const [questionId, ent] of Object.entries(JSON.parse(rawResidual))) {
    if (questionId in entries) continue
    if (!ent?.file || ent.page == null) continue
    entries[questionId] = { file: ent.file, page: ent.page + 1 } // 0-based → 1-based
    residual += 1
  }
}

// Base off-by-one corrections: deterministic stem-run re-resolutions for base-resolver errors found
// by the 44-PDF verification. Wins over base/residual (but below verified-overrides).
let baseCorr = 0
if (existsSync(BASECORR)) {
  const rawCorr = readFileSync(BASECORR, 'utf8')
  hash.update(rawCorr)
  for (const [questionId, ent] of Object.entries(JSON.parse(rawCorr))) {
    if (questionId.startsWith('__') || !ent?.file || ent.page == null) continue
    entries[questionId] = { file: ent.file, page: ent.page + 1 } // 0-based → 1-based; wins over base/residual
    baseCorr += 1
  }
}

// Verified overrides: human/agent-confirmed pages that bypass the automated gates (image-rendered
// stems, or 陽明 card order != qNumber). Highest priority — wins over every other source.
let overrides = 0
if (existsSync(OVERRIDES)) {
  const rawOverrides = readFileSync(OVERRIDES, 'utf8')
  hash.update(rawOverrides)
  for (const [questionId, ent] of Object.entries(JSON.parse(rawOverrides))) {
    if (questionId.startsWith('__') || !ent?.file || ent.page == null) continue
    entries[questionId] = { file: ent.file, page: ent.page + 1 } // 0-based → 1-based; wins
    overrides += 1
  }
}

// Booklet identity: resolve each entry's filename → stable bookletKey + Drive file id, so the
// web runtime fetches by Drive ID (the filename stays display/debug only). The links file feeds
// the sourceHash too, so a changed Drive id retraces the map. (add-neurons-pdf-drive-autofetch D4)
const links = {}
if (existsSync(LINKS)) {
  const rawLinks = readFileSync(LINKS, 'utf8')
  hash.update(rawLinks)
  Object.assign(links, JSON.parse(rawLinks))
} else {
  console.warn('[provenance-map] WARN missing booklet-drive-links.json — entries will carry no Drive id')
}

let resolvedIds = 0
const unresolvedFiles = new Set()
for (const ent of Object.values(entries)) {
  const b = resolveBooklet(ent.file, links)
  if (!b) {
    unresolvedFiles.add(ent.file)
    continue
  }
  ent.bookletKey = b.bookletKey
  ent.driveFileId = b.driveFileId
  if (b.resourceKey) ent.resourceKey = b.resourceKey
  resolvedIds += 1
}
if (unresolvedFiles.size) {
  console.warn(`[provenance-map] WARN ${unresolvedFiles.size} filename(s) did not resolve to a Drive booklet id:`)
  for (const f of [...unresolvedFiles].sort()) console.warn(`  - ${f}`)
}

const sourceHash = hash.digest('hex').slice(0, 16)
const mapped = Object.keys(entries).length
// Stable key order + 2-space indent → deterministic bytes across builds.
const sortedEntries = {}
for (const k of Object.keys(entries).sort()) sortedEntries[k] = entries[k]
const out = { version: 'v1', sourceHash, count: mapped, entries: sortedEntries }

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8')

// Copy the committed booklet→Drive-link map into the gitignored public/ dir so the app fetches
// it at runtime, same as the map above (add-neurons-pdf-drive-autofetch). This is a COMMITTED
// source (built offline from the owner's link list) — CI can't regenerate it, so the build only
// copies; it never rebuilds it.
for (const name of ['booklet-drive-links.json']) {
  const src = resolve(PKG, 'provenance', name)
  if (existsSync(src)) copyFileSync(src, resolve(OUT_DIR, name))
  else console.warn(`[provenance-map] WARN missing committed artifact: ${name}`)
}

console.log(
  `[provenance-map] mapped ${mapped} (figure ${figures} + text ${text} + residual ${residual} + baseCorr ${baseCorr} + override ${overrides}; ` +
    `multi-page→min ${multiPage}; driveId ${resolvedIds}/${mapped} resolved, ${unresolvedFiles.size} unresolved file(s); ` +
    `src ${sourceHash}) → public/provenance/question-pdf-map.v1.json`,
)
