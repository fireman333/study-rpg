// The handout cloze-card gate (add-neurons-handout-cloze-corpus D3, task 2.5).
//
// ⚠️ WHAT THIS FILE CAN AND CANNOT PROVE. It proves each check's verdict on cards handed to it — one
// synthetic REJECTION and one synthetic ACCEPTANCE per reason code, the rejection asserted to carry
// exactly its own reason, so a mutation that disables one check turns exactly one case red. It does
// NOT prove the gate is wired into the build (that is `handout-cloze-build-wiring.test.ts` plus the
// real failing-source run of task 3.4), and it proves nothing about medical correctness.
import { describe, expect, it } from 'vitest'
import { CONCEPT_TIERS } from '../../../../packages/content-neurons-tw/src/concept-tiers'
import {
  CLOZE_MAX_CARDS_BY_TIER,
  CLOZE_MAX_MASK_RATIO,
  CLOZE_REASONS,
  formatClozeCounts,
  isNegatedStem,
  isPolarityOnlyPhrase,
  maxCardsForTier,
  renderClozeReport,
  shippedCardIntegrityErrors,
  trailingGloss,
  validateClozeCorpus,
  withFileLevelErrors,
  type ClozeGateInput,
  type ClozeGateResult,
  type ClozeQuestion,
  type ClozeReason,
} from '../../../../packages/content-neurons-tw/src/handout/cloze-gate'
import { djb2Hex, extractTopics, type TopicPlainText } from '../../../../packages/content-neurons-tw/src/handout/topic-plain-text'

// ─── fixture ─────────────────────────────────────────────────────────────────

const SUBJECT = '測試科'
const FIXTURE = `
<section class="hdt-region" id="hdt-x">
  <h2 class="hdt-region__head">區</h2>
  <div class="hdt-topic" data-leaf-ids="leaf-a leaf-a2">
    <h3>甲考點</h3>
    <p class="hdt-teach">段落文字獨有的一句話。</p>
    <ul class="hdt-must">
      <li><b>治療首選</b>：首選血漿置換術（Plasma Exchange, PLEX）治療，可快速移除血液循環中的致病性自體抗體，並在數日內改善多數病人的神經症狀。<cite>112</cite></li>
      <li>盛行率約 8%~10% 之間。<cite>110</cite></li>
      <li>首選 Amoxicillin 治療，Amoxicillin 無效則換藥，再依培養結果與藥物敏感性試驗調整後續抗生素療程。<cite>111</cite></li>
      <li>乳酸顯著堆積（如大於 25 mmol/L）需處理。<cite>109</cite></li>
      <li>肌酸酐由 1.2 升至 3.4 mg/dL 表示惡化。<cite>108</cite></li>
      <li>目前不建議常規使用碳酸氫鈉治療。<span class="hdt-intl">（⚠️ 國際教科書：另有說法）</span><cite>113</cite></li>
      <li>腎前性指標為尿鈉排出分率小於百分之一，不建議單獨使用。<cite>107</cite></li>
      <li>重複片語甲出現於此段較長的說明文字之中。<cite>106</cite></li>
      <li>另一句也有重複片語甲。<cite>105</cite></li>
      <li>最常見致病菌為肺炎鏈球菌。<cite>115</cite></li>
      <li>第 14 對構造。<cite>114</cite></li>
      <li>編號 113 的考點。<cite>113</cite></li>
      <li>成蟲體型 A &lt; B 排序。<cite>107</cite></li>
      <li>阿米巴肝膿瘍的病灶多位於右葉，並非左葉，常以單一較大膿瘍表現。<cite>104</cite></li>
      <li>好發部位為迴盲部，迴盲部病灶易出血。<cite>103</cite></li>
    </ul>
    <table class="hdt-tbl"><tr><td>表格內容獨有</td></tr></table>
  </div>
  <div class="hdt-topic" data-leaf-ids="leaf-b">
    <h3>乙考點</h3>
    <ul class="hdt-must">
      <li>第一句提到胰島素。<cite>110</cite></li>
      <li>第二句提到副甲狀腺素與鈣離子調節。<cite>110</cite></li>
      <li>第三句提到降鈣素。<cite>110</cite></li>
      <li>第四句提到維生素丁。<cite>110</cite></li>
    </ul>
  </div>
  <div class="hdt-topic">
    <h3>未標考點</h3>
    <ul class="hdt-must"><li>未標主題句子。<cite>110</cite></li></ul>
  </div>
</section>`

