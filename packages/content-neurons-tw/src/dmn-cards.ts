/**
 * DMN fate-card catalog — 22 entries with closed-cap collection semantics.
 *
 * Per `add-neurons-acceleration-system`: `streak-shield` removed (integrity);
 * two OE-anchored consumable kinds added (`surge` speed / `bolus` energy). All
 * effects deposit to the backpack on draw (manual-activate) — see
 * `neurons-acceleration-system`.
 *
 * Tier weights (DMN_RARITY_WEIGHTS) stay 2/10/30/58 (sum 100); per-tier card
 * counts are P1×2 / P2×5 / P3×7 / P4×8 = 22.
 *
 * Event-kind allocation (each kind ≥ 3 cards):
 *   family-buff        → 4   (base energy consumable; reframed from ×2 → +1.0 additive)
 *   variant-rate-up    → 4
 *   quick-review-batch → 4
 *   hidden-reveal      → 4
 *   surge              → 3   (NE/DA phasic gain → exploration speed; OE 10.1038/s41586-022-04782-2)
 *   bolus              → 3   (astrocyte-neuron lactate shuttle → maze energy; OE 10.1038/nrn.2018.19)
 *
 * Neuroscience anchors: card names + descriptions reference well-established
 * DMN / neuromodulator / metabolic concepts. Per project CLAUDE.md
 * "Neuroscience design verification" rule, design-level neuro facts SHALL be
 * PubMed-anchored (Buckner & DiNicola 2019; Raichle 2015; + the surge/bolus OE
 * anchors above).
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
    '整個 DMN（mPFC + PCC + precuneus + angular gyrus）大規模同步點火，收進背包後可讓某個 family 的能量水龍頭短暫倍增。',
    'P1',
    'family-buff',
  ),
  make(
    'dmn-stream-of-consciousness-p1',
    '意識洪流',
    '自發內生語言流經 mPFC 與顳極，收進背包後可讓下一個解鎖的 variant 稀有度躍升。',
    'P1',
    'variant-rate-up',
  ),

  // ─── P2 金 (5 entries) ────────────────────────────────────────────────────
  make(
    'dmn-hippocampal-ripples-p2',
    '海馬迴漣漪',
    'Sharp-wave ripples 在靜息態中重播當日記憶痕，啟用後拉出 ≤5 道錯題快速複習。',
    'P2',
    'quick-review-batch',
  ),
  make(
    'dmn-mpfc-reverberation-p2',
    '內側前額葉迴響',
    '自我參照網絡在 mPFC 持續迴盪，啟用後隨機選一個 family 在 1 小時內能量加倍。',
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
  make(
    'dmn-locus-coeruleus-burst-p2',
    '藍斑核爆發',
    '藍斑核（locus coeruleus）一陣 phasic 去甲腎上腺素爆發，gain modulation 讓資訊處理變快 — 啟用後探索速度短暫提升。',
    'P2',
    'surge',
  ),
  make(
    'dmn-lactate-shuttle-p2',
    '乳酸穿梭',
    '星形膠細胞把乳酸即時遞給高活動的神經元（astrocyte–neuron lactate shuttle）— 啟用後迷宮能量水龍頭短暫湧入。',
    'P2',
    'bolus',
  ),

  // ─── P3 銀 (7 entries) ────────────────────────────────────────────────────
  make(
    'dmn-angular-association-p3',
    '角迴聯想',
    'Angular gyrus 把語意網絡拉開一道縫隙，啟用後下一張未抽的 P1 顯出朦朧輪廓。',
    'P3',
    'hidden-reveal',
  ),
  make(
    'dmn-daydream-drift-p3',
    '白日夢遊蕩',
    'Mind-wandering 期間 DMN 偷偷瞄到了什麼，啟用後圖鑑中一張未抽的 P1 卡輕微透光。',
    'P3',
    'hidden-reveal',
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
    'BOLD signal 在靜息態網絡中泛起漣漪，啟用後某 family 享受 1 小時能量 buff。',
    'P3',
    'family-buff',
  ),
  make(
    'dmn-spontaneous-discharge-p3',
    '大腦自發放電',
    'Cortex 自發 burst firing 翻出記憶碎片，啟用後拉出 ≤5 道錯題快速複習。',
    'P3',
    'quick-review-batch',
  ),
  make(
    'dmn-dopamine-gain-p3',
    '多巴胺增益',
    '腹側被蓋區（VTA）一陣多巴胺激增調高神經增益（neural gain），target 處理又快又銳 — 啟用後探索速度提升。',
    'P3',
    'surge',
  ),
  make(
    'dmn-astrocyte-fuel-p3',
    '星形膠細胞供能',
    '麩胺酸再攝取驅動星形膠細胞糖解，按需把乳酸送上前線 — 啟用後迷宮能量湧入。',
    'P3',
    'bolus',
  ),

  // ─── P4 銅 (8 entries) ────────────────────────────────────────────────────
  make(
    'dmn-micro-mind-wander-p4',
    '微 mind-wander',
    '短暫的注意飄移觸發 DMN 局部活化，啟用後隨機 family 短暫獲得能量 buff。',
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
    'Posteromedial cortex 一次小規模脈動，啟用後拉出 ≤5 道錯題快速複習。',
    'P4',
    'quick-review-batch',
  ),
  make(
    'dmn-brief-swr-p4',
    '短陣 SWR',
    'Hippocampal sharp-wave ripple 短暫播放，啟用後拉出 ≤5 道錯題快速複習。',
    'P4',
    'quick-review-batch',
  ),
  make(
    'dmn-noradrenaline-spray-p4',
    '去甲腎上腺素微噴',
    '一小股去甲腎上腺素掠過皮層，訊噪比微升 — 啟用後探索速度小幅提升。',
    'P4',
    'surge',
  ),
  make(
    'dmn-glycogen-burst-p4',
    '糖原微爆',
    '星形膠細胞動員一點點糖原儲備供應急用 — 啟用後迷宮能量小幅湧入。',
    'P4',
    'bolus',
  ),
  make(
    'dmn-cue-glimmer-p4',
    '線索閃光',
    '一個線索閃過 angular gyrus — 啟用後圖鑑中某張未抽 P1 的剪影稍微清晰。',
    'P4',
    'hidden-reveal',
  ),
  make(
    'dmn-premonition-glow-p4',
    '預感微光',
    'DMN 預先模擬可能未來的一閃 — 啟用後透露下一張未抽 P1 的輪廓。',
    'P4',
    'hidden-reveal',
  ),
] as const
