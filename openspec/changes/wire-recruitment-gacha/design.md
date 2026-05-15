## Context

`hospital-management-mode` capability（spec locked 2026-05-15）刻意把抽卡所有數值留白，現在要 lock。`ingest-medexam2-tw-corpus` 已 ship — `subjects.json` 帶 14 科 per-subject totalQuestions（內科 1305 → 麻醉科 192，min 174 / max 1305）。`core/lib/loot.ts` 既有 30/100 pity 邏輯成熟、一階 app 已 dogfood 過，本 change 要重用、不重造輪。

二階 quiz runner UI 尚未做（拆 `wire-quiz-runner-medexam2`），所以「答對 → +1 affinity」這條 wire 暫時用 mock UI（HomePage 上加 dev-only +1 button per subject）端到端先打通；真實 quiz runner 接好後 mock button 拔掉。

## Goals / Non-Goals

**Goals:**

- Lock `recruitment-gacha` 所有數值決策（P1–P5 weight / pity / powerMultiplier 中間值 / 14 科 threshold）
- 重用 `core/lib/loot.ts` 邏輯而非複製 — 抽出 generic `rollGacha` 介面，loot.ts 變 thin wrapper
- 醫師卡 schema 自我完備（含 sprite 占位邏輯），room assignment 留 hospital-tycoon-engine
- 端到端可玩 loop：mock +1 affinity button → banner unlock → roll → 卡面 modal → DoctorRoster 列表新增
- 一階 app（`apps/medexam-tw/`）完全不動（loot 系統、Dexie schema、API 不變）

**Non-Goals:**

- Doctor → room assignment：room throughput 公式 → `wire-hospital-tycoon-engine`
- Hospital level upgrade UI / 三階段建築 → `wire-clinic-level-up`
- Reputation 公式 → `wire-hospital-reputation`
- Doctor sprite 美術 → `add-doctor-sprite-roster`（本 change 用色塊 placeholder：banner 用 `subject.color`，醫師卡用 rarity-tier 配色 + 科別 icon emoji）
- 二階 quiz runner UI → `wire-quiz-runner-medexam2`
- 數值 fine-tune：本 change lock 初版 baseline，dogfood 一週後另開 change 調整

## Decisions

### Decision 1: 在 core 新增 generic `rollGacha`，loot.ts 內部改 thin wrapper

**選擇**：`packages/core/src/lib/gacha.ts` 新增 generic 抽卡介面，rarity tier order 由 caller 提供；`loot.ts` 保留既有 export（`rollLoot`、`rollRarity`、`DEFAULT_RARITY_WEIGHTS`、`PITY_SR_THRESHOLD`、`PITY_SSR_THRESHOLD`、`initialLootStats`），內部呼叫 `rollGacha`。

```typescript
// gacha.ts
export interface GachaTier { id: string; weight: number; pityFloor?: boolean }
export interface GachaConfig {
  tiers: GachaTier[]           // ordered low → high rarity, weights sum to 100
  pityRules: PityRule[]        // [{ atRolls: 30, forceTierAtLeast: 'P3' }, ...]
}
export interface GachaStats {
  totalRolls: number
  rollsSinceLast: Record<string, number>  // keyed by tier id of each pity rule
}
export function rollGacha(config: GachaConfig, stats: GachaStats, rng?): { tier: string; wasPity: boolean; newStats: GachaStats }
```

**理由**：
- 不 break 一階 app 既有 `Rarity = 'N'|'R'|'SR'|'SSR'|'UR'` enum（CLAUDE.md curator rule：engine API 是 fork contract，不輕易 break）
- 二階 app 用 `'P1'|'P2'|'P3'|'P4'|'P5'` string，純 callsite 決定 tier label
- Pity rule 變成 data 不是 hardcoded const — 30 / 100 為一階 default、二階沿用同數值但可獨立調

**Alternative**：
- 直接把 `Rarity` 改 generic — 否決（破壞既有 API、CHANGELOG 要寫 BREAKING）
- 二階 app 自己複製 loot.ts 邏輯 — 否決（兩份 pity 邏輯維護成本翻倍、dogfood 不平衡時要改兩份）

### Decision 2: P1–P5 weight = 60/25/10/4/1（mirror N/R/SR/SSR/UR）

**選擇**：

| Tier | Weight (per 100 rolls 機率) | 對應一階 |
|---|---|---|
| P5 拉完了 | 60 | N |
| P4 NPC | 25 | R |
| P3 人上人 | 10 | SR |
| P2 頂級 | 4 | SSR |
| P1 夯 | 1 | UR |

**理由**：一階 dogfood 已驗證 60/25/10/4/1 體感平衡（M1 ship 後玩家拉到 SSR 不會過快、抽 UR 有驚喜感）。Mirror 過來省一輪數值 tuning，dogfood 一週後再看分布調整。

**Alternative**：
- 80/15/4/0.9/0.1 偏 hardcore — 否決（二階 ticket 供應比一階慢，過硬會挫敗感）
- 50/25/15/8/2 偏 generous — 否決（高 rarity 過密會破壞「夯」的稀有感）

