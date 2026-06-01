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

export type Rarity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

export type SlotIndex = 1 | 2 | 3 | 4 | 5

export interface NeuronVariantDef {
  familyId: string
  slotIndex: SlotIndex
  /** Unique persona name reflecting slot's narrative role within the family. */
  displayName: string
  spriteKey: string
  /** Player-facing 1-2 sentence flavour blurb. */
  description: string
}

export interface VariantRarityTier {
  id: Rarity
  weight: number
}

/**
 * Canonical weight table — P5 拉完了 = 60, P1 夯 = 1. Sums to 100. Mirrors
 * recruitment-gacha. Edit here for dogfood balance — single source of truth.
 */
export const VARIANT_RARITY_WEIGHTS: VariantRarityTier[] = [
  { id: 'P5', weight: 60 },
  { id: 'P4', weight: 25 },
  { id: 'P3', weight: 10 },
  { id: 'P2', weight: 4 },
  { id: 'P1', weight: 1 },
]

/**
 * Per-slot floor. Slot 4 → P3 minimum; slot 5 → P2 minimum. Slots 1-3 no floor.
 */
export const SLOT_RARITY_FLOOR: Record<SlotIndex, Rarity | null> = {
  1: null,
  2: null,
  3: null,
  4: 'P3',
  5: 'P2',
}

export const VARIANT_REROLL_CAP = 5

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

