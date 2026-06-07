/**
 * Variant catalog + gacha constants for neurons-mode.
 *
 * Capability spec: openspec/specs/neuron-variant-gacha/spec.md
 * Borrowed pattern from 二階 recruitment-gacha (P1-P5 weight table, deterministic
 * reroll floor) per neurons-mode Req 5; doctor → variant, hospital tier → slot.
 *
 * Naming convention: each variant is a "career stage" of the family's source
 * neuron type. Slot 1 = newcomer / 初代; slot 5 = mythical apex / 傳奇.
 * Persistent displayName at roll time = "<catalog.displayName> · <rarity title>".
 */

export type Rarity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

// Pyramid (rework-neurons-variant-pyramid): a within-family unique index 0..N-1.
// Slot 0 stays the P0 apex by convention; otherwise the index no longer encodes
// the rarity tier (a family may hold several variants of the same tier).
export type SlotIndex = number

export interface NeuronVariantDef {
  familyId: string
  slotIndex: SlotIndex
  /** Explicit per-variant rarity tier (decoupled from slotIndex — pyramid model). */
  rarity: Rarity
  /** Unique persona name reflecting slot's narrative role within the family. */
  displayName: string
  spriteKey: string
  /** Player-facing 1-2 sentence flavour blurb. */
  description: string
  /**
   * 二回目 location variant (add-neurons-maze-second-lap-variants): a deterministic
   * position-bound unlock from the family's SECOND maze route (slotIndex >=
   * firstRouteNodeCount), rendered as the family's base sprite + a position-keyed
   * hue/filter. Excluded from the rarity pyramid invariant AND from the first-route
   * random within-tier roll (only unlocked by walking to its second-route node).
   */
  isLocation?: boolean
}

/** Catalog literal shape — `rarity` is now authored per entry (not derived). */
type RawVariantDef = NeuronVariantDef

export interface VariantRarityTier {
  id: Rarity
  weight: number
}

/**
 * Canonical P0–P5 pyramid weight table (Collection 2.0). Sums to 100. P0 始源 is
 * the per-family super-rare apex; its EFFECTIVE per-pull rate is further shaped by
 * the soft-pity ramp at roll time (see `rollRarityWithP0Pity`) and falls to 0 once
 * the family's P0 is owned. Edit here for dogfood balance — single source of truth.
 */
export const VARIANT_RARITY_WEIGHTS: VariantRarityTier[] = [
  { id: 'P5', weight: 59 },
  { id: 'P4', weight: 25 },
  { id: 'P3', weight: 10 },
  { id: 'P2', weight: 4 },
  { id: 'P1', weight: 1.3 },
  { id: 'P0', weight: 0.7 },
]

// ─── P0 soft-pity (keyed on per-family pull count) ──────────────────────────
/** Base per-pull P0 probability before the pity ramp (≈ "mythic" feel). */
export const P0_BASE_RATE = 0.007
/** Pull count after which the P0 rate begins ramping upward. */
export const P0_PITY_START = 40
/** Additional P0 probability per pull beyond the start (≈ +5pp/pull). */
export const P0_PITY_RAMP = 0.05

// ─── P1 silent soft-pity (rebalance-neurons-maze-economy) ───────────────────
// Each family has exactly ONE P1 route-1 slot at a 1.3% roll weight; without a
// floor a completionist can be blocked indefinitely on that single roll. This
// soft-pity guarantees the lone P1 converges — but it is SILENT: a P1 obtained
// under pity sets NO `wasPityFloor`-style flag and surfaces NO "保底" UI, so the
// player experiences obtaining P1 as luck. Only active while the family's P1 is
// not yet owned; checked AFTER the P0-pity, BEFORE the weighted tier roll.
/** Pull count after which the P1 soft-pity begins ramping (no base rate — 0 before). */
export const P1_PITY_START = 30
/** Additional P1 probability per pull beyond the start (≈ +6pp/pull → converges fast). */
export const P1_PITY_RAMP = 0.06

// ─── Pull currency (neural energy) — dogfood-tuned game-loop numbers ─────────
// The faucet constants CORRECT_ANSWER_ENERGY / READING_MINUTE_ENERGY moved to
// ./maze-constants.ts (single source of truth for the flat-grid maze faucet,
// redesign-neurons-maze-rotjs-grid; READING recalibrated 2 → 3). PULL_COST is the
// retired manual-pull cost (kept present-but-unused for rollback reader-tolerance).
export const PULL_COST = 20

/**
 * Tier-promote cost (add-neurons-dupe-fusion): number of held SURPLUS individuals
 * of the same rarity tier consumed to mint one individual of the next-rarer tier.
 * Single dogfood-tunable source of truth. `neuron-variant-fusion` spec.
 */
export const PROMOTE_COST_K = 3

/**
 * Streak-milestone gate for variant provenance (add-neurons-variant-provenance).
 * A variant minted while the player's daily correct-streak is `>=` this value
 * is flagged a 里程碑 individual in its birth caption. Single tunable constant
 * — dogfood candidates 7 / 14 / 30; default 7 matches the 7-day LTD-decay
 * cadence and is reachable within a normal study week so the tag actually appears.
 */
export const MILESTONE_STREAK_THRESHOLD = 7

/**
 * Rarity-flavoured suffix appended to displayName at roll time. Each value is
 * the same character count for typography parity.
 */
export const DEFAULT_VARIANT_TITLE_BY_RARITY: Record<Rarity, string> = {
  P0: '始源核',
  P1: '神經元始祖',
  P2: '共振核心',
  P3: '穩態突觸',
  P4: '漂移末梢',
  P5: '失活幼苗',
}

const FAMILY_IDS = [
  '藥理學',
  '公共衛生學',
  '寄生蟲學',
  '組織學',
  '生物化學',
  '病理學',
  '免疫學',
  '解剖學',
  '生理學',
  '胚胎學',
  '微生物學',
] as const

