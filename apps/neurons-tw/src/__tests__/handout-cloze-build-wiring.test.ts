// The cloze step's WIRING in `build-handout.ts` (add-neurons-handout-cloze-corpus D4, task 3.3).
//
// `handout-cloze-gate.test.ts` proves the gate's verdicts; a perfect gate that runs after the write,
// or whose failure path forgets the previous run's artefact, would still pass every one of them.
// These are source-text guards on the build script. The real-process proof is the deliberately
// failing source run of task 3.4 (rc=1, no `handout-cloze.json`).
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/content-neurons-tw/scripts/build-handout.ts'),
  'utf8',
)

/** The body of `function <name>(…) {…}`, by brace matching (the script has no braces in strings that matter). */
function fnBody(src: string, name: string): string {
  const at = src.indexOf(`function ${name}(`)
  expect(at, `function ${name} exists`).toBeGreaterThan(-1)
  const open = src.indexOf('{', src.indexOf(')', at))
  let depth = 0
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1)
  }
  throw new Error(`unbalanced braces in ${name}`)
}

const step = fnBody(SRC, 'runClozeStep')
/** Top-level code only — the script is not wrapped in main(); drop the function declarations. */
const topLevel = SRC.slice(0, SRC.indexOf('function runClozeStep('))

describe('build-handout: cloze step wiring', () => {
  it('runs once, at the very end, after handout.json is written', () => {
    const calls = topLevel.match(/\brunClozeStep\s*\(/g) ?? []
    expect(calls).toHaveLength(1)
    const call = topLevel.indexOf('runClozeStep(')
    const handoutWrite = topLevel.indexOf("writeFileSync(join(DIST, 'handout.json')")
    expect(handoutWrite).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(handoutWrite)
    // Every existing handout gate exits before this point.
    expect(call).toBeGreaterThan(topLevel.lastIndexOf('process.exit(1)'))
    // Nothing but comments follows the call at top level.
    const after = topLevel.slice(topLevel.indexOf('\n', call)).replace(/\/\/.*$/gm, '').replace(/\/\*\*[\s\S]*?\*\//g, '')
    expect(after.trim()).toBe('')
  })

  it('deletes the previous artefact FIRST, before any input is read', () => {
    const firstStatement = step.slice(1).replace(/^\s*(\/\/.*\n\s*)*/, '')
    expect(firstStatement.startsWith('rmSync(CLOZE_OUT_PATH, { force: true })')).toBe(true)
    const rm = step.indexOf('rmSync(CLOZE_OUT_PATH')
    const firstRead = step.search(/\b(readFileSync|readdirSync|existsSync|extractTopics)\(/)
    expect(firstRead).toBeGreaterThan(-1)
    expect(rm).toBeLessThan(firstRead)
  })

  it('validates before it writes the populated artefact, and the failure branch deletes then exits', () => {
    const validate = step.indexOf('validateClozeCorpus(')
    const failBranch = step.indexOf('if (errors.length > 0) {')
    const failRm = step.indexOf('rmSync(CLOZE_OUT_PATH', failBranch)
    const failExit = step.indexOf('process.exit(1)', failBranch)
    const lastWrite = step.lastIndexOf('writeFileSync(CLOZE_OUT_PATH')
    for (const x of [validate, failBranch, failRm, failExit, lastWrite]) expect(x).toBeGreaterThan(-1)
    expect(failBranch).toBeGreaterThan(validate)
    expect(failRm).toBeGreaterThan(failBranch)
    expect(failExit).toBeGreaterThan(failRm)
    expect(lastWrite).toBeGreaterThan(failExit)
  })

  it('self-checks hash and bulletText before the populated write, and fails closed', () => {
    const check = step.indexOf('shippedCardIntegrityErrors(result.cards)')
    const branch = step.indexOf('if (integrity.length > 0) {')
    const rm = step.indexOf('rmSync(CLOZE_OUT_PATH', branch)
    const exit = step.indexOf('process.exit(1)', branch)
    const lastWrite = step.lastIndexOf('writeFileSync(CLOZE_OUT_PATH')
    for (const x of [check, branch, rm, exit, lastWrite]) expect(x).toBeGreaterThan(-1)
    expect(branch).toBeGreaterThan(check)
    expect(rm).toBeGreaterThan(branch)
    expect(exit).toBeGreaterThan(rm)
    expect(lastWrite).toBeGreaterThan(exit)
  })

  it('prints counts on both paths, with pre-gate file errors folded in', () => {
    expect(step).toContain('withFileLevelErrors(result.counts, preErrors)')
    expect(step).not.toContain('formatClozeCounts(result.counts)')
    expect(step.match(/formatClozeCounts\(counts\)/g) ?? []).toHaveLength(2)
  })

  it('writes `{ version, cards: [] }` when `_cloze/` is absent or empty', () => {
    const empty = step.slice(0, step.indexOf('validateClozeCorpus('))
    expect(empty).toMatch(/cards: \[\]/)
    expect(empty).toContain('writeFileSync(CLOZE_OUT_PATH')
    expect(empty).toContain('imported: 0, rejected: 0, total: 0')
  })

  it('reads `src/handout/_cloze/` and never reads `scripts/cloze-wip/`', () => {
    expect(SRC).toMatch(/const CLOZE_SRC_DIR = join\(FRAG_DIR, '_cloze'\)/)
    expect(SRC).not.toMatch(/(readdirSync|readFileSync|existsSync)\(\s*(CLOZE_WIP_DIR|join\(\s*CLOZE_WIP_DIR)/)
  })

  it('anchors against the SHIPPED html (after the leaf-anchor gate), keyed by subject', () => {
    expect(step).toMatch(/extractTopics\(html, f\.subjectId\)/)
    expect(step).toMatch(/new Map\(shipped\.map\(\(s\) => \[s\.subjectId, s\.html\]\)\)/)
  })
})

describe('copy-content: handout-cloze.json is an optional artefact', () => {
  it('is in the optional copy list', () => {
    const copy = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/copy-content.mjs'), 'utf8')
    expect(copy).toMatch(/for \(const file of \[[^\]]*'handout-cloze\.json'[^\]]*\]\) \{\s*const src = resolve\(SRC_DIR, file\)\s*if \(existsSync\(src\)\)/)
  })
})