const A = `${SUBJECT}::leaf-a`
const B = `${SUBJECT}::leaf-b`
const topicsOf = (html: string): TopicPlainText[] => extractTopics(html, SUBJECT)
const TOPICS = topicsOf(FIXTURE)

const RECURRENCE = new Map([
  [`${SUBJECT}::leaf-a`, '常青必掃'],
  [`${SUBJECT}::leaf-a2`, '穩定考點'],
  [`${SUBJECT}::leaf-b`, 'low-yield'],
])

const QUESTIONS = new Map<string, ClozeQuestion>([
  // positive stem; the answer text is in the keyed option (B) → fine
  ['q-pos-keyed', { stem: '下列何者正確？', options: { A: '葡萄球菌', B: '肺炎鏈球菌為最常見' }, answer: 'B' }],
  // positive stem; the answer text is only in a NON-keyed option → false-option-only
  ['q-pos-other', { stem: '下列何者正確？', options: { A: '肺炎鏈球菌最少見', B: '綠膿桿菌' }, answer: 'B' }],
  // negated stem; the answer text is only in the KEYED (false) option → false-option-only
  ['q-neg-keyed', { stem: '下列敘述何者錯誤？', options: { A: '肺炎鏈球菌極少見', B: '綠膿桿菌' }, answer: 'A' }],
  // negated stem; the answer text is in a non-keyed (true) option → fine
  ['q-neg-other', { stem: '下列敘述何者錯誤？', options: { A: '綠膿桿菌最常見', B: '肺炎鏈球菌' }, answer: 'A' }],
  // acceptedAnswers widen the keyed set
  ['q-accepted', { stem: '下列何者正確？', options: { A: '肺炎鏈球菌最常見', B: '綠膿桿菌' }, answer: 'B', acceptedAnswers: ['A', 'B'] }],
])

interface CardOpts {
  cardId?: string
  anchorId?: string
  masks?: unknown
  linkedQuestionIds?: string[]
  tierAtAdmission?: string
  [k: string]: unknown
}
let seq = 0
function card(exact: string, o: CardOpts = {}): Record<string, unknown> {
  seq += 1
  const anchorId = o.anchorId ?? A
  const rest = Object.fromEntries(
    Object.entries(o).filter(([k]) => !['cardId', 'anchorId', 'masks', 'linkedQuestionIds', 'tierAtAdmission'].includes(k)),
  )
  return {
    cardId: o.cardId ?? `${anchorId.split('::')[1]}#k${seq}`,
    anchorId,
    masks: o.masks ?? [{ exact, prefix: '', suffix: '', role: 'answer' }],
    marks: [],
    linkedQuestionIds: o.linkedQuestionIds ?? [],
    kind: 'claim',
    signalScore: 1,
    signalVersion: 'test-1',
    tierAtAdmission: o.tierAtAdmission ?? (anchorId === B ? 'low-yield' : '常青必掃'),
    ...rest,
  }
}
const mask = (exact: string, role: 'answer' | 'gloss' | 'hint' = 'answer', prefix = '', suffix = '') => ({ exact, prefix, suffix, role })
const hint = (exact: string, prefix = '', suffix = '') => mask(exact, 'hint', prefix, suffix)

function run(cards: unknown, over: Partial<ClozeGateInput> = {}, topics: TopicPlainText[] = TOPICS): ClozeGateResult {
  return validateClozeCorpus({
    files: [{ file: 'fixture.json', source: { version: 1, cards }, topics }],
    recurrence: RECURRENCE,
    questions: QUESTIONS,
    ...over,
  })
}
const reasons = (r: ClozeGateResult) => [...new Set(r.errors.map((e) => e.reason))].sort()

// ─── one rejection + one acceptance per reason ──────────────────────────────