### Decision 3: Pity = 30 rolls force P3+ / 100 rolls force P2+

**選擇**：對應一階 `PITY_SR_THRESHOLD=30` / `PITY_SSR_THRESHOLD=100`：

- `rollsSinceLastP3 >= 30` → 強制至少 P3（替代 SR pity）
- `rollsSinceLastP2 >= 100` → 強制至少 P2（替代 SSR pity）

不為 P1 加保底（一階 UR 也沒保底，維持「最頂稀有」性質）。

**理由**：一階保底數值已 dogfood-tested、體感 OK，mirror 過來。

### Decision 4: P2/P3/P4 powerMultiplier = 3.5 / 2.0 / 1.0（geometric 中間值）

**選擇**：

| Tier | powerMultiplier |
|---|---|
| P1 夯 | 5.0（locked by hospital-management-mode spec） |
| P2 頂級 | 3.5 |
| P3 人上人 | 2.0 |
| P4 NPC | 1.0 |
| P5 拉完了 | 0.5（locked by hospital-management-mode spec） |

Strictly monotonic（hospital-management-mode requirement：tier-to-multiplier monotonic）。Gap：P5→P4=0.5、P4→P3=1.0、P3→P2=1.5、P2→P1=1.5（前段平緩、後段陡，符合 RPG「越頂提升越大」直覺）。

**理由**：
- Geometric-ish 分布讓「拉到 P1」的感受顯著超越 P2
- P4=1.0 當基準（NPC 平庸 == 1× baseline）符合「人上人」概念
- 跟一階 `Item.multiplier.value` 同 scale，玩家從一階轉過來不需要重新校準直覺

**Alternative**：linear 0.5/1.5/2.5/3.5/5.0 — 否決（中段過密、頂端跳幅不夠戲劇）

### Decision 5: 14 科 threshold = `Math.ceil(totalQuestions × 0.05)`，static array 不 runtime 計算

**選擇**：lock final 整數值寫進 `packages/content-medexam2-tw/src/recruitment.ts`，**不**在 runtime 從 `subjects.json` 算（避免「subjects.json 改了 threshold 偷偷漂移」的 silent breakage）：

| 科別 | totalQuestions | threshold |
|---|---|---|
| 內科 | 1305 | 66 |
| 外科 | 1150 | 58 |
| 小兒科 | 707 | 36 |
| 婦產科 | 643 | 33 |
| 精神科 | 312 | 16 |
| 復健科 | 312 | 16 |
| 神經內科 | 296 | 15 |
| 家醫科 | 213 | 11 |
| 皮膚科 | 202 | 11 |
| 麻醉科 | 192 | 10 |
| 骨科 | 191 | 10 |
| 耳鼻喉科 | 188 | 10 |
| 眼科 | 181 | 10 |
| 泌尿科 | 174 | 9 |

**Total threshold sum = 319**：玩家要全 14 科解鎖需累積答對 319 題。對應一階 dogfood 每天 ~30–50 題進度，~7–10 天可全解鎖。可接受。

**理由**：
- 5% 是 grill quick scaffold lock 的 baseline，沒有強依據 — dogfood 一週後依「玩家覺得 grind 太久 vs 太快」另開 change 調
- Static array 避免 silent drift（coding_principles §6 Schema canonical form：邊界 raise，不 fall through）— 若未來新增第 15 科 / 改 totalQuestions，build script 比對發現 mismatch 直接 fail

### Decision 6: 醫師卡 schema 自我完備、name 自動生成、sprite key 對應 placeholder

```typescript
export interface Doctor {
  id: string                    // crypto.randomUUID()
  subjectId: SubjectId          // 14 科 one of
  rarity: 'P1'|'P2'|'P3'|'P4'|'P5'
  powerMultiplier: number       // 0.5–5.0 per Decision 4
  name: string                  // auto: "<subject> 醫師 #<seq>" (seq = order recruited in this subject)
  spriteKey: string             // theme.sprites lookup: `doctor-<subjectId>-<rarity>` (placeholder fallback chain)
  obtainedAt: number            // Date.now() at recruitment
  assignedRoom: string | null   // null until wire-hospital-tycoon-engine; reserved field
}
```

**理由**：
- `name` 自動生成省去命名 UI（後續可加 rename feature，但 MVP 不做）
- `spriteKey` 用 `doctor-<subjectId>-<rarity>` 約定，theme pack 找不到時 fallback 到 `doctor-default-<rarity>` 再到 `doctor-default`（三層 fallback chain）
- `assignedRoom` 預留欄位 — 不會 break schema migration when wire-tycoon 加實際邏輯

**Alternative**：
- 命名走 named-character lore（P1 給真實名字、P5 nameless） — 否決（hospital-management-mode spec 已明示 rarity 是 power-only 軸，lore 是 orthogonal layer，本 change 不碰）

### Decision 7: Ticket 系統 = 起始 10 + 每日 +1 + 上限 99，純 client-side

**選擇**：
- 新存檔：tickets = 10
- 每日 +1：開 app 時比對 `lastTicketRefreshDay` (epoch day = `Math.floor(Date.now()/86400000)`)，差幾天就補幾張
- 上限 99（防囤積過量、保留「快沒了就花」緊張感）
- 無付費 / IAP（project.md Out of Scope）