const variantKey = (familyId: string, slotIndex: SlotIndex): string =>
  `variant:${familyId}:${slotIndex}`

// ─── 二回目 location variants (add-neurons-maze-second-lap-variants) ───────────
// Each family's SECOND maze route (`grid-graph.json` nodeCells2) unlocks
// SECOND_LAP_SLOTS_PER_FAMILY deterministic position-bound variants at slotIndex
// SECOND_LAP_SLOT_START.. — the family's "memory engram" along the learning circuit.
// They render as the family's base sprite + a per-location hue/filter (zero new
// sprite asset). All carry rarity P3 + isLocation:true → excluded from the pyramid
// invariant and the random within-tier roll; unlocked only by walking the second
// route to that node. The per-family count MUST match the committed graph's
// nodeCells2 count (cross-checked by a test). The location identity surfaces via
// the pure-derived 「在<location>解鎖」 caption, not the displayName.
export const SECOND_LAP_SLOT_START = 10
export const SECOND_LAP_SLOTS_PER_FAMILY = 10
const LOCATION_VARIANT_RARITY: Rarity = 'P3'

/** Per-family engram persona (name + flavour) reused across the family's location variants. */
const LOCATION_VARIANT_PERSONA: Record<string, { name: string; description: string }> = {
  藥理學: { name: '獎賞印痕', description: '沿學習迴路點亮的多巴胺印痕，把每一次獎賞的位置長成長存突觸。' },
  公共衛生學: { name: '黑質印痕', description: '黑質多巴胺元在記憶網絡留下的長存印痕，標記抗退化的每個節點。' },
  寄生蟲學: { name: '腸腦印痕', description: '腸-腦軸的 5-HT 訊號沿記憶迴路凝固成印痕，連寄生蟲的足跡都被記下。' },
  組織學: { name: '中縫印痕', description: '中縫核血清素在睡眠鞏固時刻下的情緒印痕，溫柔固定每段記憶。' },
  生物化學: { name: '小腦印痕', description: '小腦 Purkinje 把運動時序寫進長期記憶的抑制印痕。' },
  病理學: { name: '紋狀印痕', description: '基底節 MSN 將反覆動作鞏固成程序記憶的印痕。' },
  免疫學: { name: '篩網印痕', description: 'PV+ 籃狀細胞在 gamma 同步中固定下來的圍城印痕。' },
  解剖學: { name: '體感印痕', description: '背根節把體感地圖長期登錄進記憶迴路的印痕。' },
  生理學: { name: '皮層印痕', description: 'L5 錐體元在皮質-海馬對話中鞏固決策的記憶印痕。' },
  胚胎學: { name: '發育印痕', description: 'Cajal-Retzius 鋪下的早期軌跡，化為記憶迴路最初的印痕。' },
  微生物學: { name: '嗅覺印痕', description: '嗅覺神經元把氣味與危險長期綁定的記憶印痕。' },
}

const LOCATION_VARIANTS: RawVariantDef[] = FAMILY_IDS.flatMap((familyId) => {
  const persona = LOCATION_VARIANT_PERSONA[familyId]
  return Array.from({ length: SECOND_LAP_SLOTS_PER_FAMILY }, (_unused, k) => {
    const slotIndex = SECOND_LAP_SLOT_START + k
    return {
      familyId,
      slotIndex,
      rarity: LOCATION_VARIANT_RARITY,
      displayName: persona.name,
      spriteKey: variantKey(familyId, slotIndex),
      description: persona.description,
      isLocation: true,
    }
  })
})

