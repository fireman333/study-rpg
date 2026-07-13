/**
 * Locked 考前收斂 calm-view copy (add-neurons-cram-calm-view). Kept in a pure
 * module (no React) so the copy-guard test can import it without the component
 * tree. HONESTY: the only dynamic value the calm view ever interpolates is a bare
 * integer between PREFIX and SUFFIX — no denominator / % / prediction. Wording
 * locked via /grill + Codex consult (grilled-neurons-cram-calm-view-2026-07-06.md).
 */
export const CALM_COVERAGE_PREFIX = '你已答對過 '
export const CALM_COVERAGE_SUFFIX = ' 個高頻考點的題目。'
// Repurposed 2026-07-13 (Codex UX consult): this panel is now a completion RECAP
// (「今天留下的連結」) — the「可以休息／收工」permission belongs solely to the
// lights-out ritual (neurons-lights-out). So the closing line states what the day
// left behind, not that the player may rest.
export const CALM_CLOSING_LINE = '這些連結已經留下來了。'

// ── 考前救援 bonus + dayComplete + NG-0717 reframe (add-neurons-cram-rescue-and-card-actions) ──
// Optional post-完成 bonus — never framed as 未完成/繼續/下一步/還差 (anti-anxiety).
export const DAY_COMPLETE_LINE = '今天的處方完成了 · 這樣就夠了'
export const CRAM_RESCUE_INVITE = '想趁手感還在？去高頻考點練 1 題就好'
export const CRAM_RESCUE_DONE = '考前救援 ✓ · 今天有碰過高頻考點'
export const CRAM_RESCUE_FLAVOR = '額外養分 +1'
// NG-0717 open-ended reframe — drop the 「第 10 天完全體」 countdown.
export const NG0717_OPEN_HINT = '完成處方會讓 NG-0717 慢慢長出新的形態；每一次完成都算數。'
export const NG0717_KEEPSAKE_LINE = '一路修補過的痕跡，不是截止日'

// ── Tier ladder copy (add-neurons-prescription-tiers-and-sync) ───────────────
// T2–T4 render ONLY after T1 (today's two lines) is done — progressive
// disclosure, mirroring the 考前救援 visibility gate. T1 is the ONLY tier worded
// 「完成」 (DAY_COMPLETE_LINE above); un-reached tiers use invite tone only. No
// 還差 / 未達成 / 落後 / 連續 / countdown / denominator anywhere (copy-guard).
export const TIER_T1_NAME = '基礎處方'
export const TIER_T2_NAME = '追加固化'
export const TIER_T3_NAME = '形成連結'
export const TIER_T4_NAME = '深度出征'
export const TIER_PANEL_LEAD = '今天的處方完成了；有餘裕的話，下面是可以加深的選項。'
export const TIER_T2_INVITE_WRONG = '手感還在的話，可以再多固化幾條連結（可選）'
export const TIER_T2_INVITE_BREADTH = '想多開幾條新連結？隨時可以（可選）'
export const TIER_T2_INVITE_CRAM = '去高頻考點多練幾題，也算固化（可選）'
export const TIER_T3_INVITE = '出征修補時，科目之間會自然長出連結（可選）'
export const TIER_T4_INVITE = '狀態好的話，今天可以走得更深（可選）'
/** Reached-tier acknowledgement: `{TIER_Tn_NAME} ✓ · 傳導能量 +{E} → {family}`. */
export const TIER_REACHED_MARK = '✓'
export const TIER_ENERGY_LABEL = '傳導能量'
