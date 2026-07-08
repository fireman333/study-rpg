/**
 * Render the one-page A4「進場前一張紙」5-分鐘速看 PDF (add-neurons-5min-speed-review §2).
 *
 * LOCAL-ONLY, out-of-band render — NOT wired into `pnpm build` / CI. Same discipline as the
 * existing 醫學一/醫學二 A4 cram PDFs (`src/cram/pdf/*.pdf`): those are hand-authored, git-committed
 * blobs, deliberately NOT rendered in CI because CI has no headless Chromium (rendering there would
 * 404 the prod download). `build-cram.ts` stays CI-safe + PDF-free; run THIS script manually to
 * regenerate the committed blob whenever the 11 families' kernel essence lines change:
 *
 *   pnpm --filter @study-rpg/content-neurons-tw run render:speed-review-pdf
 *   # (run AFTER `build:cram`, which produces dist/cram.json)
 *
 * Data source = dist/cram.json's per-family `kernel`（🎯 高頻考古）blocks — the SAME single source
 * the in-app /cram/5min speed-review reads (design D2/D3). Order = EXAM_PAPER_ORDER (醫學一 then
 * 醫學二) for a stable, shareable printed order (NOT weakness order). ≤5 lines/family.
 *
 * Renderer = headless Chrome `--print-to-pdf` (no npm dependency): prefers the cached Playwright
 * chrome-headless-shell (~/Library/Caches/ms-playwright), then Google Chrome, then a browser on PATH.
 * The generated HTML is 100% static + self-contained (no async fetch), so headless print is reliable
 * here (unlike fetch-gated SPAs).
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdtempSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { EXAM_PAPER_ORDER, FAMILY_COLOR } from '../src/families.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')
const CRAM_JSON = join(PKG, 'dist', 'cram.json')
const OUT_PDF = join(PKG, 'src', 'cram', 'pdf', '考前速看-5分鐘.pdf')
const MAX_PER_FAMILY = 5

// ── 1. Load kernel essence from the built cram.json ──────────────────────────
if (!existsSync(CRAM_JSON)) {
  console.error(`✗ ${CRAM_JSON} not found.`)
  console.error('  Run `pnpm --filter @study-rpg/content-neurons-tw build:cram` first.')
  process.exit(1)
}
const cram = JSON.parse(readFileSync(CRAM_JSON, 'utf8'))
const subjById = new Map()
for (const book of cram.books) for (const s of book.subjects) subjById.set(s.subjectId, s)

/** Ordered [{ familyId, color, items: [{html, cite?}] }] — 醫學一 then 醫學二, kernel-only, ≤5. */
const families = []
let totalLines = 0
for (const paper of ['醫學一', '醫學二']) {
  for (const familyId of EXAM_PAPER_ORDER[paper]) {
    const s = subjById.get(familyId)
    if (!s) {
      console.error(`✗ family ${familyId} missing from cram.json`)
      process.exit(1)
    }
    const items = s.blocks
      .filter((b) => b.kind === 'kernel')
      .flatMap((b) => b.items)
      .slice(0, MAX_PER_FAMILY)
    if (items.length === 0) {
      console.error(`✗ family ${familyId} has no kernel essence lines (backfill missing).`)
      process.exit(1)
    }
    totalLines += items.length
    families.push({ familyId, paper, color: FAMILY_COLOR[familyId] ?? '#8c6d4a', items })
  }
}

// ── 2. Build the static A4 HTML (warm pixel-tan; 2 columns to fit ~55 lines / 1 page) ──
/** cram.json `html` is already build-sanitized to <b>-only inline HTML → render as-is. */
function familyBlock({ familyId, paper, color, items }) {
  const lis = items
    .map((it) => {
      const cite = it.cite ? ` <cite>${escapeText(it.cite)}</cite>` : ''
      return `<li>${it.html}${cite}</li>`
    })
    .join('')
  return `<section class="fam" style="--accent:${color}">
    <div class="fam-head"><span class="fam-name">${escapeText(familyId)}</span><span class="fam-paper">${paper}</span></div>
    <ul>${lis}</ul>
  </section>`
}