export const NEURON_VARIANT_CATALOG: NeuronVariantDef[] = [
  // 藥理學 — VTA Dopaminergic — Thrill-Seeker (DA)
  {
    familyId: '藥理學',
    slotIndex: 1,
    displayName: '初代代謝師',
    spriteKey: variantKey('藥理學', 1),
    description: '剛踏入獎賞迴路的 VTA 多巴胺新兵，對任何刺激都瞪大了核仁。',
  },
  {
    familyId: '藥理學',
    slotIndex: 2,
    displayName: '受體調諧者',
    spriteKey: variantKey('藥理學', 2),
    description: '學會微調 D1 / D2 受體密度，懂得在伏隔核內把訊號量得剛剛好。',
  },
  {
    familyId: '藥理學',
    slotIndex: 3,
    displayName: '突觸快樂使者',
    spriteKey: variantKey('藥理學', 3),
    description: '熟練投放多巴胺脈衝，讓報酬訊號精準擊中下游 MSN。',
  },
  {
    familyId: '藥理學',
    slotIndex: 4,
    displayName: '多巴胺脈衝大師',
    spriteKey: variantKey('藥理學', 4),
    description: '能在複雜情境下選擇 tonic 或 phasic 模式，是 mesolimbic 的指揮家。',
  },
  {
    familyId: '藥理學',
    slotIndex: 5,
    displayName: '報酬迴路之王',
    spriteKey: variantKey('藥理學', 5),
    description: '整個獎賞系統圍繞此元振動，傳說一次點火可重寫多巴胺地圖。',
  },

  // 公共衛生學 — SNc Dopaminergic — Aging Guardian (DA)
  {
    familyId: '公共衛生學',
    slotIndex: 1,
    displayName: '黑質學徒',
    spriteKey: variantKey('公共衛生學', 1),
    description: '剛分化的 SNc 多巴胺元，初次嘗試在 putamen 維持背景張力。',
  },
  {
    familyId: '公共衛生學',
    slotIndex: 2,
    displayName: '紋狀體巡守者',
    spriteKey: variantKey('公共衛生學', 2),
    description: '熟悉基底節地形，能在運動皮質訊號到達前先預熱迴路。',
  },
  {
    familyId: '公共衛生學',
    slotIndex: 3,
    displayName: '抗老哨兵',
    spriteKey: variantKey('公共衛生學', 3),
    description: '抵禦 α-synuclein 聚集，每天提醒自己不被 oxidative stress 帶走。',
  },
  {
    familyId: '公共衛生學',
    slotIndex: 4,
    displayName: '黑質運動大師',
    spriteKey: variantKey('公共衛生學', 4),
    description: '在 70 歲仍能維持完整 nigrostriatal 投射，是抗 Parkinson 的標桿。',
  },
  {
    familyId: '公共衛生學',
    slotIndex: 5,
    displayName: '永恆守護者',
    spriteKey: variantKey('公共衛生學', 5),
    description: '神話等級的 SNc 元，傳說中可讓宿主的黑質永不退化。',
  },

  // 寄生蟲學 — Enteric Serotonergic — Puppeteer's Puppet (5HT)
  {
    familyId: '寄生蟲學',
    slotIndex: 1,
    displayName: '腸黏膜學徒',
    spriteKey: variantKey('寄生蟲學', 1),
    description: '剛遷移到腸壁的 5-HT 元，學著感受食糜流動的節奏。',
  },
  {
    familyId: '寄生蟲學',
    slotIndex: 2,
    displayName: '蠕動信號員',
    spriteKey: variantKey('寄生蟲學', 2),
    description: '能精準控制平滑肌節律，讓上下兩端的 peristalsis 同步。',
  },
  {
    familyId: '寄生蟲學',
    slotIndex: 3,
    displayName: '宿主信使',
    spriteKey: variantKey('寄生蟲學', 3),
    description: '被弓蟲或鞭蟲微妙劫持，但仍勉強傳出原本的腸-腦訊號。',
  },
  {
    familyId: '寄生蟲學',
    slotIndex: 4,
    displayName: '腦腸軸操偶師',
    spriteKey: variantKey('寄生蟲學', 4),
    description: '精通迷走神經跨系統通訊，連寄生蟲都得敬讓三分。',
  },
  {
    familyId: '寄生蟲學',
    slotIndex: 5,
    displayName: '共生終極對話者',
    spriteKey: variantKey('寄生蟲學', 5),
    description: '與 microbiota 達成傳奇級代謝協作，連 Toxoplasma 也願意守規矩。',
  },

  // 組織學 — MRN Serotonergic — Quiet Curator (5HT)
  {
    familyId: '組織學',
    slotIndex: 1,
    displayName: '中縫初探者',
    spriteKey: variantKey('組織學', 1),
    description: '中縫核新成員，學著從腦幹發出第一束 5-HT 投射。',
  },
  {
    familyId: '組織學',
    slotIndex: 2,
    displayName: 'REM 守夜人',
    spriteKey: variantKey('組織學', 2),
    description: '在快速動眼期沉默以維持夢境的精緻平衡。',
  },
  {
    familyId: '組織學',
    slotIndex: 3,
    displayName: '情緒織錦師',
    spriteKey: variantKey('組織學', 3),
    description: '熟練編織前額葉的 5-HT 網絡，讓情緒紋理細緻而柔和。',
  },
  {
    familyId: '組織學',
    slotIndex: 4,
    displayName: '寧靜協奏大師',
    spriteKey: variantKey('組織學', 4),
    description: '同步整個腦幹的安靜節律，連杏仁核都會慢半拍。',
  },
  {
    familyId: '組織學',
    slotIndex: 5,
    displayName: '心境主宰',
    spriteKey: variantKey('組織學', 5),
    description: '神話級 5-HT 元，主宰整個 limbic 情緒域的長時段穩定。',
  },

  // 生物化學 — Cerebellar Purkinje — Mathematician (GABA)
  {
    familyId: '生物化學',
    slotIndex: 1,
    displayName: '初代算術員',
    spriteKey: variantKey('生物化學', 1),
    description: '剛從顆粒層上行的 Purkinje 學徒，第一次嘗試對位 climbing fiber。',
  },
  {
    familyId: '生物化學',
    slotIndex: 2,
    displayName: '樹突幾何師',
    spriteKey: variantKey('生物化學', 2),
    description: '掌握 planar dendritic tree 的對齊規律，每根樹突都在同一平面。',
  },
  {
    familyId: '生物化學',
    slotIndex: 3,
    displayName: '微分時序工',
    spriteKey: variantKey('生物化學', 3),
    description: '能計算 climbing fiber 與 parallel fiber 之間的微秒級時差。',
  },
  {
    familyId: '生物化學',
    slotIndex: 4,
    displayName: '小腦演算大師',
    spriteKey: variantKey('生物化學', 4),
    description: '精準預測運動學中的非線性偏差，連手抖都能即時校正。',
  },
  {
    familyId: '生物化學',
    slotIndex: 5,
    displayName: '平衡學至高神',
    spriteKey: variantKey('生物化學', 5),
    description: '整個 cerebellar cortex 圍繞此元同步,傳奇 Purkinje 的代表。',
  },

  // 病理學 — Striatal MSN — Judge (GABA)
  {
    familyId: '病理學',
    slotIndex: 1,
    displayName: '紋狀體陪審員',
    spriteKey: variantKey('病理學', 1),
    description: '新成員 MSN，剛學會判讀皮質下行訊號的真偽。',
  },
  {
    familyId: '病理學',
    slotIndex: 2,
    displayName: '直接路徑書記',
    spriteKey: variantKey('病理學', 2),
    description: 'D1+ MSN 學徒，仔細記錄基底節的「go」訊號。',
  },
  {
    familyId: '病理學',
    slotIndex: 3,
    displayName: '間接路徑審判官',
    spriteKey: variantKey('病理學', 3),
    description: 'D2+ MSN 中階,在不該行動時果斷發出「no-go」否決。',
  },
  {
    familyId: '病理學',
    slotIndex: 4,
    displayName: '行為仲裁大師',
    spriteKey: variantKey('病理學', 4),
    description: '能同時整合 direct 與 indirect 路徑,做出細膩的行為判決。',
  },
  {
    familyId: '病理學',
    slotIndex: 5,
    displayName: '終審法官',
    spriteKey: variantKey('病理學', 5),
    description: '基底節最後一道 GABA 守門人,所有運動決策都得經過此元簽核。',
  },

  // 免疫學 — PV+ Cortical Interneuron — Sentry Under Siege (GABA)
  {
    familyId: '免疫學',
    slotIndex: 1,
    displayName: '哨所新兵',
    spriteKey: variantKey('免疫學', 1),
    description: '剛分化的 parvalbumin+ 篩網元,還在學如何穩定 40Hz 點火。',
  },
  {
    familyId: '免疫學',
    slotIndex: 2,
    displayName: 'Gamma 振盪生手',
    spriteKey: variantKey('免疫學', 2),
    description: '能以 40Hz 維持基本節律,但遇到擾動還會打結。',
  },
  {
    familyId: '免疫學',
    slotIndex: 3,
    displayName: '圍城衛兵',
    spriteKey: variantKey('免疫學', 3),
    description: '在 anti-NMDAR 抗體入侵時仍堅守崗位,維持皮質網絡不崩潰。',
  },
  {
    familyId: '免疫學',
    slotIndex: 4,
    displayName: '抗體風暴老兵',
    spriteKey: variantKey('免疫學', 4),
    description: '經歷自體免疫圍攻仍能穩定 gamma 振盪,是免疫腦炎的倖存者。',
  },
  {
    familyId: '免疫學',
    slotIndex: 5,
    displayName: '皮質防線傳奇',
    spriteKey: variantKey('免疫學', 5),
    description: '神話級 PV+ 元,守住整個前額葉認知防線不被免疫風暴擊垮。',
  },

  // 解剖學 — DRG Sensory Afferent — Scout (Glu)
  {
    familyId: '解剖學',
    slotIndex: 1,
    displayName: '末梢新斥候',
    spriteKey: variantKey('解剖學', 1),
    description: '剛長出末梢的背根節元,正在試探皮膚與肌肉的界線。',
  },
  {
    familyId: '解剖學',
    slotIndex: 2,
    displayName: '體感地圖學徒',
    spriteKey: variantKey('解剖學', 2),
    description: '學會將皮膚刺激精準映射到對應脊髓節段。',
  },
  {
    familyId: '解剖學',
    slotIndex: 3,
    displayName: '痛溫雙頻偵察',
    spriteKey: variantKey('解剖學', 3),
    description: '能同時解讀 Aδ 與 C 纖維訊號,辨別銳痛與鈍痛來源。',
  },
  {
    familyId: '解剖學',
    slotIndex: 4,
    displayName: '全身雷達大師',
    spriteKey: variantKey('解剖學', 4),
    description: '整合 dermatome 全圖,任何皮膚事件都逃不過此元的監測。',
  },
  {
    familyId: '解剖學',
    slotIndex: 5,
    displayName: '神經感官至尊',
    spriteKey: variantKey('解剖學', 5),
    description: '從足底到指尖,此元能以毫秒級精度傳遞所有體感訊息。',
  },

  // 生理學 — Cortical Pyramidal L5 — CEO (Glu)
  {
    familyId: '生理學',
    slotIndex: 1,
    displayName: '皮層新任主管',
    spriteKey: variantKey('生理學', 1),
    description: '剛分化的 L5 錐體元,正在學習如何向下投射到 thalamus。',
  },
  {
    familyId: '生理學',
    slotIndex: 2,
    displayName: '投射策略工',
    spriteKey: variantKey('生理學', 2),
    description: '學會選擇性把訊號分配給 thalamic 與 spinal targets。',
  },
  {
    familyId: '生理學',
    slotIndex: 3,
    displayName: '跨腦區協調者',
    spriteKey: variantKey('生理學', 3),
    description: '能同時驅動 PFC 與 motor cortex,讓決策與動作對齊。',
  },
  {
    familyId: '生理學',
    slotIndex: 4,
    displayName: '大腦行政總裁',
    spriteKey: variantKey('生理學', 4),
    description: '整合多模態決策訊號,把整個皮質網絡當成自家辦公室調度。',
  },
  {
    familyId: '生理學',
    slotIndex: 5,
    displayName: '皮層至高指揮',
    spriteKey: variantKey('生理學', 5),
    description: '全皮層 L5 網絡的主帥,所有 corticofugal 訊號都從此元發出。',
  },

  // 胚胎學 — Cajal-Retzius — Pioneer Architect (Glu)
  {
    familyId: '胚胎學',
    slotIndex: 1,
    displayName: '皮層先鋒',
    spriteKey: variantKey('胚胎學', 1),
    description: '第一波抵達 marginal zone 的 Cajal-Retzius 元,獨自面對空白的皮層。',
  },
  {
    familyId: '胚胎學',
    slotIndex: 2,
    displayName: 'Reelin 鋪路者',
    spriteKey: variantKey('胚胎學', 2),
    description: '釋放 Reelin 為後續神經元鋪設遷移軌道,皮層分層從此開始。',
  },
  {
    familyId: '胚胎學',
    slotIndex: 3,
    displayName: '六層建築師',
    spriteKey: variantKey('胚胎學', 3),
    description: '主導 cortical lamina 的逐層成形,讓 L1-L6 各就各位。',
  },
  {
    familyId: '胚胎學',
    slotIndex: 4,
    displayName: '神經發育大師',
    spriteKey: variantKey('胚胎學', 4),
    description: '統籌整個 corticogenesis 流程,從前腦泡到成熟皮層都得仰賴此元。',
  },
  {
    familyId: '胚胎學',
    slotIndex: 5,
    displayName: '胚胎之初締造者',
    spriteKey: variantKey('胚胎學', 5),
    description: '大腦結構之父,神話中可在 GW7 之前就決定整個皮層的命運。',
  },

  // 微生物學 — Olfactory Sensory — Sentinel (Glu)
  {
    familyId: '微生物學',
    slotIndex: 1,
    displayName: '嗅球新生',
    spriteKey: variantKey('微生物學', 1),
    description: '剛從基底膜長出的 OSN,第一次面對外界數百萬種氣味。',
  },
  {
    familyId: '微生物學',
    slotIndex: 2,
    displayName: '氣味解碼工',
    spriteKey: variantKey('微生物學', 2),
    description: '學會分辨 ~400 種氣味受體所對應的化學特徵。',
  },
  {
    familyId: '微生物學',
    slotIndex: 3,
    displayName: '病原氣味哨兵',
    spriteKey: variantKey('微生物學', 3),
    description: '能偵測細菌代謝產物與真菌孢子,在感染前就送出預警。',
  },
  {
    familyId: '微生物學',
    slotIndex: 4,
    displayName: '鼻腔免疫大師',
    spriteKey: variantKey('微生物學', 4),
    description: '直接與 nasal microbiome 對話,維持上呼吸道的菌相平衡。',
  },
  {
    familyId: '微生物學',
    slotIndex: 5,
    displayName: '嗅覺守護神',
    spriteKey: variantKey('微生物學', 5),
    description: '永恆再生的傳奇 OSN,神話級對抗各種病原入侵嗅覺系統。',
  },
]

