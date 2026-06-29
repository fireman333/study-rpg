/**
 * Locate PDF page windows for questions left with an empty 詳解 by extraction
 * (backfill-neurons-missing-explanations, task 1.1). For each empty-`explanation`
 * question, derive its 陽明 詳解 PDF file + an estimated page by interpolating from the
 * nearest same-paper questions present in the page maps (qNumber-ordered), and write a
 * per-question input file + a manifest into a working dir.
 *
 *   tsx scripts/option-explanations/locate-missing-explanation-pages.ts <workDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROVENANCE = resolve(import.meta.dirname, '..', '..', 'provenance')
const CORPUS = resolve(import.meta.dirname, '..', '..', 'data', 'medexam-reconciled', 'questions.json')

type Q = { id: string; subject: string; stem: string; options: Record<string, string>; answer: string; explanation?: string }
type PageMap = Record<string, { file: string; page: number }>

const qNum = (id: string) => Number(id.match(/-Q(\d+)$/)?.[1] ?? NaN)
const paperOf = (id: string) => id.split('-').slice(0, 3).join('-') // <year>-<session>-<book>

function main(): void {
  const workDir = process.argv[2]
  if (!workDir) throw new Error('usage: locate-missing-explanation-pages.ts <workDir>')
  const inputsDir = resolve(workDir, 'inputs')
  mkdirSync(inputsDir, { recursive: true })

  const corpus: Q[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const pm: PageMap = JSON.parse(readFileSync(resolve(PROVENANCE, 'question-page-map.json'), 'utf-8'))
  const pmr: PageMap = JSON.parse(readFileSync(resolve(PROVENANCE, 'question-page-map-residual.json'), 'utf-8'))
  const allMaps: PageMap = { ...pmr, ...pm } // pm wins on overlap

  // Index mapped questions by paper → sorted [{q, page, file}]
  const byPaper = new Map<string, { q: number; page: number; file: string }[]>()
  for (const [qid, m] of Object.entries(allMaps)) {
    const p = paperOf(qid)
    if (!byPaper.has(p)) byPaper.set(p, [])
    byPaper.get(p)!.push({ q: qNum(qid), page: m.page, file: m.file })
  }
  for (const arr of byPaper.values()) arr.sort((a, b) => a.q - b.q)

  const targets = corpus.filter((q) => !(q.explanation ?? '').trim())
  const manifest: Record<string, unknown>[] = []

  for (const q of targets) {
    const paper = paperOf(q.id)
    const n = qNum(q.id)
    const mapped = byPaper.get(paper) ?? []
    // direct map?
    const direct = allMaps[q.id]
    let file: string | undefined
    let estPage: number | undefined
    let how: string
    if (direct) {
      file = direct.file
      estPage = direct.page
      how = 'direct-map'
    } else if (mapped.length) {
      // nearest below + above by qNumber → linear interpolate page
      const below = [...mapped].filter((m) => m.q < n).pop()
      const above = mapped.find((m) => m.q > n)
      file = (below ?? above)!.file
      if (below && above && above.q !== below.q) {
        estPage = Math.round(below.page + ((above.page - below.page) * (n - below.q)) / (above.q - below.q))
        how = `interp ${below.q}@${below.page}..${above.q}@${above.page}`
      } else if (below) {
        estPage = below.page + (n - below.q)
        how = `extrap-below ${below.q}@${below.page}`
      } else {
        estPage = Math.max(0, above!.page - (above!.q - n))
        how = `extrap-above ${above!.q}@${above!.page}`
      }
    } else {
      how = 'no-neighbours'
    }

    const input = {
      qid: q.id,
      paper,
      qNumber: n,
      subject: q.subject,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      pdfFile: file,
      estPage,
      how,
    }
    writeFileSync(resolve(inputsDir, `${q.id}.json`), JSON.stringify(input, null, 1))
    manifest.push(input)
  }

  manifest.sort((a, b) => String(a.qid).localeCompare(String(b.qid)))
  writeFileSync(resolve(workDir, 'manifest.json'), JSON.stringify(manifest, null, 1))

  console.log('=== LOCATE MISSING-詳解 PAGES ===')
  console.log(`empty-explanation questions: ${targets.length}`)
  for (const m of manifest) console.log(`  ${m.qid}  Q${m.qNumber}  ${m.pdfFile ?? '(no pdf)'}  ~p${m.estPage ?? '?'}  [${m.how}]`)
  console.log(`inputs → ${inputsDir}`)
}

main()
