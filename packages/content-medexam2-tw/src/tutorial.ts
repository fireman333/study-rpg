/**
 * Tutorial / onboarding definitions for the 二階 medexam2 content pack.
 *
 * Locked by `redesign-hospital-economy` (2026-05-17) per design D10 and spec
 * `hospital-tutorial`. Three-layer model:
 *
 *   L1 · onboarding modal flow (7 steps, sequential, gated on small actions)
 *   L2 · per-surface first-visit hints (one-shot, dismissible)
 *   L3 · state-milestone toast tips (auto-fire on threshold crossing)
 *
 * This module is plain data — strings + trigger conditions. The app layer
 * wires conditions to live counter state (Dexie liveQuery) and surfaces the
 * matching UI component. No DOM / no React here.
 */

/** Stable id used to key `tutorial.completedSteps[stepId]` in gameCounters. */
export type TutorialStepId =
  | 'welcome'
  | 'starter-pull'
  | 'first-assignment'
  | 'first-study-session'
  | 'first-revenue-check'
  | 'tier-upgrade-preview'
  | 'done'

export interface TutorialStep {
  id: TutorialStepId
  /** Display heading (Traditional Chinese). */
  title: string
  /** Body copy — kept concise (≤ 1 short paragraph per design D10 L1). */
  body: string
  /**
   * Action that completes the step. The app layer interprets this string to
   * decide which UI affordance unlocks the「下一步」button. Possible values
   * are documented inline; new triggers added here MUST also be wired in the
   * `TutorialOnboarding` component.
   */
  completeOn:
    | 'click-next'
    | 'recruitment-screen-visited'
    | 'doctor-assigned'
    | 'study-session-started-1min'
    | 'home-revenue-visible'
    | 'tier-progress-visible'
}

/** Ordered onboarding sequence. Reload resumes at first incomplete step. */
export const TUTORIAL_STEPS: ReadonlyArray<TutorialStep> = Object.freeze([
  {
    id: 'welcome',
    title: '歡迎來到醫院經營',
    body: '在這裡，念書 = 醫院賺錢 = 升級。開「📖 唸書」session 期間，醫師看患者的 idle 收入會有 1.5× 加成；寫題答對也會直接賺營收和聲望（依 tier × 搭檔同科加成，session 開不開都一樣）。',
    completeOn: 'click-next',
  },
  {
    id: 'starter-pull',
    title: '招募你的第一位醫師',
    body: '到「招募」頁面用免費的 starter 抽一發，至少能拿到 P4 以上的醫師加入團隊。',
    completeOn: 'recruitment-screen-visited',
  },
  {
    id: 'first-assignment',
    title: '指派醫師到診間',
    body: '把醫師拖到「門診」房間，他才會開始為醫院產出 throughput。同科別的醫師在對應房間內加成最大。',
    completeOn: 'doctor-assigned',
  },
  {
    id: 'first-study-session',
    title: '開始第一次唸書 session',
    body: '點「開始唸書」進入看診畫面 — 醫師會 idle 看患者，session 期間 throughput 有 1.5× 加成（薪水照舊全額）。寫題答對的營收/聲望跟 session 開不開無關。離開分頁會自動暫停、回來自動繼續；按右上「結束 Session」可手動結算。',
    completeOn: 'study-session-started-1min',
  },
  {
    id: 'first-revenue-check',
    title: '看看你的營收',
    body: '回到首頁，會看到剛剛累積的營收與聲望。session idle 看診 + quiz 答對都會貢獻。營收用來投資設施、進修、擴建；聲望是升級醫院的門檻。',
    completeOn: 'home-revenue-visible',
  },
  {
    id: 'tier-upgrade-preview',
    title: '升級需要兩個條件',
    body: '升上一階不只看聲望，還需要收集足夠的「不同科別」醫師。雙閘門設計確保你的醫院全方位發展，不會只靠單科衝刺。',
    completeOn: 'tier-progress-visible',
  },
  {
    id: 'done',
    title: '基本操作完成',
    body: '你已掌握基本操作，繼續念書解鎖更多功能：醫師進修、設施升級、特殊事件、命運卡都在等你。',
    completeOn: 'click-next',
  },
])

