# Handoff — neurons 遊戲機制 3-change 計畫（2026-06-03）

> 跨 session 接續用。`/spec resume` 會讀此檔。完整設計 + OE 神經科學 anchor + 平衡評估在
> `~/.claude/scratch/grilled-neurons-遊戲機制開放決策-2026-06-03.md`（grill 紀錄，含 OE PMID/DOI）。

## 這次 session 做了什麼

從兩個原始問題（maze-beta vs connectome / 遊戲機制盤點）→ `/grill quick` → 收斂出 **2 條軸模型** + **3-change 計畫**，並**完整 ship 了 #1**。

### 收斂的設計模型（locked）
- **只有 2 條軸**：① 能量軸（答題+閱讀 → 神經能量 → 抽卡 → 神經元；maze 是它的**具象化**，遠征速度 = 能量獲取速度，**無「解題速度」**）② 精通軸（AP → family 精通度 → 加快能量獲取 + 解鎖軸B 動畫）
- **2 貨幣**（砍掉原本提議的 BDNF shard 中間貨幣）：神經能量（唯一收集貨幣）+ dupe（重複神經元，當強化材料）
- **dupe = 獨立個體**（Pikmin Bloom 式，每隻自帶出生軸B art），非計數

## 3-change 計畫 + 當前位置

| # | change | 狀態 |
|---|---|---|
| **#1** | `add-neurons-dupe-fusion` | ✅ **SHIPPED** — commit `1f8eda9`、pushed `track-neurons`、archived `openspec/changes/archive/2026-06-03-add-neurons-dupe-fusion/`、新 capability spec `openspec/specs/neuron-variant-fusion/`。254/254 測試、-r typecheck clean、Chrome MCP 端到端驗過 |
| **#2** | `add-neuron-family-mastery`（建議下一個）| ⏳ 未開。AP→精通度 + 加快能量獲取 + **oligodendrocyte 跟隨夥伴=加速**（companion 繞過 sprite 對齊地雷）/ **Na⁺/K⁺ pump=能量續航非速度**（OE 已查證：pump 不決定傳導速度）。OE conduction-velocity anchor 已在 grill 檔（Suminaite 2019 / Nabel 2024 / Cohen 2020）|
| **#3** | `promote-maze-to-home`（design-first）| ⏳ 未開。maze 變主頁 + connectome synapse 網路疊圖。⚠️ 平衡：**現行 SIGNAL_PER_NODE=24 讓 maze ~2 週跑完、非 2-3 月 → 要 ~4-5×**；pacing curve（後段調慢）；二週目減速 |

## #1 關鍵不變式（未來改 code 別破壞）
- `neuronVariants` PK `[familyId+slotIndex]` **不可改**；`copies` = 終身 mint 計數（MAX-merge sync）；current owned 由 `neuronInstances`（consumedAt==null）導出
- `neuronInstances` sync = **union by instanceId + consumedAt monotonic-OR**（consumed 個體不復活）— 鎖在 `neuron-instances-merge.test.ts`，**勿改成 LWW**
- promote = 純吃 K 隻同階 surplus（last-copy 保護）→ mint T−1；**不耗 energy、不動 rarity weights**
- R2 bundle `SCHEMA_VERSION` 已 10→11；Dexie 已到 **v13**（下一個 schema change 從 v14 起、必帶 v13→v14 fixture）

## 待辦（下次接續）
1. **merge #1 → main + deploy**（pending；sync protocol 建議累積 1-3 change 一起。`cd ~/coding-scratch/study-rpg && git merge --no-ff track-neurons` → push 觸發 CF Pages CI → prod SPA 三件套驗）
2. **開 #2** `add-neuron-family-mastery`（`/opsx:propose`；OE anchor 已備）
3. **#3** design-first（含 SIGNAL_PER_NODE 校準）

## 注意
- ⚠️ dev `localhost:5177` IndexedDB 有 #1 smoke 殘留（40 藥理學 pulls + 1 promote + granted energy）；**prod 未受影響**；要清開 Settings reset
- 別碰 worktree 內 parked 的 `add-hospital-equipment-medexam2` / `add-r2-cloud-sync-migration` / `add-version-check-banner`（其他 track 的）