function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 7mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
    color: #3f341f;
    background: #fbf6e9;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 7.4pt;
    line-height: 1.3;
  }
  header.top {
    display: flex; align-items: baseline; justify-content: space-between;
    border-bottom: 1.5pt solid #8c6d4a; padding-bottom: 2.2mm; margin-bottom: 2.4mm;
  }
  header.top h1 { margin: 0; font-size: 12.5pt; color: #5a4a2f; letter-spacing: 0.3px; }
  header.top h1 .icon { margin-right: 2px; }
  header.top .url { font-size: 6.6pt; color: #a08a5e; }
  .cols { column-count: 2; column-gap: 5mm; column-fill: balance; }
  .fam {
    break-inside: avoid; -webkit-column-break-inside: avoid;
    margin: 0 0 2.4mm; padding-left: 2mm;
    border-left: 2pt solid var(--accent);
  }
  .fam-head { display: flex; align-items: baseline; gap: 4px; margin-bottom: 0.9mm; }
  .fam-name {
    font-weight: 700; font-size: 8.6pt; color: #fff; background: var(--accent);
    padding: 0.3mm 1.6mm; border-radius: 3px;
  }
  .fam-paper { font-size: 6.2pt; color: #a08a5e; }
  .fam ul { margin: 0; padding: 0 0 0 3.4mm; }
  .fam li { margin: 0 0 0.7mm; }
  .fam li b { color: #7a4a12; }
  cite { font-style: normal; color: #b09668; font-size: 0.82em; white-space: nowrap; }
  footer.bottom {
    margin-top: 2.6mm; padding-top: 1.6mm; border-top: 1pt dotted #c9b891;
    font-size: 6.4pt; color: #8c7a55; text-align: center;
  }
  footer.bottom b { color: #6a5836; }
</style>
</head>
<body>
  <header class="top">
    <h1><span class="icon">🎯</span>進場前一張紙 · 5 分鐘速看 · 11 科高頻精華</h1>
    <span class="url">med-study-rpg.com/neurons/cram/5min</span>
  </header>
  <div class="cols">
    ${families.map(familyBlock).join('\n')}
  </div>
  <footer class="bottom">
    依歷屆<b>出現頻率</b>精選；<b>頻率高 ≠ 今年一定考</b>。&nbsp;·&nbsp;med-study-rpg.com/neurons/cram/5min
  </footer>
</body>
</html>`

const tmpDir = mkdtempSync(join(tmpdir(), 'speed-review-pdf-'))
const htmlPath = join(tmpDir, 'speed-review.html')
writeFileSync(htmlPath, html, 'utf8')

// ── 3. Discover a headless-Chrome binary (prefer cached Playwright chromium) ──
function findChrome() {
  // (a) Cached Playwright chrome-headless-shell — the "cached chromium" (newest revision first).
  const msDir = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (existsSync(msDir)) {
    const shells = readdirSync(msDir)
      .filter((d) => d.startsWith('chromium_headless_shell-'))
      .map((d) => ({
        rev: Number(d.split('-')[1]) || 0,
        bin: join(msDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
      }))
      .filter((x) => existsSync(x.bin))
      .sort((a, b) => b.rev - a.rev)
    if (shells.length > 0) return { bin: shells[0].bin, headlessFlag: false }
  }
  // (b) / (c) Full browsers — pass --headless=new.
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]
  for (const bin of candidates) if (existsSync(bin)) return { bin, headlessFlag: true }
  return null
}

const chrome = findChrome()
if (!chrome) {
  console.error('✗ No headless Chrome binary found.')
  console.error('  Tried: cached Playwright chrome-headless-shell, Google Chrome, Chromium.')
  console.error('  Install Google Chrome, or run `npx playwright install chromium`, then retry.')
  process.exit(1)
}

// ── 4. Render → PDF (macOS has no `timeout` binary → guard with a JS-side kill) ──
function renderPdf() {
  return new Promise((resolve, reject) => {
    const args = [
      ...(chrome.headlessFlag ? ['--headless=new'] : []),
      '--disable-gpu',
      '--no-sandbox',
      '--no-pdf-header-footer',
      `--print-to-pdf=${OUT_PDF}`,
      pathToFileURL(htmlPath).href,
    ]
    const child = spawn(chrome.bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    const killer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Chrome render timed out after 60s'))
    }, 60_000)
    child.on('error', (e) => {
      clearTimeout(killer)
      reject(e)
    })
    child.on('exit', (code) => {
      clearTimeout(killer)
      if (code === 0) resolve(stderr.trim())
      else reject(new Error(`Chrome exited ${code}: ${stderr.trim()}`))
    })
  })
}

try {
  await renderPdf()
} catch (e) {
  console.error(`✗ Render failed: ${e.message}`)
  process.exit(1)
}

if (!existsSync(OUT_PDF)) {
  console.error(`✗ Expected PDF not written: ${OUT_PDF}`)
  process.exit(1)
}
const bytes = statSync(OUT_PDF).size

console.log('\n=== render-speed-review-pdf summary ===')
console.log(`renderer:   ${chrome.bin}`)
console.log(`families:   ${families.length} · essence lines: ${totalLines}`)
console.log(`PDF:        ${OUT_PDF}`)
console.log(`size:       ${(bytes / 1024).toFixed(1)} KB`)
if (bytes < 5 * 1024) {
  console.error('\n✗ PDF is suspiciously small (<5KB) — likely a blank render. Not accepting.')
  process.exit(1)
}
console.log('\n✓ One-page speed-review PDF written. Verify page count = 1 with `pdfinfo`.')