/** Stable surface ids — match `tutorial.firstVisit[id]` flags. */
export type TutorialSurfaceId =
  | 'study'
  | 'training'
  | 'hospital'
  | 'fate-cards'
  | 'event-first'

export interface SurfaceHint {
  id: TutorialSurfaceId
  /** Display heading. */
  title: string
  /** Body — one-shot, dismissible per spec hospital-tutorial Req 2. */
  body: string
}

/** Per-surface contextual hints, fired on first visit. */
export const SURFACE_HINTS: ReadonlyArray<SurfaceHint> = Object.freeze([
  {
    id: 'study',
    title: '唸書 session 怎麼運作',
    body: '看診畫面就是你的醫院。session 計時跑著，切到別的 tab 會自動暫停、回來自動繼續。session 開啟期間，醫師看患者的營收/聲望會有 1.5× 加成（寫題答對的收益不受影響，只看 tier × 搭檔同科加成）；想停下來按「暫停」或「結束 Session」。',
  },
  {
    id: 'training',
    title: '醫師進修怎麼用',
    body: '消耗營收提升醫師 rarity。失敗只損營收、不掉等級。同一位醫師連續失敗 5 次後第 6 次必中（pity 保底）。',
  },
  {
    id: 'hospital',
    title: '房間管理',
    body: 'Facility 升級會放大該房間的 throughput；區域醫院以上可再花錢擴建額外房間，容納更多醫師。',
  },
  {
    id: 'fate-cards',
    title: '命運卡',
    body: '消耗聲望抽 4 階卡包，內容含招募券、進修保證券、facility / throughput 加成。任何 tier 都可抽，reputation 不足會 disable 該階。pity 3 防連衰。',
  },
  {
    id: 'event-first',
    title: '特殊事件',
    body: '正向事件直接接受；負面事件（如醫療糾紛）通常可選「私下和解」付營收，或「接受懲處」扣聲望。',
  },
])

/** Stable tip ids — match `tutorial.firedTips[id]` flags (fires once per save). */
export type MilestoneTipId =
  | 'revenue_1000'
  | 'reputation_tier1_gate_blocked'
  | 'net_rate_slow'
  | 'training_pity_5'

export interface MilestoneTip {
  id: MilestoneTipId
  /** Short body, ≤ 80 chars per spec hospital-tutorial Req 5. */
  message: string
  /**
   * Trigger condition described in plain language for the app layer to
   * implement against live counter state. Each MilestoneTip is wired in
   * `useMilestoneTips` hook (app-side).
   */
  triggerDescription: string
}

/** Toast-style tip definitions. Fire-once via `tutorial.firedTips[id]`. */
export const MILESTONE_TIPS: ReadonlyArray<MilestoneTip> = Object.freeze([
  {
    id: 'revenue_1000',
    message: '營收 ≥ 1000 — 試試到 /training 升等醫師',
    triggerDescription: 'revenue >= 1000 (first crossing)',
  },
  {
    id: 'reputation_tier1_gate_blocked',
    message: '聲望已達門檻，但還缺不同科別醫師（看升級面板）',
    triggerDescription: 'reputation >= TIER_UPGRADE_THRESHOLDS[診所] AND diversification gate not met (first occurrence). Threshold value tracks the constant; renamed from `reputation_48k_gate_blocked` after add-quiz-economy-redesign recalibrated 診所→區域醫院 threshold to 30,000.',
  },
  {
    id: 'net_rate_slow',
    message: '營收成長變慢 — 考慮升級 facility 或擴建房間',
    triggerDescription: 'net rate < +10/min for 5 consecutive ticks (first occurrence)',
  },
  {
    id: 'training_pity_5',
    message: '已連續失敗 5 次，下次進修必中 — 別放棄',
    triggerDescription: 'any doctor pityCounter reaches 5 (first occurrence per save)',
  },
])