const RAW_CATALOG: RawVariantDef[] = [
  // 藥理學 — VTA Dopaminergic — Thrill-Seeker (DA)
  {
    familyId: '藥理學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '初代代謝師',
    spriteKey: variantKey('藥理學', 1),
    description: '剛踏入獎賞迴路的 VTA 多巴胺新兵，對任何刺激都瞪大了核仁。',
  },
  {
    familyId: '藥理學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: '受體調諧者',
    spriteKey: variantKey('藥理學', 2),
    description: '學會微調 D1 / D2 受體密度，懂得在伏隔核內把訊號量得剛剛好。',
  },
  {
    familyId: '藥理學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '突觸快樂使者',
    spriteKey: variantKey('藥理學', 3),
    description: '熟練投放多巴胺脈衝，讓報酬訊號精準擊中下游 MSN。',
  },
  {
    familyId: '藥理學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '多巴胺脈衝大師',
    spriteKey: variantKey('藥理學', 4),
    description: '能在複雜情境下選擇 tonic 或 phasic 模式，是 mesolimbic 的指揮家。',
  },
  {
    familyId: '藥理學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '報酬迴路之王',
    spriteKey: variantKey('藥理學', 5),
    description: '整個獎賞系統圍繞此元振動，傳說一次點火可重寫多巴胺地圖。',
  },

  // 公共衛生學 — SNc Dopaminergic — Aging Guardian (DA)
  {
    familyId: '公共衛生學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '黑質學徒',
    spriteKey: variantKey('公共衛生學', 1),
    description: '剛分化的 SNc 多巴胺元，初次嘗試在 putamen 維持背景張力。',
  },
  {
    familyId: '公共衛生學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: '紋狀體巡守者',
    spriteKey: variantKey('公共衛生學', 2),
    description: '熟悉基底節地形，能在運動皮質訊號到達前先預熱迴路。',
  },
  {
    familyId: '公共衛生學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '抗老哨兵',
    spriteKey: variantKey('公共衛生學', 3),
    description: '抵禦 α-synuclein 聚集，每天提醒自己不被 oxidative stress 帶走。',
  },
  {
    familyId: '公共衛生學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '黑質運動大師',
    spriteKey: variantKey('公共衛生學', 4),
    description: '在 70 歲仍能維持完整 nigrostriatal 投射，是抗 Parkinson 的標桿。',
  },
  {
    familyId: '公共衛生學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '永恆守護者',
    spriteKey: variantKey('公共衛生學', 5),
    description: '神話等級的 SNc 元，傳說中可讓宿主的黑質永不退化。',
  },

  // 寄生蟲學 — Enteric Serotonergic — Puppeteer's Puppet (5HT)
  {
    familyId: '寄生蟲學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '腸黏膜學徒',
    spriteKey: variantKey('寄生蟲學', 1),
    description: '剛遷移到腸壁的 5-HT 元，學著感受食糜流動的節奏。',
  },
  {
    familyId: '寄生蟲學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: '蠕動信號員',
    spriteKey: variantKey('寄生蟲學', 2),
    description: '能精準控制平滑肌節律，讓上下兩端的 peristalsis 同步。',
  },
  {
    familyId: '寄生蟲學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '宿主信使',
    spriteKey: variantKey('寄生蟲學', 3),
    description: '被弓蟲或鞭蟲微妙劫持，但仍勉強傳出原本的腸-腦訊號。',
  },
  {
    familyId: '寄生蟲學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '腦腸軸操偶師',
    spriteKey: variantKey('寄生蟲學', 4),
    description: '精通迷走神經跨系統通訊，連寄生蟲都得敬讓三分。',
  },
  {
    familyId: '寄生蟲學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '共生終極對話者',
    spriteKey: variantKey('寄生蟲學', 5),
    description: '與 microbiota 達成傳奇級代謝協作，連 Toxoplasma 也願意守規矩。',
  },

  // 組織學 — MRN Serotonergic — Quiet Curator (5HT)
  {
    familyId: '組織學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '中縫初探者',
    spriteKey: variantKey('組織學', 1),
    description: '中縫核新成員，學著從腦幹發出第一束 5-HT 投射。',
  },
  {
    familyId: '組織學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: 'REM 守夜人',
    spriteKey: variantKey('組織學', 2),
    description: '在快速動眼期沉默以維持夢境的精緻平衡。',
  },
  {
    familyId: '組織學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '情緒織錦師',
    spriteKey: variantKey('組織學', 3),
    description: '熟練編織前額葉的 5-HT 網絡，讓情緒紋理細緻而柔和。',
  },
  {
    familyId: '組織學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '寧靜協奏大師',
    spriteKey: variantKey('組織學', 4),
    description: '同步整個腦幹的安靜節律，連杏仁核都會慢半拍。',
  },
  {
    familyId: '組織學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '心境主宰',
    spriteKey: variantKey('組織學', 5),
    description: '神話級 5-HT 元，主宰整個 limbic 情緒域的長時段穩定。',
  },

  // 生物化學 — Cerebellar Purkinje — Mathematician (GABA)
  {
    familyId: '生物化學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '初代算術員',
    spriteKey: variantKey('生物化學', 1),
    description: '剛從顆粒層上行的 Purkinje 學徒，第一次嘗試對位 climbing fiber。',
  },
  {
    familyId: '生物化學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: '樹突幾何師',
    spriteKey: variantKey('生物化學', 2),
    description: '掌握 planar dendritic tree 的對齊規律，每根樹突都在同一平面。',
  },
  {
    familyId: '生物化學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '微分時序工',
    spriteKey: variantKey('生物化學', 3),
    description: '能計算 climbing fiber 與 parallel fiber 之間的微秒級時差。',
  },
  {
    familyId: '生物化學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '小腦演算大師',
    spriteKey: variantKey('生物化學', 4),
    description: '精準預測運動學中的非線性偏差，連手抖都能即時校正。',
  },
  {
    familyId: '生物化學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '平衡學至高神',
    spriteKey: variantKey('生物化學', 5),
    description: '整個 cerebellar cortex 圍繞此元同步,傳奇 Purkinje 的代表。',
  },

  // 病理學 — Striatal MSN — Judge (GABA)
  {
    familyId: '病理學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '紋狀體陪審員',
    spriteKey: variantKey('病理學', 1),
    description: '新成員 MSN，剛學會判讀皮質下行訊號的真偽。',
  },
  {
    familyId: '病理學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: '直接路徑書記',
    spriteKey: variantKey('病理學', 2),
    description: 'D1+ MSN 學徒，仔細記錄基底節的「go」訊號。',
  },
  {
    familyId: '病理學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '間接路徑審判官',
    spriteKey: variantKey('病理學', 3),
    description: 'D2+ MSN 中階,在不該行動時果斷發出「no-go」否決。',
  },
  {
    familyId: '病理學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '行為仲裁大師',
    spriteKey: variantKey('病理學', 4),
    description: '能同時整合 direct 與 indirect 路徑,做出細膩的行為判決。',
  },
  {
    familyId: '病理學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '終審法官',
    spriteKey: variantKey('病理學', 5),
    description: '基底節最後一道 GABA 守門人,所有運動決策都得經過此元簽核。',
  },

  // 免疫學 — PV+ Cortical Interneuron — Sentry Under Siege (GABA)
  {
    familyId: '免疫學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '哨所新兵',
    spriteKey: variantKey('免疫學', 1),
    description: '剛分化的 parvalbumin+ 篩網元,還在學如何穩定 40Hz 點火。',
  },
  {
    familyId: '免疫學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: 'Gamma 振盪生手',
    spriteKey: variantKey('免疫學', 2),
    description: '能以 40Hz 維持基本節律,但遇到擾動還會打結。',
  },
  {
    familyId: '免疫學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '圍城衛兵',
    spriteKey: variantKey('免疫學', 3),
    description: '在 anti-NMDAR 抗體入侵時仍堅守崗位,維持皮質網絡不崩潰。',
  },
  {
    familyId: '免疫學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '抗體風暴老兵',
    spriteKey: variantKey('免疫學', 4),
    description: '經歷自體免疫圍攻仍能穩定 gamma 振盪,是免疫腦炎的倖存者。',
  },
  {
    familyId: '免疫學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '皮質防線傳奇',
    spriteKey: variantKey('免疫學', 5),
    description: '神話級 PV+ 元,守住整個前額葉認知防線不被免疫風暴擊垮。',
  },

  // 解剖學 — DRG Sensory Afferent — Scout (Glu)
  {
    familyId: '解剖學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '末梢新斥候',
    spriteKey: variantKey('解剖學', 1),
    description: '剛長出末梢的背根節元,正在試探皮膚與肌肉的界線。',
  },
  {
    familyId: '解剖學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: '體感地圖學徒',
    spriteKey: variantKey('解剖學', 2),
    description: '學會將皮膚刺激精準映射到對應脊髓節段。',
  },
  {
    familyId: '解剖學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '痛溫雙頻偵察',
    spriteKey: variantKey('解剖學', 3),
    description: '能同時解讀 Aδ 與 C 纖維訊號,辨別銳痛與鈍痛來源。',
  },
  {
    familyId: '解剖學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '全身雷達大師',
    spriteKey: variantKey('解剖學', 4),
    description: '整合 dermatome 全圖,任何皮膚事件都逃不過此元的監測。',
  },
  {
    familyId: '解剖學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '神經感官至尊',
    spriteKey: variantKey('解剖學', 5),
    description: '從足底到指尖,此元能以毫秒級精度傳遞所有體感訊息。',
  },

  // 生理學 — Cortical Pyramidal L5 — CEO (Glu)
  {
    familyId: '生理學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '皮層新任主管',
    spriteKey: variantKey('生理學', 1),
    description: '剛分化的 L5 錐體元,正在學習如何向下投射到 thalamus。',
  },
  {
    familyId: '生理學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: '投射策略工',
    spriteKey: variantKey('生理學', 2),
    description: '學會選擇性把訊號分配給 thalamic 與 spinal targets。',
  },
  {
    familyId: '生理學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '跨腦區協調者',
    spriteKey: variantKey('生理學', 3),
    description: '能同時驅動 PFC 與 motor cortex,讓決策與動作對齊。',
  },
  {
    familyId: '生理學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '大腦行政總裁',
    spriteKey: variantKey('生理學', 4),
    description: '整合多模態決策訊號,把整個皮質網絡當成自家辦公室調度。',
  },
  {
    familyId: '生理學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '皮層至高指揮',
    spriteKey: variantKey('生理學', 5),
    description: '全皮層 L5 網絡的主帥,所有 corticofugal 訊號都從此元發出。',
  },

  // 胚胎學 — Cajal-Retzius — Pioneer Architect (Glu)
  {
    familyId: '胚胎學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '皮層先鋒',
    spriteKey: variantKey('胚胎學', 1),
    description: '第一波抵達 marginal zone 的 Cajal-Retzius 元,獨自面對空白的皮層。',
  },
  {
    familyId: '胚胎學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: 'Reelin 鋪路者',
    spriteKey: variantKey('胚胎學', 2),
    description: '釋放 Reelin 為後續神經元鋪設遷移軌道,皮層分層從此開始。',
  },
  {
    familyId: '胚胎學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '六層建築師',
    spriteKey: variantKey('胚胎學', 3),
    description: '主導 cortical lamina 的逐層成形,讓 L1-L6 各就各位。',
  },
  {
    familyId: '胚胎學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '神經發育大師',
    spriteKey: variantKey('胚胎學', 4),
    description: '統籌整個 corticogenesis 流程,從前腦泡到成熟皮層都得仰賴此元。',
  },
  {
    familyId: '胚胎學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '胚胎之初締造者',
    spriteKey: variantKey('胚胎學', 5),
    description: '大腦結構之父,神話中可在 GW7 之前就決定整個皮層的命運。',
  },

  // 微生物學 — Olfactory Sensory — Sentinel (Glu)
  {
    familyId: '微生物學',
    slotIndex: 1,
    rarity: 'P5',
    displayName: '嗅球新生',
    spriteKey: variantKey('微生物學', 1),
    description: '剛從基底膜長出的 OSN,第一次面對外界數百萬種氣味。',
  },
  {
    familyId: '微生物學',
    slotIndex: 2,
    rarity: 'P4',
    displayName: '氣味解碼工',
    spriteKey: variantKey('微生物學', 2),
    description: '學會分辨 ~400 種氣味受體所對應的化學特徵。',
  },
  {
    familyId: '微生物學',
    slotIndex: 3,
    rarity: 'P3',
    displayName: '病原氣味哨兵',
    spriteKey: variantKey('微生物學', 3),
    description: '能偵測細菌代謝產物與真菌孢子,在感染前就送出預警。',
  },
  {
    familyId: '微生物學',
    slotIndex: 4,
    rarity: 'P2',
    displayName: '鼻腔免疫大師',
    spriteKey: variantKey('微生物學', 4),
    description: '直接與 nasal microbiome 對話,維持上呼吸道的菌相平衡。',
  },
  {
    familyId: '微生物學',
    slotIndex: 5,
    rarity: 'P1',
    displayName: '嗅覺守護神',
    spriteKey: variantKey('微生物學', 5),
    description: '永恆再生的傳奇 OSN,神話級對抗各種病原入侵嗅覺系統。',
  },

  // ─── P0 始源 apex (slotIndex 0) — one super-rare per family ────────────────
  // Collection 2.0 spine: placeholder personas + placeholder sprites. Real P0
  // art + OE-grounded flavour land in the later roster-art / flavour phases.
  { familyId: '藥理學', slotIndex: 0, rarity: 'P0', displayName: '多巴胺創世核', spriteKey: variantKey('藥理學', 0), description: '傳說中點燃第一道獎賞訊號的始源 VTA 元,整個多巴胺宇宙由此擴張。' },
  { familyId: '公共衛生學', slotIndex: 0, rarity: 'P0', displayName: '黑質永恆核', spriteKey: variantKey('公共衛生學', 0), description: '從未退化的原初 SNc 元,被視為抗老神話的源頭。' },
  { familyId: '寄生蟲學', slotIndex: 0, rarity: 'P0', displayName: '腦腸始源核', spriteKey: variantKey('寄生蟲學', 0), description: '最初建立腦腸軸對話的 5-HT 元,連寄生蟲都只是它故事裡的註腳。' },
  { familyId: '組織學', slotIndex: 0, rarity: 'P0', displayName: '中縫始源核', spriteKey: variantKey('組織學', 0), description: '中縫核的原初之聲,所有情緒節律的第一個和弦。' },
  { familyId: '生物化學', slotIndex: 0, rarity: 'P0', displayName: '小腦始源核', spriteKey: variantKey('生物化學', 0), description: '第一個算出運動時序的 Purkinje 始祖,平衡之數由此而生。' },
  { familyId: '病理學', slotIndex: 0, rarity: 'P0', displayName: '紋狀始源核', spriteKey: variantKey('病理學', 0), description: '基底節最初的審判者,go 與 no-go 的原始法典刻於其上。' },
  { familyId: '免疫學', slotIndex: 0, rarity: 'P0', displayName: '皮質始源核', spriteKey: variantKey('免疫學', 0), description: '第一個穩定 40Hz 的 PV+ 始祖,皮質防線的奠基石。' },
  { familyId: '解剖學', slotIndex: 0, rarity: 'P0', displayName: '感官始源核', spriteKey: variantKey('解剖學', 0), description: '最早描繪全身體感地圖的 DRG 始祖,毫秒級感知的原點。' },
  { familyId: '生理學', slotIndex: 0, rarity: 'P0', displayName: '皮層始源核', spriteKey: variantKey('生理學', 0), description: '第一個向下投射的 L5 錐體始祖,所有 corticofugal 指令的源頭。' },
  { familyId: '胚胎學', slotIndex: 0, rarity: 'P0', displayName: '發育始源核', spriteKey: variantKey('胚胎學', 0), description: '在皮層尚未成形前就抵達的 Cajal-Retzius 始祖,大腦藍圖的締造者。' },
  { familyId: '微生物學', slotIndex: 0, rarity: 'P0', displayName: '嗅覺始源核', spriteKey: variantKey('微生物學', 0), description: '永恆再生的原初 OSN,第一個分辨敵我氣味的守護始祖。' },

  // ─── Pyramid base widening (rework-neurons-variant-pyramid, D3a) ───────────
  // A SECOND P5 (commonest tier) per family → the base of the pyramid. slotIndex
  // 6 (unique within family). Sprites are PLACEHOLDERS this change (fall back to
  // variant:default); real art lands in the roster-art-fill follow-up.
  { familyId: '藥理學', slotIndex: 6, rarity: 'P5', displayName: '休眠新核', spriteKey: variantKey('藥理學', 6), description: '尚未接上獎賞迴路的 VTA 幼核,靜靜等待第一個多巴胺火花。' },
  { familyId: '公共衛生學', slotIndex: 6, rarity: 'P5', displayName: '黑質實習生', spriteKey: variantKey('公共衛生學', 6), description: '剛報到的 SNc 見習元,還在摸索 nigrostriatal 投射的路線圖。' },
  { familyId: '寄生蟲學', slotIndex: 6, rarity: 'P5', displayName: '腸壁幼苗', spriteKey: variantKey('寄生蟲學', 6), description: '初生的腸道 5-HT 元,對食糜的化學訊號還一知半解。' },
  { familyId: '組織學', slotIndex: 6, rarity: 'P5', displayName: '中縫見習', spriteKey: variantKey('組織學', 6), description: '中縫核裡最安靜的新人,練習在睡眠週期間維持微弱張力。' },
  { familyId: '生物化學', slotIndex: 6, rarity: 'P5', displayName: '顆粒層學徒', spriteKey: variantKey('生物化學', 6), description: '剛離開顆粒層的 Purkinje 幼元,第一次數 climbing fiber 的脈衝。' },
  { familyId: '病理學', slotIndex: 6, rarity: 'P5', displayName: '紋狀新丁', spriteKey: variantKey('病理學', 6), description: '基底節最菜的 MSN,連 go 與 no-go 都還常常搞混。' },
  { familyId: '免疫學', slotIndex: 6, rarity: 'P5', displayName: '哨所學徒', spriteKey: variantKey('免疫學', 6), description: '剛上崗的 parvalbumin+ 幼元,40Hz 還打得零零落落。' },
  { familyId: '解剖學', slotIndex: 6, rarity: 'P5', displayName: '末梢幼芽', spriteKey: variantKey('解剖學', 6), description: '才剛伸出第一條感覺纖維的 DRG 幼元,對痛覺仍格外敏感。' },
  { familyId: '生理學', slotIndex: 6, rarity: 'P5', displayName: '皮層實習主管', spriteKey: variantKey('生理學', 6), description: '剛分化的 L5 見習元,投射軸突還沒找到 thalamus 的門牌。' },
  { familyId: '胚胎學', slotIndex: 6, rarity: 'P5', displayName: '邊緣帶新兵', spriteKey: variantKey('胚胎學', 6), description: '初抵 marginal zone 的 Cajal-Retzius 幼元,手裡的 Reelin 還沒拆封。' },
  { familyId: '微生物學', slotIndex: 6, rarity: 'P5', displayName: '嗅球幼生', spriteKey: variantKey('微生物學', 6), description: '基底膜上最年輕的 OSN,第一次被外界氣味嗆得睜不開核仁。' },

  // ─── Mid-tier deepening (expand-neuron-variant-catalog, D1 Option A) ────────
  // +3 slots per family at slotIndex 7/8/9 (rarity P4/P3/P2) — a SECOND variant
  // of each mid tier, thickening the pyramid's middle (77 → 110). New personas are
  // additional career-stages of the family's already-anchored neuron type (no new
  // neuroscience claims; mechanisms reuse the established slot-1..5 anchors).
  // Per family the tier counts become P0×1 / P1×1 / P2×2 / P3×2 / P4×2 / P5×2 = 10.

  // 藥理學 — VTA Dopaminergic (DA)
  { familyId: '藥理學', slotIndex: 7, rarity: 'P4', displayName: '渴望編碼員', spriteKey: variantKey('藥理學', 7), description: '學會把「想要」的訊號編碼進 phasic burst,預期報酬時就先點亮核仁。' },
  { familyId: '藥理學', slotIndex: 8, rarity: 'P3', displayName: '動機放大器', spriteKey: variantKey('藥理學', 8), description: '熟練在動機低落時加碼多巴胺脈衝,把猶豫一把推成行動。' },
  { familyId: '藥理學', slotIndex: 9, rarity: 'P2', displayName: '成癮迴路智者', spriteKey: variantKey('藥理學', 9), description: '看遍 incentive salience 的高低起伏,懂得在過度刺激前自我節流。' },

  // 公共衛生學 — SNc Dopaminergic (DA)
  { familyId: '公共衛生學', slotIndex: 7, rarity: 'P4', displayName: '節律維穩員', spriteKey: variantKey('公共衛生學', 7), description: '在 putamen 維持穩定 tonic firing,讓每個動作起步都不卡頓。' },
  { familyId: '公共衛生學', slotIndex: 8, rarity: 'P3', displayName: '自噬守衛', spriteKey: variantKey('公共衛生學', 8), description: '勤於清除受損粒線體,用 autophagy 延緩黑質的退化時鐘。' },
  { familyId: '公共衛生學', slotIndex: 9, rarity: 'P2', displayName: '黑質長壽智者', spriteKey: variantKey('公共衛生學', 9), description: '歷經數十年仍維持完整 dopamine 合成,是抗退化的活字典。' },

  // 寄生蟲學 — Enteric Serotonergic (5HT)
  { familyId: '寄生蟲學', slotIndex: 7, rarity: 'P4', displayName: '黏膜節律工', spriteKey: variantKey('寄生蟲學', 7), description: '調校腸黏膜 5-HT 釋放,讓分節運動準時開合。' },
  { familyId: '寄生蟲學', slotIndex: 8, rarity: 'P3', displayName: '迷走線報員', spriteKey: variantKey('寄生蟲學', 8), description: '透過 vagal afferent 把腸道狀態悄悄上報腦幹,連騷動都瞞不過。' },
  { familyId: '寄生蟲學', slotIndex: 9, rarity: 'P2', displayName: '菌相外交官', spriteKey: variantKey('寄生蟲學', 9), description: '與 microbiota 周旋談判,在被寄生蟲拉扯時仍守住腸-腦訊號。' },

  // 組織學 — MRN Serotonergic (5HT)
  { familyId: '組織學', slotIndex: 7, rarity: 'P4', displayName: '慢波調溫員', spriteKey: variantKey('組織學', 7), description: '在慢波睡眠期微調 5-HT 張力,替大腦設定夜間的恆溫基線。' },
  { familyId: '組織學', slotIndex: 8, rarity: 'P3', displayName: '焦慮緩衝師', spriteKey: variantKey('組織學', 8), description: '在杏仁核過載前釋出血清素,把驚慌按回穩定基線。' },
  { familyId: '組織學', slotIndex: 9, rarity: 'P2', displayName: '晝夜節律協調者', spriteKey: variantKey('組織學', 9), description: '統合中縫核與生理時鐘的時序,讓情緒隨晝夜溫柔起伏。' },

  // 生物化學 — Cerebellar Purkinje (GABA)
  { familyId: '生物化學', slotIndex: 7, rarity: 'P4', displayName: '抑制權重師', spriteKey: variantKey('生物化學', 7), description: '精算 GABA 輸出強度,替深部小腦核設定剛剛好的剎車力道。' },
  { familyId: '生物化學', slotIndex: 8, rarity: 'P3', displayName: '誤差回授工', spriteKey: variantKey('生物化學', 8), description: '讀取 climbing fiber 的 error signal,逐次修正運動預測的偏差。' },
  { familyId: '生物化學', slotIndex: 9, rarity: 'P2', displayName: '運動模型大師', spriteKey: variantKey('生物化學', 9), description: '在腦中建構肢體的內部模型,動作未出手就已先算好軌跡。' },

  // 病理學 — Striatal MSN (GABA)
  { familyId: '病理學', slotIndex: 7, rarity: 'P4', displayName: '多巴胺取證員', spriteKey: variantKey('病理學', 7), description: '比對 D1/D2 訊號落差,為每個行為蒐集該不該執行的證據。' },
  { familyId: '病理學', slotIndex: 8, rarity: 'P3', displayName: '習慣編纂官', spriteKey: variantKey('病理學', 8), description: '把反覆出現的動作寫成基底節的程序記憶判例。' },
  { familyId: '病理學', slotIndex: 9, rarity: 'P2', displayName: '衝動量刑大師', spriteKey: variantKey('病理學', 9), description: '在衝動與克制之間精算量刑,讓 go 與 no-go 各得其所。' },

  // 免疫學 — PV+ Cortical Interneuron (GABA)
  { familyId: '免疫學', slotIndex: 7, rarity: 'P4', displayName: '節律校時員', spriteKey: variantKey('免疫學', 7), description: '把零散的 40Hz 脈衝對齊成整齊的 gamma 方陣。' },
  { familyId: '免疫學', slotIndex: 8, rarity: 'P3', displayName: '受體守關人', spriteKey: variantKey('免疫學', 8), description: '在 NMDAR 被抗體圍攻時,死守突觸後膜的訊號完整。' },
  { familyId: '免疫學', slotIndex: 9, rarity: 'P2', displayName: '同步指揮大師', spriteKey: variantKey('免疫學', 9), description: '統御整片皮質的 gamma 同步,連免疫風暴中也不亂節拍。' },

  // 解剖學 — DRG Sensory Afferent (Glu)
  { familyId: '解剖學', slotIndex: 7, rarity: 'P4', displayName: '觸壓校準工', spriteKey: variantKey('解剖學', 7), description: '微調機械受體閾值,分辨輕觸與重壓之間的細微差別。' },
  { familyId: '解剖學', slotIndex: 8, rarity: 'P3', displayName: '本體覺領航員', spriteKey: variantKey('解剖學', 8), description: '整合肌梭與關節訊號,讓身體隨時知道四肢在哪。' },
  { familyId: '解剖學', slotIndex: 9, rarity: 'P2', displayName: '感覺整合大師', spriteKey: variantKey('解剖學', 9), description: '把痛溫觸壓本體覺融成單一身體影像,毫秒級回報中樞。' },

  // 生理學 — Cortical Pyramidal L5 (Glu)
  { familyId: '生理學', slotIndex: 7, rarity: 'P4', displayName: '輸出排程工', spriteKey: variantKey('生理學', 7), description: '安排 corticofugal 訊號的優先順序,讓最重要的指令先發車。' },
  { familyId: '生理學', slotIndex: 8, rarity: 'P3', displayName: '注意力調度官', spriteKey: variantKey('生理學', 8), description: '動態分配皮層資源,把算力導向當下最該關注的目標。' },
  { familyId: '生理學', slotIndex: 9, rarity: 'P2', displayName: '決策整合大師', spriteKey: variantKey('生理學', 9), description: '匯流多腦區的證據與動機,做出整個皮層都服從的裁示。' },

  // 胚胎學 — Cajal-Retzius (Glu)
  { familyId: '胚胎學', slotIndex: 7, rarity: 'P4', displayName: '遷移嚮導', spriteKey: variantKey('胚胎學', 7), description: '沿 radial glia 為後到的神經元標記正確的落腳樓層。' },
  { familyId: '胚胎學', slotIndex: 8, rarity: 'P3', displayName: '皮層測量師', spriteKey: variantKey('胚胎學', 8), description: '校準 inside-out 分層的厚薄,確保每一層都不偏移。' },
  { familyId: '胚胎學', slotIndex: 9, rarity: 'P2', displayName: '發育藍圖大師', spriteKey: variantKey('胚胎學', 9), description: '統籌 neurogenesis 的時序與梯度,把皮層藍圖一筆筆落實。' },

  // 微生物學 — Olfactory Sensory (Glu)
  { familyId: '微生物學', slotIndex: 7, rarity: 'P4', displayName: '受體輪替工', spriteKey: variantKey('微生物學', 7), description: '在嗅上皮持續汰換更新 OSN,維持嗅覺受體庫的多樣。' },
  { familyId: '微生物學', slotIndex: 8, rarity: 'P3', displayName: '揮發物追蹤員', spriteKey: variantKey('微生物學', 8), description: '追蹤空氣中的揮發性代謝物,鎖定潛在病原的來源方向。' },
  { familyId: '微生物學', slotIndex: 9, rarity: 'P2', displayName: '黏膜防線大師', spriteKey: variantKey('微生物學', 9), description: '協調嗅黏膜免疫與菌相,把上呼吸道守成第一道氣味長城。' },

  // ─── 二回目 location variants (slotIndex 10..19 per family, isLocation) ──────
  ...LOCATION_VARIANTS,
]

