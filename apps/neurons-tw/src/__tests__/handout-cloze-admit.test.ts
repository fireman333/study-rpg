// The cloze generator's admission rules (add-neurons-handout-cloze-corpus D5, task 4.4).
//
// ⚠️ WHAT THIS FILE PROVES. The pure decisions in `packages/content-neurons-tw/scripts/cloze-wip/
// admit-lib.mjs`: card-id assignment (assigned once, never from text; corpus-unique across subjects
// that share a leafId), the contradiction block and the owner's ack, the ceiling under tier drift
// (existing cards keep `tierAtAdmission` and are never capped), and the `--promote` merge (never drops
// a card silently). It proves that `admit.mjs` CALLS these only by reading its source, and it proves
// nothing about whether a card is medically right.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain-Node owner tooling, no types by design (mirrors study-rpg-2nd cloze-admit.test.ts)
import * as lib from '../../../../packages/content-neurons-tw/scripts/cloze-wip/admit-lib.mjs'

const { promotableCards, contradictionKeys, assignCardIds, capAndAssign, mergePromoted, pilotRates, maskFace, resolveHides } = lib

const ADMIT_SRC = readFileSync(
  fileURLToPath(new URL('../../../../packages/content-neurons-tw/scripts/cloze-wip/admit.mjs', import.meta.url)),
  'utf-8',
)

type Card = { cardId: string; anchorId: string; sentenceHash?: string; masks?: unknown[]; tierAtAdmission?: string }
const ids = (r: { promote: Card[] }) => r.promote.map((c) => c.cardId)
const answer = (exact: string) => [{ exact, prefix: '', suffix: '', role: 'answer' }]

// The neurons gate names a location's topic `topic` (not 2nd's `anchorId`).
const REPORT = {
  heuristic: true,
  duplicates: [],
  contradictions: [
    {
      file: 'src/handout/_cloze/寄生蟲學.json',
      subject: '感染率',
      locations: [
        { topic: '寄生蟲學::malaria-plasmodium', bulletIndex: 2, value: '30%', sentenceHash: 'aaaa0001', sentence: 'x' },
        { topic: '寄生蟲學::babesiosis', bulletIndex: 0, value: '45-50%', sentenceHash: 'bbbb0002', sentence: 'y' },
      ],
    },
  ],
}