const CASES: Record<ClozeReason, { reject: () => ClozeGateResult; accept: () => ClozeGateResult }> = {
  schema: {
    // two answer masks, and a prefix over 12 characters
    reject: () => run([card('肺炎鏈球菌', { masks: [mask('肺炎鏈球菌'), mask('致病菌', 'answer', '最常見致病菌為肺炎鏈球菌前面太長')] })]),
    accept: () => run([card('肺炎鏈球菌')]),
  },
  'unknown-anchor': {
    reject: () => run([card('肺炎鏈球菌', { anchorId: `${SUBJECT}::leaf-z` })]),
    accept: () => run([card('肺炎鏈球菌', { anchorId: A })]),
  },
  'duplicate-id': {
    reject: () =>
      validateClozeCorpus({
        files: [
          { file: 'two.json', source: { version: 1, cards: [card('胰島素', { anchorId: B, cardId: 'leaf-b#same' })] }, topics: TOPICS },
          { file: 'three.json', source: { version: 1, cards: [card('降鈣素', { anchorId: B, cardId: 'leaf-b#same' })] }, topics: TOPICS },
        ],
        recurrence: RECURRENCE,
        questions: QUESTIONS,
      }),
    accept: () => run([card('肺炎鏈球菌', { cardId: 'leaf-a#one' }), card('致病菌', { cardId: 'leaf-a#two' })]),
  },
  unresolved: {
    reject: () => run([card('肺炎球菌')]), // paraphrase
    accept: () => run([card('肺炎鏈球菌')]),
  },
  ambiguous: {
    reject: () => run([card('重複片語甲')]),
    accept: () => run([card('重複片語甲', { masks: [mask('重複片語甲', 'answer', '', '出現')] })]),
  },
  'cross-bullet': {
    // two masks in different bullets
    reject: () => run([card('肺炎鏈球菌', { masks: [mask('肺炎鏈球菌'), mask('尿鈉排出分率', 'gloss')] })]),
    accept: () => run([card('尿鈉排出分率', { masks: [mask('尿鈉排出分率'), hint('腎前性')] })]),
  },
  'not-in-bullet': {
    reject: () => run([card('表格內容獨有')]),
    accept: () => run([card('尿鈉排出分率')]),
  },
  length: {
    reject: () => run([card('可快速移除血液循環中的致病性自體抗體，並在')]), // 21 characters
    accept: () => run([card('鈉排出分率')]),
  },
  'mask-overlap': {
    // a hint overlapping the answer (spec scenario "Overlapping masks")
    reject: () => run([card('右葉', { masks: [mask('右葉'), hint('右葉，並非')] })]),
    accept: () => run([card('右葉', { masks: [mask('右葉'), hint('並非左葉')] })]),
  },
  'polarity-only': {
    reject: () => run([card('不建議', { masks: [mask('不建議', 'answer', '，')] })]),
    accept: () => run([card('尿鈉排出分率')]),
  },
  'sub-heading': {
    reject: () => run([card('治療首選')]),
    accept: () => run([card('血漿置換術', { masks: [mask('血漿置換術'), mask('Plasma Exchange, PLEX', 'gloss')] })]),
  },
  'answer-leak': {
    reject: () => run([card('Amoxicillin', { masks: [mask('Amoxicillin', 'answer', '', ' 治療')] })]),
    accept: () => run([card('Amoxicillin', { masks: [mask('Amoxicillin', 'answer', '', ' 治療'), hint('Amoxicillin', '', ' 無效')] })]),
  },
  'cite-overlap': {
    // the suffix `。1` reaches into <cite>115</cite>
    reject: () => run([card('肺炎鏈球菌', { masks: [mask('肺炎鏈球菌', 'answer', '', '。1')] })]),
    accept: () => run([card('肺炎鏈球菌', { masks: [mask('肺炎鏈球菌', 'answer', '', '。')] })]),
  },
  'partial-range': {
    reject: () => run([card('8%')]),
    accept: () => run([card('8%~10%')]),
  },
  'gloss-leak': {
    reject: () => run([card('血漿置換術')]),
    accept: () => run([card('血漿置換術', { masks: [mask('血漿置換術'), mask('Plasma Exchange, PLEX', 'gloss')] })]),
  },
  'example-value': {
    reject: () => run([card('3.4 mg/dL')]),
    accept: () => run([card('需處理')]),
  },
  'excluded-source': {
    reject: () => run([card('碳酸氫鈉')]),
    accept: () => run([card('肺炎鏈球菌')]),
  },
  'false-option-only': {
    reject: () => run([card('肺炎鏈球菌', { linkedQuestionIds: ['q-pos-other'] })]),
    accept: () => run([card('肺炎鏈球菌', { linkedQuestionIds: ['q-pos-keyed', 'q-neg-other', 'q-accepted'] })]),
  },
  'over-masked': {
    // 降鈣素 alone is 3/9 of the bullet; hiding 第三句 too makes it 6/9 > 40%
    reject: () => run([card('降鈣素', { anchorId: B, masks: [mask('降鈣素'), hint('第三句')] })]),
    accept: () => run([card('降鈣素', { anchorId: B })]),
  },
  'over-cap': {
    // low-yield → 3; four cards on one topic
    reject: () => run(['胰島素', '副甲狀腺素', '降鈣素', '維生素丁'].map((x) => card(x, { anchorId: B }))),
    accept: () => run(['副甲狀腺素', '降鈣素', '維生素丁'].map((x) => card(x, { anchorId: B }))),
  },
  'unmapped-tier': {
    // the topic's SECOND leaf has no recurrence entry for this subject
    reject: () => run([card('肺炎鏈球菌')], { recurrence: new Map([[`${SUBJECT}::leaf-a`, '常青必掃'], [`其他科::leaf-a2`, '穩定考點']]) }),
    accept: () => run([card('肺炎鏈球菌')]),
  },
}