/** Public catalog — `rarity` is authored per entry (decoupled from slotIndex). */
export const NEURON_VARIANT_CATALOG: NeuronVariantDef[] = RAW_CATALOG

/** Number of variants the catalog declares for each family (pyramid total). */
export const VARIANT_COUNT_BY_FAMILY: Record<string, number> =
  NEURON_VARIANT_CATALOG.reduce<Record<string, number>>((acc, e) => {
    acc[e.familyId] = (acc[e.familyId] ?? 0) + 1
    return acc
  }, {})

/** Total variants the catalog declares (the open-collection finite total). Single
 * canonical source — consumers (Overview chip denominator, character card, leaderboard
 * opt-in copy) import this instead of recomputing `NEURON_VARIANT_CATALOG.length`. */
export const NEURON_VARIANT_TOTAL = NEURON_VARIANT_CATALOG.length

/** Tier order from commonest (P5) to rarest (P0) — for the pyramid invariant. */
const RARITY_COMMON_TO_RARE: Rarity[] = ['P5', 'P4', 'P3', 'P2', 'P1', 'P0']

/**
 * Build-time guard (pyramid model). Per family: exactly one P0 at slotIndex 0;
 * contiguous unique `slotIndex 0..N-1`; explicit `rarity ∈ {P0..P5}`; the pyramid
 * invariant (a rarer tier holds no more variants than the commoner tier below it);
 * non-empty fields; canonical spriteKey. Throws at module load on any violation.
 */
