// Browser parity of the reader plain text (add-neurons-handout-cloze-corpus D2, task 1.5).
//
// vitest (node) can only prove the parse5 transformation is serialisation-stable; it cannot prove a
// real browser displays the same text — both sides would be parse5. This script is that proof: a real
// headless Chromium parses the SHIPPED handout html with `DOMParser`, splits it into regions exactly
// like `apps/neurons-tw/src/lib/handout-regions.ts` `deriveRegions` (region `outerHTML`, re-parsed as
// the reader's `dangerouslySetInnerHTML` does), and takes every `.hdt-topic ul.hdt-must > li`'s
// `textContent` with nested lists removed. That must equal, character for character:
//   - `extractTopics` (`src/handout/topic-plain-text.ts`) for EVERY bullet of the subject, and
//   - `bulletText` of every card in `dist/handout-cloze.json` (when it exists).
//
// Local tool, NOT CI, NO dependency added. Playwright comes from npx, pinned to a version whose
// Chromium is already in ~/Library/Caches/ms-playwright (1.58.0 ↔ chromium 1208), so nothing downloads:
//
//   npx -y -p playwright@1.58.0 -p tsx tsx packages/content-neurons-tw/scripts/cloze-wip/parity-browser.mjs --subjects=胚胎學,寄生蟲學
//
// Prints matched / mismatched / total and exits 1 on any mismatch (or on a missing input).
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, join } from 'node:path'
import { extractTopics } from '../../src/handout/topic-plain-text.ts'
import { DIST, subjectsFromArgv } from './lib.mjs'

const handoutPath = join(DIST, 'handout.json')
if (!existsSync(handoutPath)) {
  console.error(`[parity] ✗ ${handoutPath} not found — run pnpm --filter @study-rpg/content-neurons-tw build first`)
  process.exit(1)
}
const shipped = new Map(JSON.parse(readFileSync(handoutPath, 'utf8')).subjects.map((s) => [s.subjectId, s.html]))
const clozePath = join(DIST, 'handout-cloze.json')
const clozeCards = existsSync(clozePath) ? JSON.parse(readFileSync(clozePath, 'utf8')).cards : null

/**
 * `playwright` is not a dependency of this repo. An ESM bare import resolves from THIS file's
 * location (never from npx's temporary install), so find the package npx put on PATH instead.
 */
function loadPlaywright() {
  const req = createRequire(import.meta.url)
  try {
    return req('playwright')
  } catch {
    // not installed in the repo — expected; look for npx's copy below
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir.endsWith(join('node_modules', '.bin'))) continue
    const pkg = join(dir, '..', 'playwright', 'package.json')
    if (existsSync(pkg)) return createRequire(pkg)('playwright')
  }
  console.error('[parity] ✗ playwright not found — run through `npx -y -p playwright@1.58.0 -p tsx tsx …` (see header)')
  process.exit(1)
}
const { chromium } = loadPlaywright()

/** Runs IN the browser: the reader's region split, then every bullet's displayed text. */
function browserBullets(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const regions = [...doc.querySelectorAll('.hdt-region')].map((s) => s.outerHTML)
  const out = []
  let ordinal = 0
  for (const regionHtml of regions) {
    const host = document.createElement('div')
    host.innerHTML = regionHtml // what dangerouslySetInnerHTML does with the region html
    for (const topic of host.querySelectorAll('.hdt-topic')) {
      const leafIds = (topic.getAttribute('data-leaf-ids') ?? '').trim().split(/\s+/).filter(Boolean)
      const bullets = [...topic.querySelectorAll('ul.hdt-must > li')].map((li) => {
        const clone = li.cloneNode(true)
        for (const nested of clone.querySelectorAll('ul, ol')) nested.remove()
        return clone.textContent
      })
      out.push({ ordinal: ordinal++, leafIds, bullets })
    }
  }
  return out
}

const browser = await chromium.launch({ headless: true })
const exe = chromium.executablePath()
console.log(`[parity] chromium ${browser.version()} — ${exe}`)
let matched = 0
let mismatched = 0
let cardMatched = 0
let cardMismatched = 0
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  for (const subjectId of subjectsFromArgv()) {
    const html = shipped.get(subjectId)
    if (html === undefined) {
      console.error(`[parity] ✗ ${subjectId} is not in dist/handout.json`)
      mismatched += 1
      continue
    }
    const inBrowser = await page.evaluate(browserBullets, html)
    const inNode = extractTopics(html, subjectId)
    let subjMatched = 0
    let subjMismatched = 0
    if (inBrowser.length !== inNode.length) {
      console.error(`[parity] ✗ ${subjectId}: browser sees ${inBrowser.length} topics, extractTopics ${inNode.length}`)
      subjMismatched += 1
    }
    for (let i = 0; i < Math.max(inBrowser.length, inNode.length); i += 1) {
      const b = inBrowser[i]?.bullets ?? []
      const n = inNode[i]?.bullets.map((x) => x.text) ?? []
      const label = `${subjectId} topic ${i} (${(inNode[i]?.leafIds ?? inBrowser[i]?.leafIds ?? []).join(' ') || 'untagged'})`
      if (inBrowser[i] && inNode[i] && inBrowser[i].leafIds.join(' ') !== inNode[i].leafIds.join(' ')) {
        console.error(`[parity] ✗ ${label}: data-leaf-ids differ (browser "${inBrowser[i].leafIds.join(' ')}")`)
        subjMismatched += 1
      }
      for (let k = 0; k < Math.max(b.length, n.length); k += 1) {
        if (b[k] === n[k]) {
          subjMatched += 1
          continue
        }
        subjMismatched += 1
        console.error(`[parity] ✗ ${label} bullet ${k}:\n    browser: ${JSON.stringify(b[k])}\n    node   : ${JSON.stringify(n[k])}`)
      }
    }
    matched += subjMatched
    mismatched += subjMismatched
    console.log(`[parity] ${subjectId}: bullets matched ${subjMatched}, mismatched ${subjMismatched}, total ${subjMatched + subjMismatched}`)

    if (clozeCards) {
      const byAnchor = new Map(inBrowser.filter((t) => t.leafIds.length).map((t) => [`${subjectId}::${t.leafIds[0]}`, t]))
      for (const c of clozeCards.filter((x) => x.anchorId.startsWith(`${subjectId}::`))) {
        const t = byAnchor.get(c.anchorId)
        if (t && t.bullets.includes(c.bulletText)) cardMatched += 1
        else {
          cardMismatched += 1
          console.error(`[parity] ✗ card ${c.cardId}: bulletText is not any browser li text of ${c.anchorId}`)
        }
      }
    }
  }
} finally {
  await browser.close()
}
console.log(`[parity] bullets — matched: ${matched}, mismatched: ${mismatched}, total: ${matched + mismatched}`)
console.log(
  clozeCards
    ? `[parity] cards (dist/handout-cloze.json bulletText) — matched: ${cardMatched}, mismatched: ${cardMismatched}, total: ${cardMatched + cardMismatched}`
    : '[parity] cards — dist/handout-cloze.json not found, skipped',
)
if (mismatched + cardMismatched > 0) process.exitCode = 1