**理由**：
- 起始 10 張讓玩家立刻試抽 banner、不需 grind 才知道好不好玩（first impression）
- 每日 +1 慢速 drip 養成回來看的習慣（dogfood 後可調 +2 / +5 視 retention）
- 99 上限 = 兩位數顯示 + tycoon-engine 接好後改成日結算 +N（room 數 × tier modifier）

**Alternative**：
- 每答對 N 題 +1 ticket — 否決（跟 affinity 機制邏輯衝突，玩家會混淆「答題到底解鎖什麼」）
- Watch ad +1 ticket — 否決（無後端 / 無廣告 SDK / project Out of Scope）

### Decision 8: Mock affinity +1 button — dev-only、`import.meta.env.DEV` gate

**選擇**：HomePage 上 banner 旁加 「+1 練習答對」 button，**僅 `import.meta.env.DEV` true 時 render**。Production build（GH Pages）自動隱藏。

`wire-quiz-runner-medexam2` 接好真實 quiz 後此 button 拔掉（在那個 change 的 tasks 列）。

**理由**：
- 端到端 loop 必須現在打通（測 unlock notification / banner 狀態切換 / roll 流程），否則 design 漏洞要等 quiz wire 完才能驗
- DEV gate 確保 prod build 不會出現 cheat button 但 dev 仍可 dogfood

### Decision 9: Dexie schema version = 1（新 DB，跟一階 DB 完全分開）

二階 app 的 IndexedDB database name = `study-rpg-medexam2-hospital-tw`（一階是 `study-rpg-medexam-tw`），完全獨立 DB instance，無 migration risk。

```
DexieDB v1 schema (medexam2):
  affinity:   '&subjectId, correctCount'
  doctors:    '&id, subjectId, rarity, obtainedAt'
  gachaStats: '&id'  // single row id='global'
  tickets:    '&id'  // single row id='global', fields: available, lastRefreshDay
```

**理由**：兩 app 存檔互不影響 — 玩家可同時玩兩 app 不衝突。

## Risks / Trade-offs

- **[Risk] `rollGacha` refactor 不小心 break 一階 loot 行為** → Mitigation: 既有一階 loot.test.ts（若有）跑通；無 test 就手動 dogfood roll 200 次比對前後 rarity 分布（chi-square 不該顯著差異）；commit 拆兩個（refactor + 二階新功能），refactor 那 commit 一階 typecheck + smoke 必須 pass
- **[Risk] 數值（threshold / weight / multiplier）首版 dogfood 體感不對** → Mitigation: 把所有數值集中在 `packages/content-medexam2-tw/src/recruitment.ts` 一個 export const 表，dogfood 後另開 change `tune-recruitment-gacha-numbers` 一次調掉。Spec scenario 寫 example value 而非 hard-coded（"50 抽 ≥ 1 P2" 而非 "weight 60/25/10/4/1"）
- **[Risk] DEV-only mock button 不小心進 prod build** → Mitigation: Vite `import.meta.env.DEV` 在 production build 是 `false`，dead code elimination 會 strip；CI 加 grep `+1 練習答對` 在 dist/assets 找到就 fail
- **[Risk] Dexie schema version 改變需要 migration** → 本 change 是 v1 = 初版 DB，無 migration 需求；未來改 schema 走 Dexie standard `db.version(2).stores(...).upgrade(...)` pattern
- **[Trade-off] Sprite placeholder（色塊 + emoji）視覺粗糙** → 接受。本 change 是 functional MVP，美術交 `add-doctor-sprite-roster`。Dogfood 時 owner 自己看色塊不影響 loop 邏輯驗證
- **[Trade-off] Ticket 起始 10 + 每日 1 可能太慢** → 接受。先 conservative，dogfood 後 generosity 比 stinginess 好調（給多了發現再收緊 OK；給太少玩家流失難找回）

## Migration Plan

- **一階 app**：零影響。`loot.ts` API 不變（內部改用 `rollGacha`），所有既有 caller zero-diff
- **二階 app**：新 Dexie DB（v1 schema），全新玩家 onboarding，無存檔遷移
- **Engine**：`gacha.ts` 新檔 export 走 `packages/core/src/index.ts`，semver 視為 minor add（pre-1.0 不算 breaking）
- **Rollback**：refactor commit 出問題可獨立 revert（不影響二階新功能 commit）；二階新功能 commit 出問題 revert 後一階仍正常

## Open Questions

- **Daily ticket refresh 在 app closed 狀態下時區處理**：玩家飛跨時區 / 改本機時鐘會發生啥？MVP 階段接受 client-side date diff（簡單、玩家作弊只能自害），未來接 Supabase 時改 server-side timestamp
- **多抽（10 連抽）UI**：MVP 只做單抽（每次點 button 一次 roll），10 連抽留後續 change 加入
- **抽到重複醫師（同 subject + rarity）的處理**：MVP 接受重複存在 roster 中（每張都是獨立 instance），未來 wire-tycoon 接好後可看是否要 dedup / 重複給能力加成
