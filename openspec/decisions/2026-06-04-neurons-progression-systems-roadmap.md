# Neurons 進度系統 roadmap + 裝備/夥伴(parked) + DMN→補給品改造 + streak-shield 移除

> 2026-06-04 owner 設計對話紀錄。狀態：**部分 parked / 部分待 propose**。
> 來源 grill：`~/.claude/scratch/grilled-neurons-首抽機制-四大家族迷宮代表-2026-06-04.md`
> + `grilled-neurons-遊戲機制開放決策-2026-06-03.md`（裝備 OE anchor 在此）。

> ## ⚠️ PIVOT (2026-06-04 grill #2 — `grilled-neurons-加速系統-DMN消耗品vs裝備永久-2026-06-04.md`)
>
> **§1 guardrail（DMN 不碰速度/能量）+ §3/§4/§6 的 P2/P3 分立被推翻。** 新模型：
> - **「加速系統」一條巷子，兩種存續**：**消耗品**（DMN 命運卡 → 背包，限時/一次性速度·能量 boost）vs **永久**（裝備/夥伴 passive 速度·能量 boost）。
> - **family-buff 保留並擴充**（不再因「重疊裝備」移除 — 它就是消耗品版速度 boost 的基礎）。
> - **Phase 2 + Phase 3 合併**成一個 change（建議名 `add-neurons-acceleration-system`）。
> - DMN 全部效果進背包手動啟用；streak-shield 仍移除（誠信）+ 已收集卡從 closed-cap 圖鑑移除。
> - 下方 §1 guardrail、§3「永久 passive」定位、§4「DMN 不碰速度/能量」、§6 P2/P3 分立 **以本 PIVOT 為準**（保留原文供 history）。

## 0. 為什麼有這份檔

設計首抽時發現「加速探索」的機制散落多處且**概念會互相重疊**。本檔釘出**四層進度系統的分工 (lane)**，讓未來每個 change 各歸其位、不重複造輪、不打架。

## 1. 四層進度系統 lane（單一真實來源）

| Lane | 系統 | 性質 | 神經科學 anchor | 取得 | 狀態 |
|---|---|---|---|---|---|
| 能量軸 | maze neural energy | 賺取型貨幣（per-branch、monotonic） | firing / glutamate 即時活動 | 答對題(+3)、閱讀(+2 分散4分支) | ✅ shipped |
| 精通軸 | `masteryEnergyMultiplier` | **永久** per-family 能量倍率 ×1.0–1.30 | Hebbian consolidation | 該科答對量 + 正確率雙閘 | ✅ shipped |
| 裝備/夥伴 | companion / equipment (speed+energy lane) | **永久 passive** 加成 | myelin / 寡突膠細胞 / Na⁺K⁺ pump（見 §3） | DMN 抽卡低機率（~5%）→ `equipment` table | ✅ **merged → `add-neurons-acceleration-system`** |
| 補給品 | DMN fate cards → 背包 | **一次性/限時 consumable** | DMN 休息態認知 + NE/DA surge + lactate bolus（見 §4） | 抽 DMN 卡 → 背包手動啟用 | ✅ **merged → `add-neurons-acceleration-system`** |

**Guardrail（避免重疊的硬規則）**：
- DMN 補給品 **不得**發永久 passive（→ 那是裝備 lane）。
- DMN 補給品 **不得**做「conduction speed / 走路加速」（→ 那是裝備的 myelin）。
- DMN 補給品 **不得**做「能量補充 / 續航」（→ 那是裝備的 Na⁺/K⁺-ATPase pump，§3）。
- DMN 補給品**只待在**「休息態認知」這條巷子：記憶鞏固 / 複習 / 靈光 / 新奇偵測。

## 2. 重疊診斷（owner 直覺正確）

現行 DMN 5 事件 vs 未來裝備的真正衝突點：
- 🔴 **family-buff（DMN ×2 能量 1hr）↔ companion（裝備永久加速）** = 直接重疊（都在「加速」）。→ Phase 2 **移除或改題**，speed 這條讓給裝備。
- 🟡 潛在：任何「能量補充」DMN 補給品 ↔ pump（裝備能量續航）。→ guardrail 已禁。
- 🟢 不重疊且本來就貼合 DMN：variant-rate-up（新奇）、quick-review-batch（複習鞏固）、hidden-reveal（靈光提示）。