function assertCatalogShape(catalog: NeuronVariantDef[]): void {
  const byFamily = new Map<string, NeuronVariantDef[]>()
  const seen = new Set<string>()
  for (const entry of catalog) {
    if (!FAMILY_IDS.includes(entry.familyId as (typeof FAMILY_IDS)[number])) {
      throw new Error(`[neuron-variant-catalog] unknown familyId "${entry.familyId}"`)
    }
    if (!['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].includes(entry.rarity)) {
      throw new Error(
        `[neuron-variant-catalog] entry ${entry.familyId}:${entry.slotIndex} has invalid rarity "${entry.rarity}"`,
      )
    }
    if (entry.slotIndex === 0 && entry.rarity !== 'P0') {
      throw new Error(
        `[neuron-variant-catalog] entry ${entry.familyId}:0 must be the P0 apex (got "${entry.rarity}")`,
      )
    }
    if (entry.rarity === 'P0' && entry.slotIndex !== 0) {
      throw new Error(
        `[neuron-variant-catalog] P0 entry ${entry.familyId}:${entry.slotIndex} must live at slotIndex 0`,
      )
    }
    if (!entry.displayName || !entry.spriteKey || !entry.description) {
      throw new Error(
        `[neuron-variant-catalog] entry ${entry.familyId}:${entry.slotIndex} has empty displayName / spriteKey / description`,
      )
    }
    const expectedSpriteKey = `variant:${entry.familyId}:${entry.slotIndex}`
    if (entry.spriteKey !== expectedSpriteKey) {
      throw new Error(
        `[neuron-variant-catalog] entry ${entry.familyId}:${entry.slotIndex} spriteKey must equal "${expectedSpriteKey}" (got "${entry.spriteKey}")`,
      )
    }
    const key = `${entry.familyId}|${entry.slotIndex}`
    if (seen.has(key)) {
      throw new Error(`[neuron-variant-catalog] duplicate entry ${key}`)
    }
    seen.add(key)
    const list = byFamily.get(entry.familyId) ?? []
    list.push(entry)
    byFamily.set(entry.familyId, list)
  }
  for (const familyId of FAMILY_IDS) {
    const list = byFamily.get(familyId)
    if (!list || list.length === 0) {
      throw new Error(`[neuron-variant-catalog] family "${familyId}" has no variants`)
    }
    // Exactly one P0 apex.
    const p0Count = list.filter((e) => e.rarity === 'P0').length
    if (p0Count !== 1) {
      throw new Error(
        `[neuron-variant-catalog] family "${familyId}" must have exactly one P0 (got ${p0Count})`,
      )
    }
    // Contiguous unique slotIndex 0..N-1.
    const slots = list.map((e) => e.slotIndex).sort((a, b) => a - b)
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] !== i) {
        throw new Error(
          `[neuron-variant-catalog] family "${familyId}" slotIndex values must be contiguous 0..${slots.length - 1} (got [${slots.join(',')}])`,
        )
      }
    }
    // Pyramid invariant: rarer tier ≤ commoner tier count. 二回目 location
    // variants (isLocation) are deterministic position unlocks, NOT rarity-pyramid
    // rolls — they are excluded from the tier counts (add-neurons-maze-second-lap-variants).
    const countByTier = (r: Rarity): number =>
      list.filter((e) => e.rarity === r && !e.isLocation).length
    for (let i = 1; i < RARITY_COMMON_TO_RARE.length; i++) {
      const commoner = countByTier(RARITY_COMMON_TO_RARE[i - 1])
      const rarer = countByTier(RARITY_COMMON_TO_RARE[i])
      if (rarer > commoner) {
        throw new Error(
          `[neuron-variant-catalog] family "${familyId}" violates pyramid invariant: ${RARITY_COMMON_TO_RARE[i]} (${rarer}) > ${RARITY_COMMON_TO_RARE[i - 1]} (${commoner})`,
        )
      }
    }
  }
}

