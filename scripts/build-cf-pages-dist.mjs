#!/usr/bin/env node
/**
 * Assemble dist-cf/ for Cloudflare Pages deploy.
 *
 * Inputs (must exist before this runs):
 *   apps/neurons-tw/dist/                ← 神經元 (M_3rd, canonical), built with VITE_DEPLOY_BASE=/neurons/
 *   scripts/cf-landing-template.html     ← root landing page
 *
 *   NOTE: 一階 (/1st/) was removed (remove-medexam-tw-and-promote-neurons).
 *   二階 (/2nd/) is not assembled here — it ships from the standalone repo / CF
 *   project med-study-rpg-2nd, fronted by the edge-router Worker on
 *   med-study-rpg.com/2nd/* (split-medexam2-standalone §5).
 *
 * Output:
 *   dist-cf/
 *     index.html                         ← copy of cf-landing-template.html
 *     _redirects                         ← SPA fallback rules
 *     neurons/                           ← 神經元 dist
 *
 * Specs:
 *   openspec/changes/add-med-study-rpg-domain-migration/specs/deploy-pipeline/spec.md
 *     — "Cloudflare Pages deploy target alongside GitHub Pages" + "SPA fallback via _redirects"
 *   openspec/specs/neurons-deploy/spec.md (added by add-neurons-deploy)
 *     — "CF Pages build pipeline SHALL produce dist-cf/neurons/ artifact"
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const ROUTES = [
  // 一階 (/1st/) removed (remove-medexam-tw-and-promote-neurons).
  // 二階 (/2nd/) extracted to standalone repo + CF project med-study-rpg-2nd;
  // the edge-router Worker now serves med-study-rpg.com/2nd/* from there, so the
  // combined project no longer assembles it (split-medexam2-standalone §5).
  { src: 'apps/neurons-tw/dist', dest: 'neurons' },
]

const OUTPUT_DIR = 'dist-cf'
const LANDING_TEMPLATE = 'scripts/cf-landing-template.html'
// Pixel font for the root landing page. The landing references it with a
// relative url('Cubic_11.woff2'), so it must sit next to dist-cf/index.html.
// Source = the same Cubic 11 the neurons app bundles.
const LANDING_FONT_SRC = 'apps/neurons-tw/src/assets/fonts/Cubic_11.woff2'
const LANDING_FONT_DEST = 'Cubic_11.woff2'

async function ensureDistExists(relPath) {
  const abs = path.join(repoRoot, relPath)
  let stat
  try {
    stat = await fs.stat(abs)
  } catch {
    throw new Error(`Required input missing: ${relPath} — run the app build first.`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`Required input is not a directory: ${relPath}`)
  }
  const indexHtml = path.join(abs, 'index.html')
  try {
    await fs.access(indexHtml)
  } catch {
    throw new Error(`Build looks incomplete: ${relPath}/index.html missing.`)
  }
}

async function ensureFileExists(relPath) {
  const abs = path.join(repoRoot, relPath)
  try {
    await fs.access(abs)
  } catch {
    throw new Error(`Required input missing: ${relPath}`)
  }
}

async function resetOutputDir() {
  const abs = path.join(repoRoot, OUTPUT_DIR)
  await fs.rm(abs, { recursive: true, force: true })
  await fs.mkdir(abs, { recursive: true })
}

async function copyTree(srcRel, destRel) {
  const src = path.join(repoRoot, srcRel)
  const dest = path.join(repoRoot, OUTPUT_DIR, destRel)
  await fs.cp(src, dest, { recursive: true })
  // Strip GH-Pages-only SPA fallback helper. CF Pages handles SPA routing
  // via the top-level _redirects file; leaving 404.html in place makes CF
  // Pages serve it (with status 404) instead of applying the rewrite rule,
  // so a direct hit on `/1st/skills` would 404 the SPA route.
  const fourOhFour = path.join(dest, '404.html')
  await fs.rm(fourOhFour, { force: true })
}

async function writeRedirects() {
  // CF Pages SPA rewrite for two co-located apps.
  //
  // The `/<dest>/*  /<dest>/  200` rule serves the app's index.html for any
  // path under /<dest>/. But it also rewrites real static files (JSON, JS,
  // CSS, fonts, images) when those paths happen to share the prefix —
  // because the directory-canonical destination doesn't preserve the file
  // existence check (unlike the standard `/* /index.html 200` SPA pattern,
  // which is what CF Pages docs reference but only works on a single-app
  // site at the root).
  //
  // Workaround: explicitly pass through asset directories FIRST (using
  // `:splat` to preserve the original subpath), then fall through to the
  // SPA catch-all. Rule ordering matters — first match wins per CF docs.
  //
  // The per-app `404.html` (GH-Pages SPA-fallback helper) is stripped from
  // dist-cf/<dest>/ in copyTree() so it doesn't intercept before this fires.
  const assetDirs = ['assets', 'content', 'fonts', 'icons', 'images', 'provenance']
  const lines = []
  for (const { dest } of ROUTES) {
    for (const dir of assetDirs) {
      lines.push(`/${dest}/${dir}/*  /${dest}/${dir}/:splat  200`)
    }
    lines.push(`/${dest}/*  /${dest}/  200`)
  }
  const body = lines.join('\n') + '\n'
  await fs.writeFile(path.join(repoRoot, OUTPUT_DIR, '_redirects'), body, 'utf8')
}

async function writeLanding() {
  const tpl = await fs.readFile(path.join(repoRoot, LANDING_TEMPLATE), 'utf8')
  await fs.writeFile(path.join(repoRoot, OUTPUT_DIR, 'index.html'), tpl, 'utf8')
}

async function copyLandingFont() {
  const src = path.join(repoRoot, LANDING_FONT_SRC)
  const dest = path.join(repoRoot, OUTPUT_DIR, LANDING_FONT_DEST)
  await fs.cp(src, dest)
}

async function main() {
  console.log('build-cf-pages-dist: verifying inputs…')
  for (const { src } of ROUTES) {
    await ensureDistExists(src)
  }
  await ensureFileExists(LANDING_TEMPLATE)
  await ensureFileExists(LANDING_FONT_SRC)

  console.log(`build-cf-pages-dist: resetting ${OUTPUT_DIR}/`)
  await resetOutputDir()

  for (const { src, dest } of ROUTES) {
    console.log(`build-cf-pages-dist: ${src} → ${OUTPUT_DIR}/${dest}/`)
    await copyTree(src, dest)
  }

  console.log(`build-cf-pages-dist: writing ${OUTPUT_DIR}/_redirects`)
  await writeRedirects()

  console.log(`build-cf-pages-dist: writing ${OUTPUT_DIR}/index.html from template`)
  await writeLanding()

  console.log(`build-cf-pages-dist: copying ${LANDING_FONT_SRC} → ${OUTPUT_DIR}/${LANDING_FONT_DEST}`)
  await copyLandingFont()

  console.log('build-cf-pages-dist: done.')
}

main().catch((err) => {
  console.error('build-cf-pages-dist: FAILED —', err.message)
  process.exit(1)
})
