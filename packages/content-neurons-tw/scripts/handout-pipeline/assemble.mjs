/**
 * handout-pipeline/assemble.mjs — Stage 3 of the config-driven 考前講義 pipeline.
 *
 * Concatenates the per-region draft fragments (Stage 2 output) into the committed
 * `src/handout/<subjectId>.html`, in config order, with a structure lint that fails loudly
 * if any region is malformed. Deterministic, no LLM / network.
 *
 *   node packages/content-neurons-tw/scripts/handout-pipeline/assemble.mjs <subjectId>
 *
 * Lint (mirrors the build-handout guards so a bad draft can't ship):
 *  - every config region has exactly one fragment whose <section id> === regionId (bidirectional)
 *  - each region contains .hdt-intro + .hdt-must + ≥1 .hdt-tbl (每區導言/必背/表格三段齊)
 *  - no honesty-banned prediction slang
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const subjectId = process.argv[2]
if (!subjectId) {
  console.error('✗ usage: node assemble.mjs <subjectId>')
  process.exit(1)
}
const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..', '..')
const FRAG_DIR = join(__dirname, 'fragments', subjectId)
const OUT = join(PKG, 'src', 'handout', `${subjectId}.html`)
const BANNED = ['命中率', '保證會考', '保證命中', '必中', '必考', '今年一定考', '100%命中', '包中']

const config = JSON.parse(readFileSync(join(PKG, `${subjectId}.config.json`), 'utf8'))
const fail = (m) => {
  console.error(`✗ assemble: ${m}`)
  process.exit(1)
}

if (!existsSync(FRAG_DIR)) fail(`fragments dir not found: ${FRAG_DIR} (run mine + dispatch first)`)
const fragFiles = new Set(readdirSync(FRAG_DIR).filter((f) => f.endsWith('.html')))
const configIds = config.map((r) => r.regionId)

// bidirectional: no stray fragment outside config
for (const f of fragFiles) {
  const id = f.replace(/\.html$/, '')
  if (!configIds.includes(id)) fail(`stray fragment "${f}" has no config region (config↔fragment drift)`)
}

const parts = config.map((region) => {
  const fp = join(FRAG_DIR, `${region.regionId}.html`)
  if (!fragFiles.has(`${region.regionId}.html`)) fail(`config region "${region.regionId}" has no fragment file`)
  const html = readFileSync(fp, 'utf8').trim()

  const idMatch = html.match(/<section class="hdt-region" id="([^"]+)"/)
  if (!idMatch) fail(`${region.regionId}: no <section class="hdt-region" id="…">`)
  if (idMatch[1] !== region.regionId) fail(`${region.regionId}: section id="${idMatch[1]}" ≠ config regionId`)
  if ((html.match(/<section class="hdt-region"/g) || []).length !== 1)
    fail(`${region.regionId}: fragment must contain exactly one .hdt-region section`)

  if (!/class="hdt-intro"/.test(html)) fail(`${region.regionId}: missing .hdt-intro (導言)`)
  if (!/class="hdt-must"/.test(html)) fail(`${region.regionId}: missing .hdt-must (必背重點)`)
  if (!/class="hdt-tbl/.test(html)) fail(`${region.regionId}: missing .hdt-tbl (教學表格)`)

  const hits = BANNED.filter((w) => html.includes(w))
  if (hits.length) fail(`${region.regionId}: honesty-banned slang: ${hits.join(', ')}`)

  return html
})

writeFileSync(OUT, parts.join('\n\n') + '\n')
const kb = (readFileSync(OUT, 'utf8').length / 1024).toFixed(0)
console.log(`✓ assembled ${config.length} regions → src/handout/${subjectId}.html (${kb}KB)`)
console.log(config.map((r) => `  ${r.regionId}`).join('\n'))