assertCatalogShape(NEURON_VARIANT_CATALOG)

/**
 * Compose final persisted displayName from catalog entry + rolled rarity.
 * E.g. ("初代代謝師", "P2") → "初代代謝師 · 共振核心".
 */
export function composeVariantDisplayName(
  catalogDisplayName: string,
  rarity: Rarity,
): string {
  return `${catalogDisplayName} · ${DEFAULT_VARIANT_TITLE_BY_RARITY[rarity]}`
}

/**
 * Effective per-pull P0 probability given the family's monotonic pull count.
 * Base rate until `P0_PITY_START`, then ramps `P0_PITY_RAMP` per pull, clamped to
 * [0, 1] (near-guaranteed by ~pull 60). Pure — dogfood-tune the three constants.
 */
export function effectiveP0Rate(pullCount: number): number {
  const ramped = P0_BASE_RATE + Math.max(0, pullCount - P0_PITY_START) * P0_PITY_RAMP
  return Math.min(1, Math.max(0, ramped))
}

/**
 * Effective per-pull P1 SILENT soft-pity probability given the family's pull
 * count. No base rate (0 before `P1_PITY_START`), then ramps `P1_PITY_RAMP` per
 * pull, clamped to [0, 1]. Mirrors `effectiveP0Rate` but exists only to guarantee
 * the lone P1 converges; applied silently (no surfaced floor flag). Pure.
 */