const exercised = { reject: new Set<string>(), accept: new Set<string>() }

describe('validateClozeCorpus: one rejection and one acceptance per reason', () => {
  it.each(CLOZE_REASONS.map((r) => [r]))('%s', (reason) => {
    const rej = CASES[reason].reject()
    // Exactly its own reason — disabling THIS check turns this case (and only this case) red.
    expect(reasons(rej), `${reason}: reject`).toEqual([reason])
    expect(rej.counts.rejected).toBeGreaterThan(0)
    exercised.reject.add(reason)
    const acc = CASES[reason].accept()
    expect(acc.errors, `${reason}: accept`).toEqual([])
    expect(acc.counts.imported).toBe(acc.counts.total)
    exercised.accept.add(reason)
  })
})

// ─── spec scenarios ─────────────────────────────────────────────────────────

describe('spec scenarios', () => {
  it('file shape: not an object, wrong version, cards not an array → schema', () => {
    for (const source of [[card('肺炎鏈球菌')], { version: 2, cards: [] }, { version: 1, cards: {} }, null]) {
      const r = validateClozeCorpus({ files: [{ file: 'f.json', source, topics: TOPICS }], recurrence: RECURRENCE, questions: QUESTIONS })
      expect(reasons(r), JSON.stringify(source)).toEqual(['schema'])
      expect(r.counts.rejected).toBe(1)
    }
  })

  it('card shape: missing tierAtAdmission, a role outside answer/gloss/hint, a >12-char suffix → schema', () => {
    const noTier = card('肺炎鏈球菌')
    delete noTier.tierAtAdmission
    expect(reasons(run([noTier]))).toEqual(['schema'])
    expect(reasons(run([card('肺炎鏈球菌', { masks: [mask('肺炎鏈球菌'), { exact: '致病菌', prefix: '', suffix: '', role: 'note' }] })]))).toEqual([
      'schema',
    ])
    expect(reasons(run([card('肺炎鏈球菌', { masks: [mask('肺炎鏈球菌', 'answer', '', '。這段後文超過十二個字元長度')] })]))).toEqual(['schema'])
    expect(reasons(run([card('肺炎鏈球菌', { masks: [mask('致病菌', 'gloss')] })]))).toEqual(['schema']) // zero answers
  })

  it('an anchor on a topic\'s non-first leaf, or on an untagged topic, is unknown-anchor', () => {
    expect(reasons(run([card('肺炎鏈球菌', { anchorId: `${SUBJECT}::leaf-a2` })]))).toEqual(['unknown-anchor'])
    // The untagged topic's sentence exists, but no anchorId can name that topic.
    expect(reasons(run([card('未標主題句子', { anchorId: `${SUBJECT}::leaf-a` })]))).toEqual(['unresolved'])
    expect(TOPICS[2].anchorId).toBeNull()
  })

  it('a mask in a teaching paragraph or heading is not-in-bullet', () => {
    expect(reasons(run([card('段落文字獨有')]))).toEqual(['not-in-bullet'])
    expect(reasons(run([card('甲考點')]))).toEqual(['not-in-bullet'])
  })

  it('duplicate-id names both files', () => {
    const e = CASES['duplicate-id'].reject().errors.find((x) => x.reason === 'duplicate-id')!
    expect(e.message).toContain('two.json')
    expect(e.message).toContain('three.json')
  })

  it('an answer of only 不 fails with polarity-only (length fires too)', () => {
    const r = run([card('不', { masks: [mask('不', 'answer', '，', '建議單獨')] })])
    expect(reasons(r)).toEqual(['length', 'polarity-only'])
  })

  it('an &lt; entity decodes to < and a mask on the decoded text resolves', () => {
    expect(run([card('A < B')]).errors).toEqual([])
    expect(reasons(run([card('A &lt; B')]))).toEqual(['unresolved'])
  })

  it('answer-leak ignores cite text, but rejects an answer equal to a cite year token', () => {
    // `14` also occurs inside the cite `114` — cite text is not visible text, so it is not a leak.
    expect(run([card('14', { masks: [mask('14', 'answer', '第 ')] })]).errors).toEqual([])
    // `113` equals the bullet's cite year: the learner would read it straight off the superscript.
    const r = run([card('113', { masks: [mask('113', 'answer', '編號 ')] })])
    expect(reasons(r)).toEqual(['answer-leak'])
    expect(r.errors[0].message).toContain('<cite> year token')
  })

  it('a negated stem with the answer only in its keyed option is rejected', () => {
    expect(reasons(run([card('肺炎鏈球菌', { linkedQuestionIds: ['q-neg-keyed'] })]))).toEqual(['false-option-only'])
  })

  it('recognises common negated stems, including OCR spaces', () => {
    for (const stem of ['下列何者最不適當？', '下列何者 較 不可能？', '下列何者並非其危險因子？', '何者錯誤？', '下列何者不包括：']) {
      expect(isNegatedStem(stem), stem).toBe(true)
    }
    for (const stem of ['下列何者是不孕症婦女最需要的檢查？', '何者非常常見？', '下列何者正確？']) {
      expect(isNegatedStem(stem), stem).toBe(false)
    }
  })

  it('fails closed: no question data rejects a card with linked questions', () => {
    expect(reasons(run([card('肺炎鏈球菌', { linkedQuestionIds: ['q-pos-keyed'] })], { questions: null }))).toEqual(['false-option-only'])
    expect(reasons(run([card('肺炎鏈球菌', { linkedQuestionIds: ['q-missing'] })]))).toEqual(['false-option-only'])
    expect(run([card('肺炎鏈球菌')], { questions: null }).errors).toEqual([])
  })

  it('a list enumerator after the answer is not a gloss', () => {
    const text = '最常見為綠膿桿菌；(2)其次為金黃色葡萄球菌'
    expect(trailingGloss(text, text.indexOf('；'))).toBeNull()
    const glossed = '血漿置換術（Plasma Exchange, PLEX）'
    expect(trailingGloss(glossed, glossed.indexOf('（'))).not.toBeNull()
  })

  it('a prefix reaching into the previous bullet is cross-bullet, even though exact is inside one', () => {
    const text = TOPICS[1].text
    const between = text.slice(TOPICS[1].bullets[0].end, TOPICS[1].bullets[1].start) // whitespace between the li
    const r = run([card('第二句', { anchorId: B, masks: [mask('第二句', 'answer', `110${between}`.slice(-12))] })])
    expect(reasons(r)).toContain('cross-bullet')
  })

  it('counts on success: rejected 0, imported == total, and printed so', () => {
    const r = run([card('肺炎鏈球菌'), card('鈉排出分率')])
    expect(r.counts).toMatchObject({ imported: 2, rejected: 0, total: 2 })
    expect(formatClozeCounts(r.counts)).toMatch(/imported: 2, rejected: 0, total: 2/)
  })

  it('counts rejections by reason on failure, and folds pre-gate file errors in', () => {
    const r = run([card('肺炎鏈球菌'), card('8%'), card('表格內容獨有')])
    expect(r.counts).toMatchObject({ imported: 1, rejected: 2, total: 3 })
    expect(r.counts.byReason).toEqual({ 'partial-range': 1, 'not-in-bullet': 1 })
    const c = withFileLevelErrors(run([]).counts, [{ reason: 'schema', file: 'bad.json', cardId: null, message: 'not valid JSON' }])
    expect(formatClozeCounts(c)).toContain('rejected: 1 (schema×1)')
  })
})

