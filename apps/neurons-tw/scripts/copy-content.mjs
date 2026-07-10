/**
 * Copy content-neurons-tw dist artifacts into apps/neurons-tw/public/content/neurons-tw/
 * so Vite serves them under the configured base URL at runtime.
 *
 * Run automatically via predev / prebuild hooks in package.json.
 */
import { mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(__dirname, '..', '..', '..', 'packages/content-neurons-tw/dist')
const DEST_DIR = resolve(__dirname, '..', 'public/content/neurons-tw')

if (!existsSync(SRC_DIR)) {
  console.error(`✗ content-neurons-tw dist not found: ${SRC_DIR}`)
  console.error('  Run `pnpm --filter @study-rpg/content-neurons-tw build` first.')
  process.exit(1)
}

mkdirSync(DEST_DIR, { recursive: true })
for (const file of ['meta.json', 'subjects.json', 'questions.json']) {
  copyFileSync(resolve(SRC_DIR, file), resolve(DEST_DIR, file))
}
// Concept-tag artifacts (add-neurons-concept-tags §4.5): per-question tags for search + labels,
// and the recurrence dataset for downstream 押題. cram.json (add-neurons-cram-tab): the 考前猜題
// dataset, lazy-fetched by /cram (not via getContentPack). Optional — skip if not yet built.
for (const file of ['concept-tags.json', 'concept-recurrence.json', 'cram.json', 'handout.json']) {
  const src = resolve(SRC_DIR, file)
  if (existsSync(src)) copyFileSync(src, resolve(DEST_DIR, file))
}

// 考前速看 A4 PDFs (add-neurons-cram-tab): committed content-pack source → served under content/
// (already an assetDir, so no build-cf-pages allowlist change needed). Downloaded from /cram.
const PDF_SRC = resolve(__dirname, '..', '..', '..', 'packages/content-neurons-tw/src/cram/pdf')
let cramPdfCount = 0
if (existsSync(PDF_SRC)) {
  const PDF_DEST = resolve(DEST_DIR, 'cram-pdf')
  mkdirSync(PDF_DEST, { recursive: true })
  for (const f of readdirSync(PDF_SRC).filter((n) => n.endsWith('.pdf'))) {
    copyFileSync(resolve(PDF_SRC, f), resolve(PDF_DEST, f))
    cramPdfCount += 1
  }
}

// Question figures: copy dist/figures/*.png → public/content/neurons-tw/figures/
const FIG_SRC = resolve(SRC_DIR, 'figures')
let figureCount = 0
if (existsSync(FIG_SRC)) {
  const FIG_DEST = resolve(DEST_DIR, 'figures')
  mkdirSync(FIG_DEST, { recursive: true })
  for (const f of readdirSync(FIG_SRC).filter((n) => n.endsWith('.png'))) {
    copyFileSync(resolve(FIG_SRC, f), resolve(FIG_DEST, f))
    figureCount += 1
  }
}

// 詳解 table-image crops: copy dist/table-images/*.webp → public/content/neurons-tw/table-images/
const TI_SRC = resolve(SRC_DIR, 'table-images')
let tableImageCount = 0
if (existsSync(TI_SRC)) {
  const TI_DEST = resolve(DEST_DIR, 'table-images')
  mkdirSync(TI_DEST, { recursive: true })
  for (const f of readdirSync(TI_SRC).filter((n) => n.endsWith('.webp'))) {
    copyFileSync(resolve(TI_SRC, f), resolve(TI_DEST, f))
    tableImageCount += 1
  }
}

// 詳解 figures: copy dist/explanation-figures/*.webp → public/content/neurons-tw/explanation-figures/
const EF_SRC = resolve(SRC_DIR, 'explanation-figures')
let explFigureCount = 0
if (existsSync(EF_SRC)) {
  const EF_DEST = resolve(DEST_DIR, 'explanation-figures')
  mkdirSync(EF_DEST, { recursive: true })
  for (const f of readdirSync(EF_SRC).filter((n) => n.endsWith('.webp'))) {
    copyFileSync(resolve(EF_SRC, f), resolve(EF_DEST, f))
    explFigureCount += 1
  }
}
console.log(
  `✓ Copied content-neurons-tw artifacts (+ ${figureCount} figures, ${tableImageCount} table-images, ${explFigureCount} explanation-figures, ${cramPdfCount} cram PDFs) → ${DEST_DIR}`,
)