export function effectiveP1Rate(pullCount: number): number {
  const ramped = Math.max(0, pullCount - P1_PITY_START) * P1_PITY_RAMP
  return Math.min(1, Math.max(0, ramped))
}

/**
 * Roll a rarity for a pull (Collection 2.0). P0 is offered first with its
 * soft-pity rate UNLESS the family already owns its P0 (then P0 is excluded and
 * its mass falls to the P1–P5 proportional roll). Next, while the family does NOT
 * own its P1, a SILENT P1 soft-pity is applied (`effectiveP1Rate`) to converge the
 * lone 1.3%-weight P1 — this is invisible to the player (the caller sets no
 * pity-floor flag for it). Remaining tiers are weight-rolled from
 * `VARIANT_RARITY_WEIGHTS` (excluding P0). Pure; inject `rng` for tests.
 */
export function rollRarityWithP0Pity(
  pullCount: number,
  p0Owned: boolean,
  p1Owned: boolean = false,
  rng: () => number = Math.random,
): Rarity {
  if (!p0Owned && rng() < effectiveP0Rate(pullCount)) return 'P0'
  if (!p1Owned && rng() < effectiveP1Rate(pullCount)) return 'P1'
  const tiers = VARIANT_RARITY_WEIGHTS.filter((t) => t.id !== 'P0')
  const total = tiers.reduce((sum, t) => sum + t.weight, 0)
  let r = rng() * total
  for (const tier of tiers) {
    r -= tier.weight
    if (r < 0) return tier.id
  }
  return tiers[tiers.length - 1].id
}
