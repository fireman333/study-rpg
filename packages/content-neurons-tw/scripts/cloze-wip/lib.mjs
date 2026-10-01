// Shared loaders for the cloze generator (add-neurons-handout-cloze-corpus D5, task 4.1). NOT shipped,
// never read by the build. Ported from study-rpg-2nd `docs/handouts/_cloze-wip/lib.mjs`.
//
// Run every script here through the content package's tsx, so the package's TypeScript sources are
// imported directly — the generator must see the SAME plain text and run the SAME gate as the build
// (`scripts/build-handout.ts` `runClozeStep`), never a re-implementation:
//
//   TSX=packages/content-neurons-tw/node_modules/.bin/tsx
//   $TSX packages/content-neurons-tw/scripts/cloze-wip/<script>.mjs [--subjects=胚胎學,寄生蟲學]
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { injectLeafAnchors } from '../../src/handout/leaf-anchor-gate.ts'
import { extractTopics } from '../../src/handout/topic-plain-text.ts'
import { maxCardsForTier, topicTier } from '../../src/handout/cloze-gate.ts'

export const WIP_DIR = dirname(fileURLToPath(import.meta.url))
export const PKG = join(WIP_DIR, '../..')
export const REPO_ROOT = join(PKG, '../..')
export const FRAG_DIR = join(PKG, 'src', 'handout')
export const CLOZE_SRC_DIR = join(FRAG_DIR, '_cloze')
export const DIST = join(PKG, 'dist')
export const DRAFTS_DIR = join(WIP_DIR, 'drafts')

/** Pilot subjects (tasks 5.1). Override with `--subjects=胚胎學,寄生蟲學`. */
export const PILOT_SUBJECTS = ['胚胎學', '寄生蟲學']

export function subjectsFromArgv(argv = process.argv) {
  const a = argv.find((x) => x.startsWith('--subjects='))
  return a ? a.slice('--subjects='.length).split(',').filter(Boolean) : PILOT_SUBJECTS
}

export const readJson = (p, fallback) => {
  if (!existsSync(p)) {
    if (fallback === undefined) throw new Error(`missing required file ${p}`)
    return fallback
  }
  return JSON.parse(readFileSync(p, 'utf-8'))
}

let cache = null
/**
 * Everything the generator reads from `dist/` (the same files `build-handout.ts` reads with
 * `loadDist`). Run `pnpm --filter @study-rpg/content-neurons-tw build` first if `dist/` is missing.
 *   - `recurrence`: `<subjectId>::<leafId>` → current tier (a leafId is not unique across subjects);
 *   - `rec`: the raw concept-recurrence.json (for the canonical leaf set);
 *   - `questions`: id → question (`dist/questions.json`);
 *   - `leafToQuestions`: leafId → qid[] from `dist/concept-tags.json` (`{qid: leafId[]}`).
 */
export function loadContent() {
  if (cache) return cache
  const need = (name) => readJson(join(DIST, name))
  const rec = need('concept-recurrence.json')
  const recurrence = new Map()
  for (const c of rec.concepts) if (c.tier) recurrence.set(`${c.subjectId}::${c.leafId}`, c.tier)
  const questions = new Map(need('questions.json').map((q) => [q.id, q]))
  const leafToQuestions = new Map()
  for (const [qid, leaves] of Object.entries(need('concept-tags.json'))) {
    for (const lf of leaves ?? []) {
      const list = leafToQuestions.get(lf) ?? []
      list.push(qid)
      leafToQuestions.set(lf, list)
    }
  }
  cache = { rec, recurrence, questions, leafToQuestions }
  return cache
}

/**
 * The canonical (region-bearing) leaf set the leaf-anchor gate validates against — a verbatim mirror
 * of `build-handout.ts` `canonicalLeavesForSubject` (that function lives in a script that writes
 * files at its top level, so it cannot be imported).
 */
export function canonicalLeavesForSubject(subjectId, rec) {
  const configPath = join(PKG, `${subjectId}.config.json`)
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    return new Set(config.flatMap((r) => r.leafIds))
  }
  return new Set(rec.concepts.filter((c) => c.subjectId === subjectId).map((c) => c.leafId))
}

/** The topic's heading as displayed: the first non-blank line of its plain text (the `<h3>`). */
const headingOf = (topic) => topic.text.split('\n').map((s) => s.trim()).find(Boolean) ?? ''

/**
 * One subject's topics exactly as the build sees them: raw html (trimmed, as the build reads it) →
 * `injectLeafAnchors` with the build's canonical leaf set → `extractTopics`. Tagged topics are bound
 * to their current tier, `maxCards`, and their linked questions; untagged topics may hold no cards
 * and are returned separately.
 *
 * Linked questions of a topic: the questions whose concept-tags include ANY of the topic's leafIds
 * AND whose `subject` is this subject (a leafId is not unique across subjects).
 */
export function loadSubject(subjectId) {
  const { rec, recurrence, questions, leafToQuestions } = loadContent()
  const htmlPath = join(FRAG_DIR, `${subjectId}.html`)
  const rawHtml = readFileSync(htmlPath, 'utf8').trim()
  const html = injectLeafAnchors(subjectId, rawHtml, canonicalLeavesForSubject(subjectId, rec)).html
  const topics = extractTopics(html, subjectId)
  const bound = []
  const untagged = []
  for (const t of topics) {
    if (!t.anchorId) {
      untagged.push({ ordinal: t.ordinal, heading: headingOf(t) })
      continue
    }
    const tier = topicTier(subjectId, t.leafIds, recurrence) // throws on a missing / unmapped tier
    const qids = new Set()
    for (const lf of t.leafIds) {
      for (const qid of leafToQuestions.get(lf) ?? []) if (questions.get(qid)?.subject === subjectId) qids.add(qid)
    }
    bound.push({
      anchorId: t.anchorId,
      leafId: t.leafIds[0],
      leafIds: t.leafIds,
      heading: headingOf(t),
      topic: t,
      tier,
      maxCards: maxCardsForTier(tier),
      linkedQuestionIds: [...qids].sort(),
    })
  }
  return {
    subjectId,
    relPath: `packages/content-neurons-tw/src/handout/${subjectId}.html`,
    clozeFile: `src/handout/_cloze/${subjectId}.json`,
    html,
    topics,
    bound,
    untagged,
  }
}

/** Filesystem-safe name for a per-topic draft file. */
export const draftName = (anchorId) => anchorId.replace('::', '__') + '.json'
