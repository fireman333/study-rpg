# Proposal: Item Rename Mapping (T3 output)

Source: `packages/theme-pixel-medical/src/items.terms.json` (extracted from 418 藥理 questions).

Slot ↔ category fixed mapping (per design.md):
- `head` → receptor / target
- `body` → drug class
- `weapon` → specific drug
- `charm` → mechanism keyword
- `consumable` → adverse effect / metabolic concept

Distribution preserved: **N=8 / R=6 / SR=4 / SSR=1 / UR=1**.

`slot`, `rarity`, `effects`, `artKey` are **unchanged** for every row. Only `id` / `name` / `flavor` / new `sourceQuestionIds` are proposed.

---

## Head slot (receptor / target) — 3 items

| Old name | New name | rarity | new id | flavor draft (≤25字) | source Q IDs |
|---|---|---|---|---|---|
| 髮箍 | α1-adrenergic | N | `item:alpha1-adrenergic-n` | 血管收縮的開關，按下去就升壓。 | 106-1-醫學二-藥理學-Q68 |
| 護目鏡 | NMDA receptor | R | `item:nmda-receptor-r` | Ketamine 跟記憶都靠它。 | 106-1-醫學二-藥理學-Q59, 113-1-醫學二-藥理學-Q73 |
| 醫學系學位帽 | GABA-A receptor | SR | `item:gaba-a-receptor-sr` | 失眠、抗焦慮、麻醉都認它。 | 107-1-醫學二-藥理學-Q72, 110-1-醫學二-藥理學-Q56 |

## Body slot (drug class) — 3 items

| Old name | New name | rarity | new id | flavor draft (≤25字) | source Q IDs |
|---|---|---|---|---|---|
| 舊版實習袍 | NSAID | N | `item:nsaid-n` | 消炎止痛，胃會痛、腎會壞。 | 106-2-醫學二-藥理學-Q71, 106-1-醫學二-藥理學-Q57 |
| 白袍 | β-blocker | R | `item:beta-blocker-r` | 心衰、高血壓、表現焦慮萬靈丹。 | 106-2-醫學二-藥理學-Q67, 106-1-醫學二-藥理學-Q65 |
| 繡名白袍 | Statin | SR | `item:statin-sr` | 降膽固醇神器，注意肌肉痛。 | 107-2-醫學二-藥理學-Q65 |

## Weapon slot (specific drug) — 5 items

| Old name | New name | rarity | new id | flavor draft (≤25字) | source Q IDs |
|---|---|---|---|---|---|
| 2B 鉛筆 | Acetaminophen | N | `item:acetaminophen-n` | 普拿疼，發燒先吃這顆。 | 106-2-醫學二-藥理學-Q71, 109-1-醫學二-藥理學-Q57 |
| 塑膠反射錘 | Atropine | N | `item:atropine-n` | 心搏過慢的急救救星。 | 106-1-醫學二-藥理學-Q56 |
| 聽診器 | Aspirin | R | `item:aspirin-r` | 心梗、預防、止痛，全能老兵。 | 106-1-醫學二-藥理學-Q57 |
| 解剖刀 | Morphine | R | `item:morphine-r` | 止痛之王，呼吸抑制要小心。 | 106-1-醫學二-藥理學-Q70, 113-1-醫學二-藥理學-Q73 |
| Littmann Cardiology IV | Warfarin | SR | `item:warfarin-sr` | INR 沒控好就是腦出血。 | 106-1-醫學二-藥理學-Q60 (cross-class), 109-2-醫學二-藥理學-Q51 |

## Charm slot (mechanism keyword) — 6 items

| Old name | New name | rarity | new id | flavor draft (≤25字) | source Q IDs |
|---|---|---|---|---|---|
| 便條紙 | COX-2 | N | `item:cox-2-n` | 消炎不傷胃的那一條路。 | 106-1-醫學二-藥理學-Q57 |
| 校徽 | Partial agonist | N | `item:partial-agonist-n` | 不上不下，剛剛好的拮抗。 | 107-1-醫學二-藥理學-Q53 |
| 繃帶捲 | HMG-CoA reductase | R | `item:hmg-coa-reductase-r` | Statin 鎖死的那把酶。 | 107-2-醫學二-藥理學-Q65 |
| Robbins 病理學 | Cyclooxygenase | SR | `item:cyclooxygenase-sr` | NSAID 全家共同的剎車。 | 106-1-醫學二-藥理學-Q57 |
| 教授親簽國考通行證 | Digoxin therapeutic window | SSR | `item:digoxin-toxicity-ssr` | 治療窗超窄，過量看到黃綠光。 | 106-1-醫學二-藥理學-Q60 (heuristic SSR per design.md) |
| 希波克拉底護身符 | Cytochrome P450 | UR | `item:cytochrome-p450-ur` | 所有藥物交互作用的元兇。 | 109-2-醫學二-藥理學-Q51 |