/**
 * Build-time guard: catalog SHALL contain exactly 55 entries (11 families × 5
 * slots) with non-empty displayName / spriteKey / description and slotIndex in
 * [1, 5]. Throws at module load on any violation.
 */
function assertCatalogShape(catalog: NeuronVariantDef[]): void {
  if (catalog.length !== 55) {
    throw new Error(
      `[neuron-variant-catalog] expected 55 entries (11 families × 5 slots), got ${catalog.length}`,
    )
  }
  const seen = new Set<string>()
  for (const entry of catalog) {
    if (!FAMILY_IDS.includes(entry.familyId as (typeof FAMILY_IDS)[number])) {
      throw new Error(`[neuron-variant-catalog] unknown familyId "${entry.familyId}"`)
    }
    if (![1, 2, 3, 4, 5].includes(entry.slotIndex)) {
      throw new Error(
        `[neuron-variant-catalog] entry ${entry.familyId}:${entry.slotIndex} has invalid slotIndex`,
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
  }
  for (const familyId of FAMILY_IDS) {
    for (const slotIndex of [1, 2, 3, 4, 5] as const) {
      if (!seen.has(`${familyId}|${slotIndex}`)) {
        throw new Error(`[neuron-variant-catalog] missing entry for ${familyId}:${slotIndex}`)
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
