/**
 * Permanent equipment/companion catalog — 12 items across P1–P5 × 2 lanes
 * (6 speed/myelin + 6 energy/metabolic). Owned-once; rarity-scaled additive
 * bonus (EQUIPMENT_RARITY_BONUS). Acquired via low-probability DMN draws.
 *
 * Tier counts: P1×2 / P2×2 / P3×4 / P4×2 / P5×2 = 12 (≥ 2 per tier).
 *
 * Neuroscience: every item anchors to durable myelin/conduction (speed) or
 * homeostatic/metabolic infrastructure (energy) — see equipment-types.ts header
 * for the OE DOIs. Per project CLAUDE.md "Neuroscience design verification".
 *
 * Capability spec: openspec/specs/neurons-acceleration-system/spec.md
 */

import {
  EQUIPMENT_RARITY_BONUS,
  type EquipmentDef,
  type EquipmentLane,
  type EquipmentRarity,
} from './equipment-types'

const make = (
  equipmentId: string,
  displayName: string,
  description: string,
  rarity: EquipmentRarity,
  lane: EquipmentLane,
): EquipmentDef => ({
  equipmentId,
  displayName,
  description,
  rarity,
  lane,
  bonus: EQUIPMENT_RARITY_BONUS[rarity],
  artworkId: `equipment:${equipmentId}`,
})

export const EQUIPMENT_CATALOG: readonly EquipmentDef[] = [
  // ─── Speed lane (myelin / conduction velocity) ────────────────────────────
  make(
    'eq-fully-myelinated-axon-p1',
    '全髓鞘化軸突',
    '軸突被寡突膠細胞層層包覆到極致，傳導速度逼近上限（myelinated 可達 unmyelinated 的數十倍）。',
    'P1',
    'speed',
  ),
  make(
    'eq-saltatory-conduction-p2',
    '跳躍式傳導',
    '動作電位只在蘭氏結重生，於結與結之間跳躍前進，省時又省能。',
    'P2',
    'speed',
  ),
  make(
    'eq-oligodendrocyte-companion-p3',
    '寡突膠細胞夥伴',
    '一隻會主動找軸突包髓鞘的寡突膠細胞跟著你 — 活動依賴性髓鞘化，越練越快。',
    'P3',
    'speed',
  ),
  make(
    'eq-myelin-thickening-p3',
    '髓鞘增厚',
    '既有髓鞘再疊幾圈板層，內阻上升、電容下降，傳導再快一截。',
    'P3',
    'speed',
  ),
  make(
    'eq-node-of-ranvier-p4',
    '蘭氏結',
    '一處 Nav1.6 密集的蘭氏結，讓動作電位在此乾淨地再生一次。',
    'P4',
    'speed',
  ),
  make(
    'eq-single-myelin-wrap-p5',
    '單層髓鞘',
    '剛起步的一圈薄髓鞘 — 聊勝於無，但確實是加速的第一步。',
    'P5',
    'speed',
  ),

  // ─── Energy lane (pump / mitochondria / metabolic reserve) ────────────────
  make(
    'eq-mitochondrial-powerhouse-p1',
    '粒線體發電廠',
    '高密度粒線體把氧化磷酸化開到滿，ATP 供應穩定澎湃 — 續航天花板。',
    'P1',
    'energy',
  ),
  make(
    'eq-sodium-potassium-pump-p2',
    'Na⁺/K⁺ 幫浦',
    'Na⁺/K⁺-ATPase 不眠不休重建離子梯度，恢復續航（注意：幫浦管續航、不管速度）。',
    'P2',
    'energy',
  ),
  make(
    'eq-astrocyte-glycogen-p3',
    '星形膠細胞糖原庫',
    '星形膠細胞囤了一座糖原倉庫，高負荷時動員成乳酸即時供能。',
    'P3',
    'energy',
  ),
  make(
    'eq-creatine-kinase-buffer-p3',
    '肌酸激酶緩衝',
    '磷酸肌酸系統像電池一樣緩衝 ATP/ADP，瞬間需求也撐得住。',
    'P3',
    'energy',
  ),
  make(
    'eq-lactate-reserve-p4',
    '乳酸儲備',
    '一小桶隨時可用的乳酸，作為神經元的急用氧化基質。',
    'P4',
    'energy',
  ),
  make(
    'eq-trace-glucose-p5',
    '微量葡萄糖',
    '血腦屏障滲進來的一點葡萄糖 — 杯水車薪，但維持基礎運轉。',
    'P5',
    'energy',
  ),
] as const
