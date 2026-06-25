import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Integrity guard for the 詳解 image-crop tier (add-neurons-explanation-table-images).
 * The renderer itself is verified by live browser smoke (this repo has no
 * component-test harness); here we lock the data wiring that the renderer relies
 * on: every manifest entry must point at a committed WebP asset and a real corpus
 * question, and the field must stay additive (id / answer never altered).
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const PACK = resolve(HERE, '../../../../packages/content-neurons-tw')
const ASSET_DIR = resolve(PACK, 'table-images')
const MANIFEST = resolve(ASSET_DIR, 'manifest.json')
const PROSE = resolve(ASSET_DIR, 'prose.json')
const CORPUS = resolve(PACK, 'data/medexam-reconciled/questions.json')

type Manifest = Record<string, { src: string; caption?: string }[]>

describe('explanation table-image manifest', () => {
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'))
  const prose: Record<string, string[]> = JSON.parse(readFileSync(PROSE, 'utf-8'))
  const corpus: { id: string; answer: string }[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const byId = new Map(corpus.map((q) => [q.id, q]))

  it('covers the 49 Bucket C questions with 70 images (27 pilot + 22 tail)', () => {
    expect(Object.keys(manifest)).toHaveLength(49)
    const total = Object.values(manifest).reduce((n, imgs) => n + imgs.length, 0)
    expect(total).toBe(70)
  })

  it('every image-tier question has clean prose (so the garbled string is never shown)', () => {
    for (const qid of Object.keys(manifest)) {
      expect(prose[qid]?.length, `${qid} missing prose.json entry`).toBeTruthy()
    }
  })

  it('every manifest qid resolves to a real corpus question', () => {
    for (const qid of Object.keys(manifest)) {
      expect(byId.has(qid), `unknown qid ${qid}`).toBe(true)
    }
  })

  it('every image src is a well-formed table-images path with an existing webp', () => {
    for (const [qid, imgs] of Object.entries(manifest)) {
      imgs.forEach((img, i) => {
        expect(img.src, `${qid}[${i}]`).toMatch(/^content\/neurons-tw\/table-images\/.+\.webp$/)
        const file = resolve(ASSET_DIR, img.src.split('/').pop()!)
        expect(existsSync(file), `missing asset ${img.src}`).toBe(true)
        expect(typeof img.caption === 'undefined' || img.caption.length > 0).toBe(true)
      })
    }
  })

  it('is additive — corpus answers are present (never blanked by the image tier)', () => {
    for (const qid of Object.keys(manifest)) {
      const q = byId.get(qid)!
      expect(q.answer, `${qid} answer`).toBeTruthy()
    }
  })
})
