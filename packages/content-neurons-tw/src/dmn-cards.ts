/**
 * DMN fate-card catalog — 20 entries with closed-cap collection semantics.
 *
 * Distribution per design Decision 5:
 * - P1 × 2 (composite 2% drop)
 * - P2 × 4 (10% drop)
 * - P3 × 6 (30% drop)
 * - P4 × 8 (58% drop)
 *
 * Event-kind allocation (each kind ≥ 3 cards per spec; we ship 4 each):
 *   family-buff       → P1×1 + P2×1 + P3×1 + P4×1 = 4
 *   variant-rate-up   → P1×1 + P2×1 + P3×1 + P4×1 = 4
 *   quick-review-batch → P2×1 + P3×1 + P4×2 = 4
 *   streak-shield     → P2×1 + P3×1 + P4×2 = 4
 *   hidden-reveal     → P3×2 + P4×2 = 4
 *
 * Neuroscience anchors: card names + descriptions reference well-established
 * DMN concepts (mPFC / PCC / angular gyrus / hippocampal sharp-wave ripples /
 * REM consolidation / spontaneous resting-state activity). Per project
 * CLAUDE.md "Neuroscience design verification" rule, design-level neuro facts
 * SHALL be PubMed-anchored; the concepts used here are foundational
 * neuroscience (Buckner & DiNicola 2019; Raichle 2015) and not contested.
 *
 * Capability spec: openspec/specs/neurons-dmn-fate-cards/spec.md
 */

import type { DmnCardDef } from './dmn-types'

const make = (
  cardId: string,
  displayName: string,
  description: string,
  rarity: DmnCardDef['rarity'],
  eventKind: DmnCardDef['eventKind'],
): DmnCardDef => ({
  cardId,
  displayName,
  description,
  rarity,
  eventKind,
  artworkId: `dmn:card:${cardId}`,
})

export const DMN_CARD_CATALOG: readonly DmnCardDef[] = [
  // ─── P1 鑽石 (2 entries) ──────────────────────────────────────────────────
  make(
    'dmn-default-mode-awakening-p1',
    '預設模式覺醒',
    '整個 DMN（mPFC + PCC + precuneus + angular gyrus）大規模同步點火，某個 family 的編碼能力短暫倍增。',
    'P1',
    'family-buff',
  ),
  make(
    'dmn-stream-of-consciousness-p1',
    '意識洪流',
    '自發內生語言流經 mPFC 與顳極，下一個解鎖的 variant 將獲得稀有度躍升。',
    'P1',
    'variant-rate-up',
  ),

  // ─── P2 金 (4 entries) ────────────────────────────────────────────────────
  make(
    'dmn-hippocampal-ripples-p2',
    '海馬迴漣漪',
    'Sharp-wave ripples 在靜息態中重播當日記憶痕，立即把 5 道 SRS due 題拉到眼前。',
    'P2',
    'quick-review-batch',
  ),
  make(
    'dmn-pcc-pulse-p2',
    '後扣帶皮層脈動',
    'PCC 維持 baseline 自發放電，下次斷 streak 時為你擋下一次。',
    'P2',
    'streak-shield',
  ),
  make(
    'dmn-mpfc-reverberation-p2',
    '內側前額葉迴響',
    '自我參照網絡在 mPFC 持續迴盪，隨機選一個 family 在 1 小時內 AP 加倍。',
    'P2',
    'family-buff',
  ),
  make(
    'dmn-rem-pruning-p2',
    'REM 突觸雕琢',
    '快速動眼睡眠期的突觸 pruning 讓下一張 variant 更可能是稀有質地。',
    'P2',
    'variant-rate-up',
  ),

  // ─── P3 銀 (6 entries) ────────────────────────────────────────────────────
  make(
    'dmn-angular-association-p3',
    '角迴聯想',
    'Angular gyrus 把語意網絡拉開一道縫隙，下一張未抽的 P1 顯出朦朧輪廓。',
    'P3',
    'hidden-reveal',
  ),
  make(
    'dmn-daydream-drift-p3',
    '白日夢遊蕩',
    'Mind-wandering 期間 DMN 偷偷瞄到了什麼，圖鑑中一張未抽的 P1 卡輕微透光。',
    'P3',
    'hidden-reveal',
  ),
  make(
    'dmn-temporal-pole-anchor-p3',
    '顳極記憶錨點',
    '顳極（temporal pole）穩住情境記憶，下次 streak 斷裂時保住連續性。',
    'P3',
    'streak-shield',
  ),
  make(
    'dmn-dln-switch-p3',
    '背外側網絡切換',
    'DMN 跟 dorsal attention network 之間的切換調節下一張 variant 的權重。',
    'P3',
    'variant-rate-up',
  ),
  make(
    'dmn-resting-state-ripple-p3',
    '靜息態 fMRI 蕩漾',
    'BOLD signal 在靜息態網絡中泛起漣漪，某 family 被選中享受 AP +1 buff。',
    'P3',
    'family-buff',
  ),
  make(
    'dmn-spontaneous-discharge-p3',
    '大腦自發放電',
    'Cortex 自發 burst firing 翻出記憶碎片，立刻拿 5 道 SRS due 題複習。',
    'P3',
    'quick-review-batch',
  ),

  // ─── P4 銅 (8 entries) ────────────────────────────────────────────────────
  make(
    'dmn-micro-mind-wander-p4',
    '微 mind-wander',
    '短暫的注意飄移觸發 DMN 局部活化，隨機 family 短暫獲得 AP buff。',
    'P4',
    'family-buff',
  ),
  make(
    'dmn-mini-self-reference-p4',
    '小型自我參照',
    '一個短暫的自我參照念頭點亮 mPFC，下次 variant 抽卡權重微調。',
    'P4',
    'variant-rate-up',
  ),
  make(
    'dmn-posteromedial-pulse-p4',
    '小幅後縱列脈衝',
    'Posteromedial cortex 一次小規模脈動把 5 道 SRS due 題推到面前。',
    'P4',
    'quick-review-batch',
  ),
  make(
    'dmn-brief-swr-p4',
    '短陣 SWR',
    'Hippocampal sharp-wave ripple 短暫播放，立刻拿 5 道 SRS due 題複習。',
    'P4',
    'quick-review-batch',
  ),
  make(
    'dmn-micro-context-guard-p4',
    '微脈絡保護',
    '微小的情境表徵硬撐 streak — 下次斷裂時擋一次。',
    'P4',
    'streak-shield',
  ),
  make(
    'dmn-small-circuit-immunity-p4',
    '小迴路免疫',
    '小範圍 DMN 子網絡保留昨日的活化，下次 streak 斷裂時為你扛住。',
    'P4',
    'streak-shield',
  ),
  make(
    'dmn-cue-glimmer-p4',
    '線索閃光',
    '一個線索閃過 angular gyrus — 圖鑑中某張未抽 P1 的剪影稍微清晰。',
    'P4',
    'hidden-reveal',
  ),
  make(
    'dmn-premonition-glow-p4',
    '預感微光',
    'DMN 預先模擬可能未來的一閃 — 透露下一張未抽 P1 的輪廓。',
    'P4',
    'hidden-reveal',
  ),
] as const