// ─── hint masks (design D7) ─────────────────────────────────────────────────

describe('hint masks hide phrases that give the answer away', () => {
  it('contrast hidden: 右葉 with a hint over 並非左葉 is neither answer-leak nor mask-overlap', () => {
    const r = run([card('右葉', { masks: [mask('右葉'), hint('並非左葉')] })])
    expect(r.errors).toEqual([])
    expect(r.cards[0].masks.map((m) => m.role)).toEqual(['answer', 'hint'])
  })

  it('answer repeated and hidden: the second occurrence under a hint is not answer-leak', () => {
    expect(reasons(run([card('迴盲部', { masks: [mask('迴盲部', 'answer', '為')] })]))).toEqual(['answer-leak'])
    expect(run([card('迴盲部', { masks: [mask('迴盲部', 'answer', '為'), hint('迴盲部', '', '病灶')] })]).errors).toEqual([])
  })

  it('answer-leak is unchanged: it already strips every mask, whatever its role', () => {
    // the same repeat left visible is still a leak; hiding it as a gloss or a hint both clear it
    expect(reasons(run([card('Amoxicillin', { masks: [mask('Amoxicillin', 'answer', '', ' 治療')] })]))).toEqual(['answer-leak'])
    expect(run([card('Amoxicillin', { masks: [mask('Amoxicillin', 'answer', '', ' 治療'), mask('Amoxicillin', 'gloss', '', ' 無效')] })]).errors).toEqual([])
  })

  it('a lone 非 (or only polarity words) as a hint is polarity-only', () => {
    expect(reasons(run([card('右葉', { masks: [mask('右葉'), hint('非')] })]))).toEqual(['polarity-only'])
    expect(reasons(run([card('右葉', { masks: [mask('右葉'), hint('，並非')] })]))).toEqual(['polarity-only'])
  })

  it('4 hints, or one hint of 21 characters, is schema', () => {
    const four = [mask('右葉'), hint('並非左葉'), hint('單一'), hint('膿瘍表現'), hint('阿米巴')]
    expect(reasons(run([card('右葉', { masks: four })]))).toEqual(['schema'])
    const long21 = '可快速移除血液循環中的致病性自體抗體，並在' // 21 characters
    expect(Array.from(long21)).toHaveLength(21)
    const masks = [mask('血漿置換術'), mask('Plasma Exchange, PLEX', 'gloss'), hint(long21)]
    expect(reasons(run([card('血漿置換術', { masks })]))).toEqual(['schema'])
    // 20 characters is within the schema limit (this card is over-masked instead — a separate check)
    expect(reasons(run([card('血漿置換術', { masks: [mask('血漿置換術'), mask('Plasma Exchange, PLEX', 'gloss'), hint(long21.slice(0, 20))] })]))).toEqual([
      'over-masked',
    ])
    // three hints are fine
    expect(run([card('右葉', { masks: four.slice(0, 4) })]).errors).toEqual([])
  })

  it('adding a hint changes no identity: cardId, bulletText and sentenceHash stay; the hint ships with its role', () => {
    const before = run([card('右葉', { cardId: 'leaf-a#keep' })]).cards[0]
    const after = run([card('右葉', { cardId: 'leaf-a#keep', masks: [mask('右葉'), hint('並非左葉')] })]).cards[0]
    expect(after.cardId).toBe(before.cardId)
    expect(after.bulletText).toBe(before.bulletText)
    expect(after.sentenceHash).toBe(before.sentenceHash)
    expect(after.masks.find((m) => m.role === 'hint')).toEqual({ exact: '並非左葉', prefix: '', suffix: '', role: 'hint' })
    expect(shippedCardIntegrityErrors([after])).toEqual([])
  })

  it('too much hidden: more than CLOZE_MAX_MASK_RATIO of the bullet without <cite> is over-masked; exactly 40% passes', () => {
    expect(CLOZE_MAX_MASK_RATIO).toBe(0.4)
    expect(reasons(CASES['over-masked'].reject())).toEqual(['over-masked'])
    // 第四句提到維生素丁。 = 10 characters; 維生素丁 = 4 → exactly 0.4, not over (cite 110 not counted)
    expect(run([card('維生素丁', { anchorId: B })]).errors).toEqual([])
  })

  it('overlapping masks of any role are mask-overlap, and nothing else is reported', () => {
    expect(reasons(run([card('右葉', { masks: [mask('右葉'), hint('右葉，並非')] })]))).toEqual(['mask-overlap'])
    expect(reasons(run([card('血漿置換術', { masks: [mask('血漿置換術'), mask('Plasma Exchange, PLEX', 'gloss'), hint('Plasma')] })]))).toEqual([
      'mask-overlap',
    ])
  })

  it('isPolarityOnlyPhrase: made up only of polarity words / connectives, punctuation ignored', () => {
    for (const p of ['非', '並非', '，並非', '不 且', '而非']) expect(isPolarityOnlyPhrase(p), p).toBe(true)
    for (const p of ['並非左葉', '非典型', 'CN X']) expect(isPolarityOnlyPhrase(p), p).toBe(false)
  })
})