## 3. 裝備/夥伴系統（PARKED — Phase 3）

**狀態**：OE 神經科學 anchor 已查完（2026-06-03 grill），**程式從未實作**；neurons 目前無 equipment table、無 companion；achievements spec 還明文 reject `equipment` reward kind（要做須走新 OpenSpec change 解鎖該 union）。

**核心理念**：永久 passive，**獨立 sprite 跟隨 / 環繞**（companion / pet / vehicle / aura），**不「穿戴」身體** → 規避一階國考踩過的 sprite 對齊地雷（owner 直覺正確）。

**OE-anchored 對應（PMID/DOI 已存）**：
- **跟隨夥伴 = oligodendrocyte（寡突膠細胞 / myelinating glia）** → 最大速度來源（myelinated 100–300 m/s vs unmyelinated 1–3 m/s）；多隻 = 更多 myelin = 更快；直接咬合「二週目 myelination fusion」。Suminaite 2019 Glia `10.1002/glia.23665`；Nabel 2024 Glia `10.1002/glia.24504`；Cohen 2020 Cell `10.1016/j.cell.2019.11.039`。
- **交通工具 / 位移 = saltatory conduction（跳躍式傳導）** → node-to-node 位移特效。
- **武器 = voltage-gated Na⁺ channel (Nav1.6)** → 建議做 aura / 投射物（不手持，避免對齊）。
- **能量續航道具（非加速）= Na⁺/K⁺-ATPase pump** → OE 明確：pump 不決定傳導速度、只恢復離子梯度 → 定位為「回復神經能量 / 續航」，**不是加速**。

**未來怎麼加入（待 Phase 3 propose 時細設）**：
- 取得管道（待定）：成就獎勵 / dupe-fusion sink / 首抽 starter 夥伴 / settle 掉落？
- 效果模型：companion 疊加在能量 faucet 的**永久乘數**（類似 mastery），或 per-branch myelination level 疊進 `mazeSpeedMultiplier`。
- ⚠️ **平衡**：grill 已標「speed buff 正回饋失速」風險（收集數 ×0.04 + 夥伴再疊速度 → 後期失速）→ 必須 cap 紀律 + pacing curve。
- Schema：新 Dexie table + R2 bundle 加 adapter（additive, SCHEMA_VERSION bump）；achievements reward union 若要發夥伴須新 change。

## 4. DMN → 補給品改造（Phase 2）

**方向**：DMN 卡的 reward 從「auto buff」改為**休息態認知 consumable（補給品）**，全面退出「加速 / 能量」巷子，深化 DMN 真實神經科學（default mode network = 休息態自發活動 / 記憶鞏固 / 自發靈光）。

**確定動作**：
1. **移除 family-buff**（speed 重疊裝備）— 或改題成純鞏固/複習風味（待 OE）。
2. **移除 streak-shield**（誠信，見 §5）。
3. 保留並貼齊 DMN 主題：quick-review-batch（replay/consolidation）、hidden-reveal（insight）、variant-rate-up（novelty）。
4. **catalog 重平衡**：現 20 卡 = 5 kind × 4。移掉 2 kind（family-buff + streak-shield）= 釋出 8 卡。→ 或縮成 12 卡(3 kind)、或用 OE 設計 1–2 個 **DMN-authentic 新補給品**補回 16–20 卡（validator 要求每 kind ≥3）。

**OE 待查（Phase 2 lock 前，per 神經學嚴謹度規則；避開 §1 guardrail 的 myelin/pump/speed）**：
- 海馬 sharp-wave ripple replay × DMN → 記憶鞏固 → 「複習補給」anchor。
- DMN × incubation / 自發靈光 → 「靈光補給」anchor。
- 休息態 synaptic homeostasis（SHY 假說）/ 神經調質低張態利於鞏固 → 可能的新補給品 anchor。
- 既有基礎 anchor：Buckner & DiNicola 2019；Raichle 2015（DMN catalog 已引用）。