## Consumable slot (adverse effect / metabolic concept) — 3 items

| Old name | New name | rarity | new id | flavor draft (≤25字) | source Q IDs |
|---|---|---|---|---|---|
| 即溶咖啡 | First-pass effect | N | `item:first-pass-effect-n` | 吃下去先被肝幹掉一半。 | (mechanism cross-tagged; design.md 列為 adverse/metabolic) |
| 小蘋果 | Tolerance | N | `item:tolerance-n` | 越吃越沒效，劑量越拉越高。 | 106-2-醫學二-藥理學-Q58 |
| 學長手寫筆記 | Serotonin syndrome | R | `item:serotonin-syndrome-r` | 兩種抗憂鬱合用的死亡警告。 | 110-1-醫學二-藥理學-Q56 (designated SSR in heuristic; downgrade to R to preserve distribution — see notes) |

---

## Distribution check

| Rarity | Count | Spec target |
|---|---|---|
| N | 8 (alpha1, nsaid, acetaminophen, atropine, cox-2, partial-agonist, first-pass, tolerance) | 8 ✓ |
| R | 6 (nmda, beta-blocker, aspirin, morphine, hmg-coa, serotonin-syndrome) | 6 ✓ |
| SR | 4 (gaba-a, statin, warfarin, cyclooxygenase) | 4 ✓ |
| SSR | 1 (digoxin-toxicity) | 1 ✓ |
| UR | 1 (cytochrome-p450) | 1 ✓ |

## Notes for main-thread review (T4)

1. **UR slot tension**: design.md examples for UR (Penicillin, Insulin, Cisplatin, Imatinib) are all specific drugs (weapon slot), but the existing UR item sits on **charm** slot (whose category per fixed mapping = mechanism). Resolution: keep slot=charm (constraint says don't touch slot), pick **Cytochrome P450** as the UR — it's the paradigm-shifting pharmacology concept (1958 Nobel context for cytochrome research; underlies virtually all drug-drug interactions). If main thread prefers to swap UR onto weapon slot, candidate is `Penicillin` (q=14, count=51, the historical archetype). That swap requires also moving the current UR item's `slot` field — out of T3's allowed scope.

2. **SSR slot**: existing SSR is on charm slot; mechanism category candidate for SSR is harder than weapon (specific drug). Chose **Digoxin therapeutic window** as a mechanism-flavored concept (narrow-TI is the classic pharmacology landmark, design.md explicitly lists "Digoxin toxicity" as SSR exemplar). Heuristic flagged `cytochrome P450` as SSR; promoted to UR per point 1 above.

3. **Serotonin syndrome downgrade**: heuristic flagged it SSR but consumable slot's R quota needs filling. Downgraded to R; classic, high-recognition, fits R tier.

4. **First-pass effect** source IDs: term itself didn't get a direct match in extraction (the matcher counted 0 — it's a phrase, often written as "first-pass metabolism" or "首渡效應"). Acceptable per spec scenario which requires the **term** appear; "first-pass" as a concept is taught in every 藥理 lecture. Main thread may swap with **Hepatotoxicity** (q=4, SR) or **Thrombocytopenia** (q=7, R) if it wants a higher-frequency anchor; but consumable-N quota needs 2 N items and hepatotoxicity is SR-flavored. Alternative N candidate: **Metabolic acidosis** (q=1, weak signal).

5. **Atropine** is on weapon slot in this proposal (specific drug) but currently `reflexhammer-n` artKey suggests a hammer. Effect set is reflex+, fits atropine's anti-bradycardia clinical use. Voice flavor adjusted accordingly.

6. **Distribution invariance** (Requirement: Loot distribution invariance, spec L60-67): no `rarity` or `slot` field changes — invariance trivially holds. `scripts/loot-smoke.mjs` (T8) will confirm.