// ─── tier ceiling ───────────────────────────────────────────────────────────

describe('per-topic ceiling by tier', () => {
  const FIVE_ON_A = () => [
    card('肺炎鏈球菌'),
    card('尿鈉排出分率'),
    card('需處理'),
    card('血漿置換術', { masks: [mask('血漿置換術'), mask('Plasma Exchange, PLEX', 'gloss')] }),
    card('8%~10%'),
  ]

  it('CLOZE_MAX_CARDS_BY_TIER keys are exactly the tiers tierOf can emit', () => {
    expect(Object.keys(CLOZE_MAX_CARDS_BY_TIER).sort()).toEqual([...CONCEPT_TIERS].sort())
    expect(CLOZE_MAX_CARDS_BY_TIER).toEqual({ 常青必掃: 5, 近年新寵: 4, 穩定考點: 4, 經典但降溫: 4, 'low-yield': 3 })
    expect(() => maxCardsForTier('新等級')).toThrow()
    expect(() => maxCardsForTier('toString')).toThrow()
  })

  it('a topic whose cards all record low-yield and has 4 cards is over-cap', () => {
    const r = run(['胰島素', '副甲狀腺素', '降鈣素', '維生素丁'].map((x) => card(x, { anchorId: B, tierAtAdmission: 'low-yield' })))
    expect(reasons(r)).toEqual(['over-cap'])
  })

  it('the topic tier is the HIGHEST of its leaves (常青必掃 via leaf-a allows 5)', () => {
    expect(run(FIVE_ON_A()).errors).toEqual([])
  })

  it('a tier drop after an ingest does not fail the build; the report lists the drift', () => {
    const dropped = new Map(RECURRENCE)
    dropped.set(`${SUBJECT}::leaf-a`, '穩定考點')
    const r = run(FIVE_ON_A(), { recurrence: dropped })
    expect(r.errors).toEqual([])
    expect(r.cards).toHaveLength(5)
    expect(r.report.tierDrift).toEqual([{ anchorId: A, admittedTier: '常青必掃', currentTier: '穩定考點', cards: 5 }])
    expect(r.report.tierAboveCurrent).toHaveLength(5)
    expect(renderClozeReport(r.report)).toContain('tier 漂移（1）')
  })

  it('an unmapped tierAtAdmission, or a leaf with no recurrence entry, is unmapped-tier (no fallback)', () => {
    expect(reasons(run([card('肺炎鏈球菌', { tierAtAdmission: '新等級' })]))).toEqual(['unmapped-tier'])
    expect(reasons(run([card('降鈣素', { anchorId: B })], { recurrence: new Map() }))).toEqual(['unmapped-tier'])
    expect(reasons(run([card('降鈣素', { anchorId: B })], { recurrence: new Map([[`${SUBJECT}::leaf-b`, '偶考']]) }))).toEqual(['unmapped-tier'])
  })

  it('tier lookup is keyed by (subjectId, leafId): another subject\'s entry for the same leafId does not count', () => {
    const other = new Map([[`其他科::leaf-b`, 'low-yield']])
    expect(reasons(run([card('降鈣素', { anchorId: B })], { recurrence: other }))).toEqual(['unmapped-tier'])
  })
})