describe('contradiction block and owner ack', () => {
  const cards: Card[] = [
    { cardId: 'malaria-plasmodium#k1', anchorId: '寄生蟲學::malaria-plasmodium', sentenceHash: 'aaaa0001' },
    { cardId: 'babesiosis#k1', anchorId: '寄生蟲學::babesiosis', sentenceHash: 'bbbb0002' },
    { cardId: 'malaria-plasmodium#k2', anchorId: '寄生蟲學::malaria-plasmodium', sentenceHash: 'cccc0003' },
  ]
  const owner = { grader: 'owner', grades: Object.fromEntries(cards.map((c) => [c.cardId, { grade: 'good' }])) }

  it('keys contradictions by the neurons `topic` field AND bullet hash', () => {
    expect(contradictionKeys(REPORT)).toEqual(new Set(['寄生蟲學::malaria-plasmodium|aaaa0001', '寄生蟲學::babesiosis|bbbb0002']))
  })

  it('refuses a card on either contradicted bullet even when the owner graded it good', () => {
    const r = promotableCards(cards, owner, REPORT)
    expect(r.refused).toContainEqual({ cardId: 'malaria-plasmodium#k1', why: 'contradiction' })
    expect(r.refused).toContainEqual({ cardId: 'babesiosis#k1', why: 'contradiction' })
    expect(ids(r)).toEqual(['malaria-plasmodium#k2'])
  })

  it('promotes the listing once the owner acks subject + every bullet hash', () => {
    const acks = [{ subject: '感染率', sentenceHashes: ['aaaa0001', 'bbbb0002'], reason: '不同事實' }]
    expect(ids(promotableCards(cards, owner, REPORT, acks))).toEqual(cards.map((c) => c.cardId))
  })

  it('still refuses when the ack misses a bullet or names another subject', () => {
    expect(ids(promotableCards(cards, owner, REPORT, [{ subject: '感染率', sentenceHashes: ['aaaa0001'], reason: 'partial' }]))).toEqual([
      'malaria-plasmodium#k2',
    ])
    expect(
      ids(promotableCards(cards, owner, REPORT, [{ subject: '別的詞', sentenceHashes: ['aaaa0001', 'bbbb0002'], reason: 'x' }])),
    ).toEqual(['malaria-plasmodium#k2'])
  })

  it('never promotes on an agent pre-grade, nor bad / ungraded cards', () => {
    expect(promotableCards(cards, { ...owner, grader: 'agent-pregrade' }, REPORT).promote).toEqual([])
    const g = { grader: 'owner', grades: { 'malaria-plasmodium#k2': { grade: 'bad' } } }
    expect(promotableCards([cards[2]], g, REPORT).refused).toEqual([{ cardId: 'malaria-plasmodium#k2', why: 'graded bad' }])
    expect(promotableCards([cards[2]], { grader: 'owner', grades: {} }, REPORT).refused).toEqual([
      { cardId: 'malaria-plasmodium#k2', why: 'ungraded' },
    ])
  })

  it('admit.mjs routes --promote through promotableCards, the report and the acks', () => {
    expect(ADMIT_SRC).toMatch(/promotableCards\([^;\n]{0,80}\{ contradictions \}, ACKS\)/)
    expect(ADMIT_SRC).toMatch(/const ACKS = readJson\(join\(WIP_DIR, 'contradiction-acks\.json'\)/)
  })
})

describe('assignCardIds: assigned once, never derived from the text', () => {
  const existing: Card[] = [
    { cardId: 'leaf#k1', anchorId: 'S::leaf', masks: answer('囊胚腔') },
    { cardId: 'leaf#k2', anchorId: 'S::leaf', masks: answer('羊膜腔') },
  ]
  const item = (a: string, bulletHash: string) => ({ anchorId: 'S::leaf', leafId: 'leaf', bulletHash, answer: a })

  it('a reworded bullet (new hash) reuses the existing card with the same anchor and answer', () => {
    const slugs: Record<string, string> = { 'S::leaf|old1|囊胚腔': 'k1' }
    expect(assignCardIds([item('囊胚腔', 'NEW1')], slugs, existing)).toEqual(['leaf#k1'])
    expect(slugs['S::leaf|NEW1|囊胚腔']).toBe('k1')
  })

  it('the same leafId in another subject shares the id namespace (cardIds are corpus-unique)', () => {
    // neurons: e.g. membrane-transport-mechanisms is a leaf of both 生理學 and 生物化學.
    const slugs: Record<string, string> = {}
    const a = assignCardIds([{ anchorId: '生理學::mtm', leafId: 'mtm', bulletHash: 'h1', answer: 'Na⁺/K⁺-ATPase' }], slugs, [])
    const b = assignCardIds([{ anchorId: '生物化學::mtm', leafId: 'mtm', bulletHash: 'h2', answer: 'GLUT4' }], slugs, [])
    expect(a).toEqual(['mtm#k1'])
    expect(b).toEqual(['mtm#k2'])
    // …and an existing card in the other subject's file counts too.
    const c = assignCardIds([{ anchorId: '生理學::mtm', leafId: 'mtm', bulletHash: 'h3', answer: 'SGLT1' }], {}, [
      { cardId: 'mtm#k7', anchorId: '生物化學::mtm', masks: answer('GLUT4') },
    ])
    expect(c).toEqual(['mtm#k8'])
  })

  it('a new answer mints past every id the anchor has, in slugs AND in _cloze/', () => {
    expect(assignCardIds([item('絨毛膜腔', 'h9')], {}, existing)).toEqual(['leaf#k3'])
  })

  it('an unchanged card keeps its slug id, and a reworded twin cannot steal it', () => {
    const slugs: Record<string, string> = { 'S::leaf|same|羊膜腔': 'k2' }
    const out = assignCardIds([item('羊膜腔', 'REWORD'), item('羊膜腔', 'same')], slugs, existing)
    expect(out[1]).toBe('leaf#k2')
    expect(out[0]).not.toBe('leaf#k2')
    expect(new Set(out).size).toBe(2)
  })
})

describe('capAndAssign: the ceiling caps NEW cards only; re-admission after tier drift keeps tierAtAdmission', () => {
  const MAX: Record<string, number> = { 常青必掃: 5, 近年新寵: 4, 穩定考點: 4, 經典但降溫: 4, 'low-yield': 3 }
  const maxFor = (t: string) => {
    if (!(t in MAX)) throw new Error(`unmapped ${t}`)
    return MAX[t]
  }
  const five = ['A', 'B', 'C', 'D', 'E']
  const existing: Card[] = five.map((a, i) => ({
    cardId: `leaf#k${i + 1}`,
    anchorId: 'S::leaf',
    masks: answer(`答${a}`),
    tierAtAdmission: '常青必掃',
  }))
  const slugsFor = () => Object.fromEntries(five.map((a, i) => [`S::leaf|h${a}|答${a}`, `k${i + 1}`]))
  const it_ = (a: string, score = 3, bulletIndex = 0) => ({
    anchorId: 'S::leaf',
    leafId: 'leaf',
    bulletHash: `h${a}`,
    answer: `答${a}`,
    signalScore: score,
    bulletIndex,
  })

  it('spec scenario: 5 cards admitted at 常青必掃, tier now 穩定考點 → all 5 kept at 常青必掃, no new card', () => {
    const items = [...five.map((a) => it_(a)), it_('NEW', 99)]
    const r = capAndAssign(items, slugsFor(), existing, () => '穩定考點', maxFor)
    expect(r.ids).toEqual(existing.map((c) => c.cardId))
    expect(r.tierAtAdmission).toEqual(Array(5).fill('常青必掃'))
    expect(r.capped).toEqual([5]) // the new card, even with the highest signal
  })

  it('an existing card that does not re-emerge still occupies its slot', () => {
    const items = [it_('A'), it_('NEW1', 9), it_('NEW2', 8)]
    const r = capAndAssign(items, slugsFor(), existing, () => '穩定考點', maxFor)
    expect(r.ids).toEqual(['leaf#k1'])
    expect(r.capped).toEqual([1, 2])
  })

  it('new cards get the CURRENT tier and fill the free slots best-signal first', () => {
    const two = existing.slice(0, 2)
    const slugs = { 'S::leaf|hA|答A': 'k1', 'S::leaf|hB|答B': 'k2' }
    const items = [it_('A'), it_('low', 1, 5), it_('high', 7, 9), it_('mid', 4, 1)]
    const r = capAndAssign(items, slugs, two, () => 'low-yield', maxFor) // ceiling 3, 2 existing → 1 slot
    expect(r.kept).toEqual([0, 2])
    expect(r.ids).toEqual(['leaf#k1', 'leaf#k3'])
    expect(r.tierAtAdmission).toEqual(['常青必掃', 'low-yield'])
    expect(r.capped).toEqual([1, 3])
  })

  it('does not mint slugs for capped cards', () => {
    const slugs: Record<string, string> = {}
    const r = capAndAssign([it_('x', 5), it_('y', 4), it_('z', 3), it_('w', 2)], slugs, [], () => 'low-yield', maxFor)
    expect(r.ids).toEqual(['leaf#k1', 'leaf#k2', 'leaf#k3'])
    expect(Object.keys(slugs)).toHaveLength(3)
    expect(slugs['S::leaf|hw|答w']).toBeUndefined()
  })

  it('admit.mjs caps through capAndAssign and records its tierAtAdmission', () => {
    expect(ADMIT_SRC).toMatch(/capAndAssign\(\s*items,\s*slugs,\s*existing,/)
    expect(ADMIT_SRC).toMatch(/x\.card\.tierAtAdmission = cap\.tierAtAdmission\[k\]/)
  })
})

describe('mergePromoted: --promote never drops an existing card silently', () => {
  const c = (cardId: string, v = 1) => ({ cardId, v })
  it('replaces by cardId in place, appends new cards, keeps and reports the rest', () => {
    const r = mergePromoted([c('a#k1'), c('a#k2'), c('a#k3')], [c('a#k2', 2), c('a#k4')])
    expect(r.cards).toEqual([c('a#k1'), c('a#k2', 2), c('a#k3'), c('a#k4')])
    expect(r.kept).toEqual(['a#k1', 'a#k3'])
    expect(r.replaced).toEqual(['a#k2'])
    expect(r.added).toEqual(['a#k4'])
  })

  it('admit.mjs --promote writes the merge as {version: 1, cards}, not the bare promote list', () => {
    expect(ADMIT_SRC).toMatch(/mergePromoted\(existingCards\(subjectId\), cards\)/)
    expect(ADMIT_SRC).toMatch(/writeFileSync\(path, JSON\.stringify\(\{ version: 1, cards: merged\.cards \}/)
    expect(ADMIT_SRC).not.toMatch(/function slugFor/)
  })
})

describe('maskFace / pilotRates', () => {
  it('masks answer and gloss', () => {
    expect(
      maskFace('首選血漿置換術（PLEX）治療', [
        { start: 2, end: 7, role: 'answer' },
        { start: 8, end: 12, role: 'gloss' },
      ]),
    ).toBe('首選【＿＿＿】（【…】）治療')
  })
  it('masks a hint as 【…】 too', () => {
    expect(
      maskFace('病灶多位於右葉，並非左葉。', [
        { start: 5, end: 7, role: 'answer' },
        { start: 8, end: 12, role: 'hint' },
      ]),
    ).toBe('病灶多位於【＿＿＿】，【…】。')
  })
  it('counts a medicalError flag once, as bad, and fails the pilot on any', () => {
    const r = pilotRates({ a: { grade: 'good' }, b: { grade: 'good' }, c: { grade: 'bad', medicalError: true } })
    expect(r).toMatchObject({ n: 3, good: 2, bad: 1, medicalError: 1, passes: false })
    const ok = pilotRates(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`c${i}`, { grade: i < 7 ? 'good' : 'ordinary' }])))
    expect(ok.passes).toBe(true)
  })
})

describe('pick-v4 hide → hint masks (design D7)', () => {
  const S = '好發部位為迴盲部，迴盲部病灶易出血，並非乙狀結腸。104'

  it('locates the answer and each hide phrase; a hidden second occurrence of the answer is allowed', () => {
    const r = resolveHides(S, '迴盲部', ['迴盲部病灶', '並非乙狀結腸'])
    expect(r.error).toBeUndefined()
    expect(r.at).toBe(5)
    expect(r.hides).toEqual([
      { text: '迴盲部病灶', start: 9, end: 14 },
      { text: '並非乙狀結腸', start: 18, end: 24 },
    ])
  })

  it('no hide: the span must occur exactly once', () => {
    expect(resolveHides(S, '迴盲部').error).toMatch(/2× .*outside the hide phrases/)
    expect(resolveHides(S, '易出血').at).toBe(14)
    expect(resolveHides(S, '闌尾').error).toMatch(/not verbatim/)
  })

  it('rejects a hide phrase that repeats, is paraphrased, is too long, or one too many', () => {
    expect(resolveHides(S, '易出血', ['迴盲部']).error).toMatch(/occurs 2×/)
    expect(resolveHides(S, '易出血', ['並非直腸']).error).toMatch(/occurs 0×/)
    expect(resolveHides('甲'.repeat(30) + '乙', '乙', ['甲'.repeat(21)]).error).toMatch(/longer than 20/)
    expect(resolveHides(S, '易出血', ['好發', '部位', '為迴', '並非']).error).toMatch(/4 phrases/)
  })

  it('a hide phrase may not overlap the answer', () => {
    expect(resolveHides(S, '易出血', ['病灶易']).error).toMatch(/overlaps a hide phrase/)
  })

  it('admit.mjs turns hide phrases into hint masks, drops only a phrase inside the auto gloss, and drops the card on any other failure', () => {
    expect(ADMIT_SRC).toMatch(/resolveHides\(bt, p\.span, p\.hide \?\? \[\]\)/)
    expect(ADMIT_SRC).toMatch(/addMask\(h\.start, h\.end, 'hint'\)/)
    expect(ADMIT_SRC).toMatch(/g\.start - 1 <= h\.start && h\.end <= g\.end \+ 1/)
    expect(ADMIT_SRC).toMatch(/stage: 'pick', why: 'hide phrase: no 0–12 char context/)
    expect(ADMIT_SRC).toMatch(/hint: x\.card\.masks\.filter\(\(m\) => m\.role === 'hint'\)/)
  })
})
