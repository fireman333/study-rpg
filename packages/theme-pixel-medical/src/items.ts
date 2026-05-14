/**
 * Medical-themed starter item catalog (renamed 2026-05-14 per OpenSpec change
 * `rename-items-to-medical-terms`).
 *
 * Distribution: N=8, R=6, SR=4, SSR=1, UR=1 = 20 items total.
 * Slot ↔ medical category fixed mapping (see design.md of the rename change):
 *   - head      → receptor / target
 *   - body      → drug class
 *   - weapon    → specific drug (named molecule)
 *   - charm     → mechanism keyword
 *   - consumable → adverse effect / metabolic concept
 *
 * Names are surfaced from 藥理學 past exam questions (extract-pharma-terms.ts
 * → items.terms.json). `sourceQuestionIds` records which questions seeded
 * each name; used for debug / educational inspection, never UI-displayed.
 */

import type { Item } from '@study-rpg/core'

export const ITEM_CATALOG: Item[] = [
  // ─── HEAD (receptor / target) — 3 items ──────────────────────────────────
  {
    id: 'item:alpha1-adrenergic-n',
    name: 'α1-adrenergic',
    rarity: 'N',
    slot: 'head',
    effects: [{ stat: { name: 'reflex', delta: 1 } }],
    artKey: 'hairband',
    flavor: '血管收縮的開關，按下去就升壓。',
    sourceQuestionIds: ['106-1-醫學二-藥理學-Q68'],
  },
  {
    id: 'item:nmda-receptor-r',
    name: 'NMDA receptor',
    rarity: 'R',
    slot: 'head',
    effects: [{ stat: { name: 'knowledge', delta: 3 } }, { multiplier: { type: 'critRate', value: 1.1 } }],
    artKey: 'goggles',
    flavor: 'Ketamine 跟記憶都靠它。',
    sourceQuestionIds: ['106-1-醫學二-藥理學-Q59', '113-1-醫學二-藥理學-Q73'],
  },
  {
    id: 'item:gaba-a-receptor-sr',
    name: 'GABA-A receptor',
    rarity: 'SR',
    slot: 'head',
    effects: [{ stat: { name: 'knowledge', delta: 6 } }, { multiplier: { type: 'quizXp', value: 1.15 } }],
    artKey: 'graduation-cap',
    flavor: '失眠、抗焦慮、麻醉都認它。',
    sourceQuestionIds: ['107-1-醫學二-藥理學-Q72', '110-1-醫學二-藥理學-Q56'],
  },

  // ─── BODY (drug class) — 3 items ─────────────────────────────────────────
  {
    id: 'item:nsaid-n',
    name: 'NSAID',
    rarity: 'N',
    slot: 'body',
    effects: [{ stat: { name: 'stamina', delta: 2 } }],
    artKey: 'scrubs',
    flavor: '消炎止痛，胃會痛、腎會壞。',
    sourceQuestionIds: ['106-2-醫學二-藥理學-Q71', '106-1-醫學二-藥理學-Q57'],
  },
  {
    id: 'item:beta-blocker-r',
    name: 'β-blocker',
    rarity: 'R',
    slot: 'body',
    effects: [{ stat: { name: 'stamina', delta: 4 } }, { multiplier: { type: 'readingSpeed', value: 1.1 } }],
    artKey: 'whitecoat',
    flavor: '心衰、高血壓、表現焦慮萬靈丹。',
    sourceQuestionIds: ['106-2-醫學二-藥理學-Q67', '106-1-醫學二-藥理學-Q65'],
  },
  {
    id: 'item:statin-sr',
    name: 'Statin',
    rarity: 'SR',
    slot: 'body',
    effects: [{ stat: { name: 'stamina', delta: 8 } }, { multiplier: { type: 'bossXp', value: 1.15 } }],
    artKey: 'gold-whitecoat',
    flavor: '降膽固醇神器，注意肌肉痛。',
    sourceQuestionIds: ['107-2-醫學二-藥理學-Q65'],
  },

  // ─── WEAPON (specific drug) — 5 items ────────────────────────────────────
  {
    id: 'item:acetaminophen-n',
    name: 'Acetaminophen',
    rarity: 'N',
    slot: 'weapon',
    effects: [{ stat: { name: 'reflex', delta: 1 } }],
    artKey: 'pencil',
    flavor: '普拿疼，發燒先吃這顆。',
    sourceQuestionIds: ['106-2-醫學二-藥理學-Q71', '109-1-醫學二-藥理學-Q57'],
  },
  {
    id: 'item:atropine-n',
    name: 'Atropine',
    rarity: 'N',
    slot: 'weapon',
    effects: [{ stat: { name: 'reflex', delta: 2 } }],
    artKey: 'reflex-hammer',
    flavor: '心搏過慢的急救救星。',
    sourceQuestionIds: ['106-1-醫學二-藥理學-Q56'],
  },
  {
    id: 'item:aspirin-r',
    name: 'Aspirin',
    rarity: 'R',
    slot: 'weapon',
    effects: [{ stat: { name: 'reflex', delta: 4 } }, { stat: { name: 'knowledge', delta: 1 } }],
    artKey: 'stethoscope',
    flavor: '心梗、預防、止痛，全能老兵。',
    sourceQuestionIds: ['106-1-醫學二-藥理學-Q57'],
  },
  {
    id: 'item:morphine-r',
    name: 'Morphine',
    rarity: 'R',
    slot: 'weapon',
    effects: [{ stat: { name: 'reflex', delta: 5 } }],
    artKey: 'scalpel',
    flavor: '止痛之王，呼吸抑制要小心。',
    sourceQuestionIds: ['106-1-醫學二-藥理學-Q70', '113-1-醫學二-藥理學-Q73'],
  },
  {
    id: 'item:warfarin-sr',
    name: 'Warfarin',
    rarity: 'SR',
    slot: 'weapon',
    effects: [{ stat: { name: 'reflex', delta: 8 } }, { stat: { name: 'knowledge', delta: 3 } }],
    artKey: 'littmann-cardio',
    flavor: 'INR 沒控好就是腦出血。',
    sourceQuestionIds: ['106-1-醫學二-藥理學-Q60', '109-2-醫學二-藥理學-Q51'],
  },

  // ─── CHARM (mechanism keyword) — 6 items ─────────────────────────────────
  {
    id: 'item:cox-2-n',
    name: 'COX-2',
    rarity: 'N',
    slot: 'charm',
    effects: [{ stat: { name: 'memory', delta: 1 } }],
    artKey: 'notebook',
    flavor: '消炎不傷胃的那一條路。',
    sourceQuestionIds: ['106-1-醫學二-藥理學-Q57'],
  },
  {
    id: 'item:partial-agonist-n',
    name: 'Partial agonist',
    rarity: 'N',
    slot: 'charm',
    effects: [{ stat: { name: 'knowledge', delta: 1 } }],
    artKey: 'school-badge',
    flavor: '不上不下，剛剛好的拮抗。',
    sourceQuestionIds: ['107-1-醫學二-藥理學-Q53'],
  },
  {
    id: 'item:hmg-coa-reductase-r',
    name: 'HMG-CoA reductase',
    rarity: 'R',
    slot: 'charm',
    effects: [{ stat: { name: 'memory', delta: 3 } }],
    artKey: 'gauze',
    flavor: 'Statin 鎖死的那把酶。',
    sourceQuestionIds: ['107-2-醫學二-藥理學-Q65'],
  },
  {
    id: 'item:cyclooxygenase-sr',
    name: 'Cyclooxygenase',
    rarity: 'SR',
    slot: 'charm',
    effects: [{ stat: { name: 'knowledge', delta: 8 } }, { stat: { name: 'memory', delta: 4 } }],
    artKey: 'robbins',
    flavor: 'NSAID 全家共同的剎車。',
    sourceQuestionIds: ['106-1-醫學二-藥理學-Q57'],
  },
  {
    id: 'item:digoxin-toxicity-ssr',
    name: 'Digoxin therapeutic window',
    rarity: 'SSR',
    slot: 'charm',
    effects: [
      { stat: { name: 'knowledge', delta: 12 } },
      { stat: { name: 'memory', delta: 8 } },
      { multiplier: { type: 'critRate', value: 1.25 } },
    ],
    artKey: 'signed-pass',
    flavor: '治療窗超窄，過量看到黃綠光。',
    sourceQuestionIds: ['106-1-醫學二-藥理學-Q60'],
  },
  {
    id: 'item:cytochrome-p450-ur',
    name: 'Cytochrome P450',
    rarity: 'UR',
    slot: 'charm',
    effects: [
      { stat: { name: 'knowledge', delta: 20 } },
      { stat: { name: 'reflex', delta: 10 } },
      { stat: { name: 'memory', delta: 10 } },
      { stat: { name: 'stamina', delta: 10 } },
      { multiplier: { type: 'luck', value: 2.0 } },
    ],
    artKey: 'hippocrates-charm',
    flavor: '所有藥物交互作用的元兇。',
    sourceQuestionIds: ['109-2-醫學二-藥理學-Q51'],
  },

  // ─── CONSUMABLE (adverse effect / metabolic concept) — 3 items ───────────
  {
    id: 'item:first-pass-effect-n',
    name: 'First-pass effect',
    rarity: 'N',
    slot: 'consumable',
    effects: [{ multiplier: { type: 'readingSpeed', value: 1.5, durationMs: 30 * 60_000 } }],
    artKey: 'coffee',
    flavor: '吃下去先被肝幹掉一半。',
  },
  {
    id: 'item:tolerance-n',
    name: 'Tolerance',
    rarity: 'N',
    slot: 'consumable',
    effects: [{ stat: { name: 'hp', delta: 10 } }],
    artKey: 'apple',
    flavor: '越吃越沒效，劑量越拉越高。',
    sourceQuestionIds: ['106-2-醫學二-藥理學-Q58'],
  },
  {
    id: 'item:serotonin-syndrome-r',
    name: 'Serotonin syndrome',
    rarity: 'R',
    slot: 'consumable',
    effects: [{ multiplier: { type: 'quizXp', value: 1.2, durationMs: 60 * 60_000 } }],
    artKey: 'senior-notes',
    flavor: '兩種抗憂鬱合用的死亡警告。',
    sourceQuestionIds: ['110-1-醫學二-藥理學-Q56'],
  },
]
