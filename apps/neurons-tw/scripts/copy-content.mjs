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
console.log(`✓ Copied content-neurons-tw artifacts (+ ${figureCount} figures) → ${DEST_DIR}`)