// ─── the shipped card ───────────────────────────────────────────────────────

describe('the shipped card', () => {
  const bulletWith = (topics: TopicPlainText[], s: string) => topics.flatMap((t) => t.bullets).find((b) => b.text.includes(s))!

  it('carries the source fields minus claimLine, plus bulletText, citeRanges and sentenceHash', () => {
    const [c] = run([card('肺炎鏈球菌', { claimLine: 42 })]).cards
    expect(c).not.toHaveProperty('claimLine')
    expect(Object.keys(c).sort()).toEqual(
      [
        'anchorId', 'bulletText', 'cardId', 'citeRanges', 'kind', 'linkedQuestionIds', 'marks', 'masks',
        'sentenceHash', 'signalScore', 'signalVersion', 'tierAtAdmission',
      ].sort(),
    )
    expect(c.bulletText).toBe('最常見致病菌為肺炎鏈球菌。115')
    expect(c.citeRanges).toEqual([{ start: 13, end: 16 }])
    expect(c.sentenceHash).toBe(djb2Hex('最常見致病菌為肺炎鏈球菌。'))
    expect(shippedCardIntegrityErrors([c])).toEqual([])
    expect(bulletWith(TOPICS, '肺炎鏈球菌').text).toBe(c.bulletText)
  })

  it('a new sitting year on the carded bullet keeps sentenceHash and changes bulletText', () => {
    const before = run([card('肺炎鏈球菌', { cardId: 'leaf-a#keep' })]).cards[0]
    const after = run([card('肺炎鏈球菌', { cardId: 'leaf-a#keep' })], {}, topicsOf(FIXTURE.replace('<cite>115</cite>', '<cite>115/116</cite>')))
      .cards[0]
    expect(after.sentenceHash).toBe(before.sentenceHash)
    expect(after.bulletText).not.toBe(before.bulletText)
    expect(shippedCardIntegrityErrors([after])).toEqual([])
  })

  it('editing text outside the carded bullet keeps sentenceHash', () => {
    const cards = () => [card('肺炎鏈球菌', { cardId: 'leaf-a#keep' })]
    const before = run(cards()).cards[0]
    const edited = FIXTURE.replace('段落文字獨有的一句話。', '段落文字已經改寫。').replace('另一句也有重複片語甲。', '另一句改寫過。')
    expect(run(cards(), {}, topicsOf(edited)).cards[0].sentenceHash).toBe(before.sentenceHash)
  })

  it('rewording the anchored bullet changes sentenceHash but not cardId', () => {
    const before = run([card('降鈣素', { anchorId: B, cardId: 'leaf-b#keep' })]).cards[0]
    const after = run([card('降鈣素', { anchorId: B, cardId: 'leaf-b#keep' })], {}, topicsOf(FIXTURE.replace('第三句提到降鈣素。', '第三句改寫後提到降鈣素。')))
      .cards[0]
    expect(after.cardId).toBe(before.cardId)
    expect(after.sentenceHash).not.toBe(before.sentenceHash)
  })

  it('integrity: a bulletText that disagrees with sentenceHash, a mask not in bulletText, or no bulletText fails', () => {
    const [c] = run([card('肺炎鏈球菌')]).cards
    expect(shippedCardIntegrityErrors([{ ...c, bulletText: '改' + c.bulletText }])[0]).toMatch(/is not the hash of bulletText/)
    expect(shippedCardIntegrityErrors([{ ...c, masks: [{ ...c.masks[0], exact: '不存在的字' }] }])[0]).toMatch(/does not occur in bulletText/)
    const { bulletText: _gone, ...bad } = c
    expect(shippedCardIntegrityErrors([bad as typeof c])[0]).toMatch(/bulletText is missing/)
    expect(shippedCardIntegrityErrors([{ ...c, citeRanges: [{ start: 0, end: 999 }] }])[0]).toMatch(/citeRanges/)
  })

  it('writes nothing to `cards` for a rejected card', () => {
    expect(run([card('8%')]).cards).toEqual([])
  })
})