## 5. streak-shield 移除（誠信 — ✅ 併入 Phase 2，owner 2026-06-04）

> catalog 重平衡 P2 本來就要做，順手移避免做兩次。

**理由（owner）**：學習/作答面任何「幫玩家逃避誠實面對」的機制都要拿掉。streak-shield = 答錯時保住連對 streak 一次 = 誠信拐杖。

**全足跡（移除清單）**：
- 型別：`packages/content-neurons-tw/src/dmn-types.ts:42`（union）、`:50`（kinds 陣列）
- catalog：`dmn-cards.ts` streak-shield × 4（P2×1+P3×1+P4×2，lines 74/111/169/176）→ 觸發重平衡
- dispatcher：`dmn-event-dispatcher.ts` case + `dispatchStreakShield` + `consumeStreakShield` + `META_STREAK_SHIELD`
- 消費端：`lib/services/streak.ts:48-60`（斷 streak 時消耗護盾保住）
- sync：`lib/sync/tables.ts:350` synced meta key `dmnStreakShieldAvailable`
- UI 文案：`DmnDrawModal.tsx:33`、`HelpMenu.tsx:149`
- 測試：`__tests__/dmn-event-idempotency.test.ts` streak-shield cases

**誠信掃描結果**：streak-shield 是**唯一**的拐杖。其餘 OK 不動：
- 每日 streak 倍率本身（獎勵誠實的持續性，非拐杖）✅ 保留
- 斷 streak soft toast（只通知、不隱藏）✅ 保留
- SRS「🤔 我亂猜的 / ✨ 太簡單」自陳按鈕（誠信**正向**）✅ 保留

## 6. 分期計畫（✅ P1 SHIPPED；P2/P3 已合併 — 見 PIVOT 2026-06-04）

> 鎖定：P1 已 ship。**P2 + P3 合併**成一條「加速系統」（消耗品 boost + 永久 boost）。背包 = 全部手動啟用；streak-shield 移除（誠信）；OE 在 propose 時跑（消耗品速度/能量 anchor + 已備的永久 myelin anchor）。

| Phase | Change | 範圍 | 狀態 |
|---|---|---|---|
| **P1** | `add-neurons-first-pull` | 首抽 4 分支代表；maze + variant-gacha + onboarding + sync | ✅ SHIPPED (commit `979f913`, track-neurons) |
| **P2+P3（合併）** | `add-neurons-acceleration-system` | 「加速系統」一條巷：**消耗品**（DMN 卡→背包，限時/一次性速度·能量 boost；family-buff 保留+擴充；新增 surge/bolus）+ **永久**（裝備/夥伴 P1–P5 passive boost，myelin/pump OE-anchored）。streak-shield 移除（誠信）。additive `1+Σ` 雙池 + cap (energy 2.5 / speed 2.0)。Dexie v16 + R2 bundle 16。 | ✅ code-complete + verified (2026-06-04, track-neurons)；342 tests / typecheck / dexie-lint green；Chrome MCP e2e ✓；sprites = placeholder（follow-up `generate-acceleration-sprites`） |

**設計重點（合併後）**：lane = 「消耗品 vs 永久」；boost 疊加公式 + cap/pacing（正回饋失速防護）；背包 + 裝備 schema（Dexie bump + R2 bundle **從 16 起跳**，首抽佔 15）；DMN 非速度/能量 kind（review/rate-up/reveal）去留待 design 決。建議 design.md 厚、`/spec propose` design-first。

## 7. Cross-links

- 首抽 grill：`~/.claude/scratch/grilled-neurons-首抽機制-四大家族迷宮代表-2026-06-04.md`
- 裝備 OE anchor 原始：`~/.claude/scratch/grilled-neurons-遊戲機制開放決策-2026-06-03.md` §「2026-06-03 二輪 refinement」
- 已 ship 的精通軸：`openspec/specs/neuron-family-mastery/spec.md` + `wire-mastery-energy-acceleration`
- DMN 現況 spec：`openspec/specs/neurons-dmn-fate-cards/spec.md`
- 二週目 myelination fusion 雛形：`openspec/changes/.../add-neurons-dupe-fusion/`
