import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Integrity guard for the recovered 詳解-figure tier (recover-neurons-explanation-figures).
 * The renderer is verified by live browser smoke; here we lock the data wiring it relies on:
 * every manifest entry points at a committed content-hashed WebP asset and a real corpus
 * question, the field stays additive (source questions.json is NOT edited — figures are
 * build-injected only), and the build actually injects explanationFigures into the served json.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const PACK = resolve(HERE, '../../../../packages/content-neurons-tw')
const ASSET_DIR = resolve(PACK, 'explanation-figures')
const MANIFEST = resolve(ASSET_DIR, 'manifest.json')
const SOURCE_CORPUS = resolve(PACK, 'data/medexam-reconciled/questions.json')
const BUILT_CORPUS = resolve(HERE, '../../public/content/neurons-tw/questions.json')

type FigureRef = { src: string; provenance?: unknown; attributionConfidence?: string }
type Manifest = Record<string, FigureRef[]>

describe('explanation-figure manifest', () => {
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'))
  const source: { id: string; answer: string; explanationFigures?: unknown }[] = JSON.parse(
    readFileSync(SOURCE_CORPUS, 'utf-8'),
  )
  const byId = new Map(source.map((q) => [q.id, q]))

  it('covers the 106-114 set (1128 questions / 1585 figures = 112-114 pilot 636/926 + 106-111 batch 492/659, post agent-QA prune of 9 pilot + 17 multi-fig + 47 single-fig decorative/off-topic/pure-text embeds)', () => {
    expect(Object.keys(manifest)).toHaveLength(1128)
    const total = Object.values(manifest).reduce((n, figs) => n + figs.length, 0)
    expect(total).toBe(1585)
  })

  it('every manifest qid is an in-scope booklet (106-114, excluding the deferred no-題號-anchor 109-1/111-1 + 104-105) and a real corpus question', () => {
    for (const qid of Object.keys(manifest)) {
      expect(byId.has(qid), `unknown qid ${qid}`).toBe(true)
      expect(qid, `${qid} not an in-scope (106-114) booklet`).toMatch(/^1(?:0[6-9]|1[0-4])-[12]-/)
    }
  })

  it('every figure src is a content-hashed explanation-figures path with an existing webp', () => {
    for (const [qid, figs] of Object.entries(manifest)) {
      figs.forEach((fig, i) => {
        expect(fig.src, `${qid}[${i}]`).toMatch(
          /^content\/neurons-tw\/explanation-figures\/.+__\d+\.[0-9a-f]{8}\.webp$/,
        )
        const file = resolve(ASSET_DIR, fig.src.split('/').pop()!)
        expect(existsSync(file), `missing asset ${fig.src}`).toBe(true)
      })
    }
  })

  it('filename content-hash matches the asset bytes (cache-busting integrity)', () => {
    // spot-check the first figure of each booklet to keep it fast
    const seen = new Set<string>()
    for (const figs of Object.values(manifest)) {
      const fig = figs[0]
      const booklet = fig.src.match(/(1(?:0[6-9]|1[0-4])-[12])/)?.[1] ?? ''
      if (seen.has(booklet)) continue
      seen.add(booklet)
      const base = fig.src.split('/').pop()!
      const hash = base.match(/__\d+\.([0-9a-f]{8})\.webp$/)![1]
      const bytes = readFileSync(resolve(ASSET_DIR, base))
      expect(createHash('sha1').update(bytes).digest('hex').slice(0, 8), base).toBe(hash)
    }
  })

  it('is additive — source questions.json is NOT edited (figures are build-injected, answers intact)', () => {
    for (const qid of Object.keys(manifest)) {
      const q = byId.get(qid)!
      expect(q.answer, `${qid} answer`).toBeTruthy()
      // source must NOT carry explanationFigures — the build injects it into the served json only
      expect(q.explanationFigures, `${qid} source must not carry explanationFigures`).toBeUndefined()
    }
  })

  it('the build injects explanationFigures into the served questions.json', () => {
    if (!existsSync(BUILT_CORPUS)) return // built artifact may be absent in a fresh checkout
    const built: { id: string; explanationFigures?: { src: string }[] }[] = JSON.parse(
      readFileSync(BUILT_CORPUS, 'utf-8'),
    )
    const builtById = new Map(built.map((q) => [q.id, q]))
    for (const qid of Object.keys(manifest)) {
      const figs = builtById.get(qid)?.explanationFigures
      expect(figs?.length, `${qid} built figures`).toBe(manifest[qid].length)
    }
  })
})