// ─── report ─────────────────────────────────────────────────────────────────

describe('report', () => {
  it('lists a same-subject <b> numeric contradiction (43% vs 45–50%) at both locations, without failing', () => {
    const html = FIXTURE.replace(
      '<li>第四句提到維生素丁。<cite>110</cite></li>',
      '<li>第四句提到維生素丁。<cite>110</cite></li>' +
        '<li>最主要的原發病因為<b>糖尿病腎病變</b>，約佔 43%。<cite>112</cite></li>' +
        '<li>另一處說糖尿病腎病變約佔 45–50%。<cite>113</cite></li>',
    )
    const r = run([card('肺炎鏈球菌')], {}, topicsOf(html))
    expect(r.errors).toEqual([])
    expect(r.report.heuristic).toBe(true)
    const found = r.report.contradictions.find((c) => c.subject === '糖尿病腎病變')!
    expect(found.locations.map((l) => l.value).sort()).toEqual(['43%', '45-50%'])
    expect(new Set(found.locations.map((l) => l.sentenceHash)).size).toBe(2)
    expect(renderClozeReport(r.report)).toContain('啟發式')
  })

  it('lists cross-topic duplicates: equal answers, similar sentences', () => {
    const html = FIXTURE.replace('<li>第四句提到維生素丁。<cite>110</cite></li>', '<li>最常見致病菌為肺炎鏈球菌喔。<cite>110</cite></li>')
    const r = run([card('肺炎鏈球菌', { cardId: 'leaf-a#x' }), card('肺炎鏈球菌', { anchorId: B, cardId: 'leaf-b#y' })], {}, topicsOf(html))
    expect(r.errors).toEqual([])
    expect(r.report.duplicates).toHaveLength(1)
    expect(r.report.duplicates[0].answer).toBe('肺炎鏈球菌')
  })
})

describe('coverage', () => {
  it('exercised a rejection and an acceptance for every reason code', () => {
    expect([...exercised.reject].sort()).toEqual([...CLOZE_REASONS].sort())
    expect([...exercised.accept].sort()).toEqual([...CLOZE_REASONS].sort())
  })
})
