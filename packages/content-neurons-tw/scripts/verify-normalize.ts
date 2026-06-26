/**
 * verify-normalize.ts — assertions for rejoinHardWrappedLines (the build-time
 * 詳解 hard-wrap rejoin). Run: `pnpm --filter @study-rpg/content-neurons-tw verify:normalize`.
 *
 * Two layers:
 *  1) Unit cases mirroring the neurons-corpus-ingestion spec scenarios.
 *  2) Content-safety invariant over EVERY real source explanation: stripping all
 *     whitespace from input == stripping all whitespace from output (proves the
 *     pass only edits whitespace + ASCII-boundary spaces, never content).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { rejoinHardWrappedLines } from './rejoin-hard-wraps'

let failed = 0
function check(name: string, got: string, want: string): void {
  if (got === want) {
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}\n    want: ${JSON.stringify(want)}\n    got:  ${JSON.stringify(got)}`)
  }
}

console.log('Unit cases:')
// Mid-word CJK wrap → fused, no char inserted
check(
  'mid-word CJK wrap rejoined',
  rejoinHardWrappedLines('活化GABA 提升濃度，增加合成、減少代謝酵素活性，並抑制回收\n成、減少代謝酵素活性'),
  '活化GABA 提升濃度，增加合成、減少代謝酵素活性，並抑制回收成、減少代謝酵素活性',
)
// CJK↔Latin boundary wrap → fused, no character inserted
check(
  'CJK↔Latin wrap joined with no space',
  rejoinHardWrappedLines('這個藥物主要透過抑制食慾達成減重的效果，可以聯想到AMPA\n受器的相關作用機制'),
  '這個藥物主要透過抑制食慾達成減重的效果，可以聯想到AMPA受器的相關作用機制',
)
// ASCII↔ASCII boundary → left broken (can't guess word-split vs word-boundary)
check(
  'ASCII↔ASCII boundary left broken',
  rejoinHardWrappedLines('the mechanism is mostly to suppress appetite via this drug topira\nmate receptor blah blah'),
  'the mechanism is mostly to suppress appetite via this drug topira\nmate receptor blah blah',
)
// Break kept after sentence-final punctuation
check(
  'break kept after sentence-final punct',
  rejoinHardWrappedLines('因此臨床上常會建議切除，與 RCC 難以區分，故需注意。\n下一段新的內容從這裡開始繼續講解說明'),
  '因此臨床上常會建議切除，與 RCC 難以區分，故需注意。\n下一段新的內容從這裡開始繼續講解說明',
)
// Break kept before a list marker
check(
  'break kept before list marker (1°)',
  rejoinHardWrappedLines('首先我們可以先了解腎嗜酸細胞瘤的整體特徵與背景知識如下所述\n1° Renal oncocytoma 是一種良性腫瘤'),
  '首先我們可以先了解腎嗜酸細胞瘤的整體特徵與背景知識如下所述\n1° Renal oncocytoma 是一種良性腫瘤',
)
// Break kept across a separator line
check(
  'break kept across ──── separator',
  rejoinHardWrappedLines('簡解：這題我用猜的，真正要解應該從藥物機制下手去推導出正確答案\n────────────────\n(A) topiramate'),
  '簡解：這題我用猜的，真正要解應該從藥物機制下手去推導出正確答案\n────────────────\n(A) topiramate',
)
// Short header line not fused into following prose
check(
  'short header not fused',
  rejoinHardWrappedLines('參考資料\n這是一段足夠長足以超過寬度門檻的內文敘述會被視為換行重接的對象'),
  '參考資料\n這是一段足夠長足以超過寬度門檻的內文敘述會被視為換行重接的對象',
)
// Single-char vertical run left intact (each line far below width threshold)
check('single-char vertical run preserved', rejoinHardWrappedLines('依\n栓\n塞'), '依\n栓\n塞')
// Bare single-digit line preserved (short → not fused)
check('bare single-digit preserved', rejoinHardWrappedLines('3\n4\n5'), '3\n4\n5')
// Blank line blocks fusion
check(
  'blank line blocks fusion',
  rejoinHardWrappedLines('這是一段足夠長的內文敘述用來測試空行是否阻擋了換行的重接動作發生\n\n下一段'),
  '這是一段足夠長的內文敘述用來測試空行是否阻擋了換行的重接動作發生\n\n下一段',
)

// ── Audit-derived guards (fix-neurons-explanation-linewrap step 3) ──
// Both lines all-Latin (table / figure-label / citation run) → NOT joined
check(
  'both-CJK-free lines not joined (Latin table/labels)',
  rejoinHardWrappedLines('Lung, skin, hemangiosarcoma; pulmonary fibrosis here\nByproduct of metal smelting and refining'),
  'Lung, skin, hemangiosarcoma; pulmonary fibrosis here\nByproduct of metal smelting and refining',
)
// Section label on next line → keep break
check(
  'break kept before section label 補充',
  rejoinHardWrappedLines('這是一段足夠長的內文敘述用來測試章節標題是否被誤接到前一行的情況\n補充：這裡是補充內容'),
  '這是一段足夠長的內文敘述用來測試章節標題是否被誤接到前一行的情況\n補充：這裡是補充內容',
)
check(
  'break kept before 詳解 label',
  rejoinHardWrappedLines('老趙2012 版12-40 頁的精美表格囉～足夠長足夠長足夠長足夠長\n詳解 : Corticospinal tract'),
  '老趙2012 版12-40 頁的精美表格囉～足夠長足夠長足夠長足夠長\n詳解 : Corticospinal tract',
)
// Angle-bullet list marker → keep break
check(
  'break kept before ＞ bullet list item',
  rejoinHardWrappedLines('可能導致副作用、危險及其處理方法以及各種需要說明的事項如下\n＞其他可能之治療方法及其說明'),
  '可能導致副作用、危險及其處理方法以及各種需要說明的事項如下\n＞其他可能之治療方法及其說明',
)
// URL at end of prev → keep break
check(
  'break kept after URL line',
  rejoinHardWrappedLines('參考來源整理於下方連結請點開閱讀更多內容說明 https://example.com/path/871.pdf\nFEMALE HORMONE PHYSIOLOGY 補充'),
  '參考來源整理於下方連結請點開閱讀更多內容說明 https://example.com/path/871.pdf\nFEMALE HORMONE PHYSIOLOGY 補充',
)
// Citation page token at end of prev → keep break (two citations not fused)
check(
  'break kept after citation page token p.29',
  rejoinHardWrappedLines('FIRST CHOICE 2018 第三冊藥理學足夠長足夠長足夠長足夠長 p.29\n國考藥訣 V1.7 國醫M116 p.3'),
  'FIRST CHOICE 2018 第三冊藥理學足夠長足夠長足夠長足夠長 p.29\n國考藥訣 V1.7 國醫M116 p.3',
)
// Ordered list "(1.)" → keep break
check(
  'break kept before (1.) ordered marker',
  rejoinHardWrappedLines('腎病症候群的診斷要件整理如下供大家複習參考使用足夠長足夠長\n(1.) 蛋白尿 proteinuria'),
  '腎病症候群的診斷要件整理如下供大家複習參考使用足夠長足夠長\n(1.) 蛋白尿 proteinuria',
)

console.log('\nContent-safety invariant over real source:')
const SRC = resolve(import.meta.dirname, '..', 'data', 'medexam-reconciled', 'questions.json')
const stripWS = (s: string): string => s.replace(/\s+/g, '')
type Q = { id: string; explanation?: string }
const qs: Q[] = JSON.parse(readFileSync(SRC, 'utf-8'))
let scanned = 0
let changed = 0
let violations = 0
for (const q of qs) {
  const before = q.explanation ?? ''
  if (!before) continue
  scanned++
  const after = rejoinHardWrappedLines(before)
  if (after !== before) changed++
  if (stripWS(before) !== stripWS(after)) {
    violations++
    if (violations <= 5) console.error(`  ✗ CONTENT ALTERED: ${q.id}`)
  }
}
console.log(`  scanned=${scanned}  changed=${changed}  content-violations=${violations}`)
if (violations > 0) {
  failed++
  console.error(`  ✗ ${violations} explanation(s) had content altered beyond whitespace — INVARIANT BROKEN`)
} else {
  console.log('  ✓ invariant holds: no explanation had any non-whitespace content changed')
}

if (failed > 0) {
  console.error(`\n✗ ${failed} check group(s) failed`)
  process.exit(1)
}
console.log('\n✓ all checks passed')
