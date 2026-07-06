/**
 * Locked 考前收斂 calm-view copy (add-neurons-cram-calm-view). Kept in a pure
 * module (no React) so the copy-guard test can import it without the component
 * tree. HONESTY: the only dynamic value the calm view ever interpolates is a bare
 * integer between PREFIX and SUFFIX — no denominator / % / prediction. Wording
 * locked via /grill + Codex consult (grilled-neurons-cram-calm-view-2026-07-06.md).
 */
export const CALM_COVERAGE_PREFIX = '你已答對過 '
export const CALM_COVERAGE_SUFFIX = ' 個高頻考點的題目。'
export const CALM_CLOSING_LINE = '今晚可以停在這裡，讓連結慢慢固化。'

// ── 考前救援 bonus + dayComplete + NG-0717 reframe (add-neurons-cram-rescue-and-card-actions) ──
// Optional post-完成 bonus — never framed as 未完成/繼續/下一步/還差 (anti-anxiety).
export const DAY_COMPLETE_LINE = '今天的處方完成了 · 這樣就夠了'
export const CRAM_RESCUE_INVITE = '想趁手感還在？去高頻考點練 1 題就好'
export const CRAM_RESCUE_DONE = '考前救援 ✓ · 今天有碰過高頻考點'
export const CRAM_RESCUE_FLAVOR = '額外養分 +1'
// NG-0717 open-ended reframe — drop the 「第 10 天完全體」 countdown.
export const NG0717_OPEN_HINT = '完成處方會讓 NG-0717 慢慢長出新的形態；每一次完成都算數。'
export const NG0717_KEEPSAKE_LINE = '一路修補過的痕跡，不是截止日'
