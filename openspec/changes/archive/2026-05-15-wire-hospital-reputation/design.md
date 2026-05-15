## Context

`wire-hospital-tycoon-engine`（10 reqs, archived 2026-05-15）建立了 hospital mode 的基礎經濟 loop：3 outpatient room → assignment atomicity → 5s tick → revenue + reputation 1:1 累積。`wire-clinic-level-up`（7 reqs, archived 同日）補上 tier 升級與 tier-driven room seeding。但 throughput 公式 `baseRate × powerMultiplier × roomFacility` **完全沒有「醫師專業性 vs room 用途」的維度** — 把外科 P1 doctor 丟進門診 room 跟丟進手術 room 拿一模一樣的 reward，二階國考用 14 科分流的核心立意（不同科別處理不同類型病人）在 game mechanic 上消失。

11:50 entry 的 grill-vs-implementation reconciliation 把 5 個 deferred items carry forward。本 change（接 `~/.claude/scratch/grilled-wire-hospital-reputation-2026-05-15.md` 的 6-facet quick grill）鎖定其中三個立即落地的 mechanic + 兩個明確 defer。

**現有 archive 狀態**：
- `hospital-tycoon-engine` spec Requirement「Tick loop SHALL accumulate revenue + reputation per visible 5-second tick」步驟 5 寫 `deltaReputation = deltaRevenue` 並註明「1:1 baseline for this change; `wire-hospital-reputation` will refine」— 這條 explicit forward reference 是本 change 的直接 anchor，MODIFIED 必須處理它
- `hospital-tycoon-engine` Requirement「Hospital page SHALL render rooms with assigned doctor sprite」scenario 寫 `20 患者/分 (= 10 × 2.0 × 1.0)` — 這是 affinity bonus = 1.0 的 mismatch case；MODIFIED 後仍能符合（外科 doctor 進 outpatient room 是 mismatch，bonus = 1.0）

## Goals / Non-Goals

**Goals:**
- 加入「對的人放對 room」策略維度 — 不同 rarity 在 match 時拿不同倍率 bonus（P1 拿大、P5 拿小），鼓勵玩家想「這張 P1 外科醫師該放手術 room」
- 答題 → 經營兩條 loop 互相回饋：答對題即時加 reputation（per-Q hook），鼓勵玩家在 idle 之餘繼續答題（接 `quiz-runner` 的 `correct-answer` event）
- 所有常數鎖進 spec，QA 不需臆測（mapping table / 5-tier bonus / 0.3/0.7 split / 5s tick）
- 不破壞既有 save data — affinity bonus 是 derived value，不需要 IndexedDB migration

**Non-Goals:**
- ❌ Reputation 公式 shape（log / sqrt / piecewise / diminishing） — 仍 linear baseline，等 dogfood 數據再開 `add-diminishing-returns-to-reputation`
- ❌ Revenue / reputation 分化 — 保 1:1，defer 到 `wire-hospital-spend` change（介紹 spend mechanic 同時分化兩 currency）
- ❌ Tick interval 調整 — 5s 維持，dogfood 一段時間後再考慮
- ❌ Subject 加權「主科 vs 次科」— 14 科平權，affinity bonus 只看 room type match 與否
- ❌ Pity / 保底 行為對 affinity bonus — 純獨立兩條 mechanic，pity 已 lock 在 `recruitment-gacha`

## Decisions

### Decision 1: Subject↔room mapping — 1對1 strict, 4/6/4 split

**Choice**: 14 科 strict 1對1 mapping 到 `{ward, surgery, outpatient}`。具體分配：

| Room type | Subjects | 數量 |
|---|---|---|
| ward | 內科 / 神經內科 / 小兒科 / 復健科 | 4 |
| surgery | 外科 / 骨科 / 婦產科 / 泌尿科 / 耳鼻喉科 / 眼科 | 6 |
| outpatient | 家醫科 / 皮膚科 / 精神科 / 麻醉科 | 4 |

**Rationale**:
- **內科 / 神經內科 / 小兒科 / 復健科 → ward**：四科最大住院量在台灣臨床現場（內科 stroke/CHF 住院 / 神內 stroke / 小兒科兒童住院 / 復健科 stroke 復健住院）
- **外科 / 骨科 / 婦產科 / 泌尿科 / 耳鼻喉科 / 眼科 → surgery**：六科都是純手術科（婦產科 OP + 接生、泌尿 TURP、耳鼻喉 內視鏡、眼科 phaco）
- **家醫科 / 皮膚科 / 精神科 / 麻醉科 → outpatient**：四科以門診為主（家醫純門診、皮膚門診、精神門診、麻醉科有 pain clinic + pre-op clinic）

**Alternative considered**：「麻醉科 → surgery」更貼近臨床（麻醉在 OR），但會打破 4/6/4 split。Trade-off：選 4/6/4 平衡 + 用「pain clinic / pre-op clinic」為 outpatient 自圓其說，game balance > 100% 臨床真實。

**Where it lives**: `packages/content-medexam2-tw/src/affinity.ts` 匯出 `SUBJECT_TO_ROOM: Record<SubjectId, RoomType>` constant — 跟既有 `Room` / `RoomType` / `computeThroughput`（住在同 package）一致。**不在 `@study-rpg/core`**：keys 是 14 科 二階-specific subject names（`內科` / `外科` …），放 core 會破壞 engine 的 content-agnostic 邊界。其他 content fork（如未來日文 `content-medexam2-jp`）依樣畫葫蘆自己 export 一份。

### Decision 2: Affinity bonus 5 階表 — rarity-scaled match bonus

**Choice**: P1 1.5× / P2 1.4× / P3 1.3× / P4 1.2× / P5 1.1× when subject↔room match；1.0× 一律 on mismatch（無 penalty）。

| Rarity | Match | Mismatch |
|---|---|---|
| P1 夯 | 1.5× | 1.0× |
| P2 頂級 | 1.4× | 1.0× |
| P3 人上人 | 1.3× | 1.0× |
| P4 NPC | 1.2× | 1.0× |
| P5 拉完了 | 1.1× | 1.0× |

**Rationale**:
- **Scale with rarity** 而非 flat bonus → P1 dogfood 抽到時最有動機「找對 room」；P5 仍有些微 bonus 不至於完全棄置
- **無 penalty mismatch**（純加法而非乘減） → 初期玩家還沒抽夠 doctor 時不會被卡住，遊戲設計上「不懲罰學習者」
- **Max stack**：P1 × powerMultiplier 5.0 × affinity 1.5 = 7.5× — 跟 P5 拉完了 × 0.5 × 1.0 = 0.5 比，最高最低差距 15× 仍合理（gacha 上限可控）
- **5 階對齊 priority levels**：使用者偏好五階「夯到拉」分級體系，這邊 affinity bonus 表跟 `powerMultiplier` 表平行（同 5 階）對玩家認知一致

**Alternative considered**：
- (a) Flat 1.5× match for all rarities — 否定，P1 拿不到比 P5 更多激勵
- (b) 完全不獨立 affinity 維度、把 bonus 摻進 powerMultiplier — 否定，扁平化失去「找對 room」決策空間

### Decision 3: Per-Q reputation hook — event-emit + listener, 30/70 split

**Choice**: `quiz-runner` 在 correct-answer 時 emit `quiz:correct-answer` event；`hospital-reputation` listener 接到 event 計算 `deltaReputation = 0.3 × currentTotalThroughput / 60` 加進 `gameCounters.reputation`；idle tick 維持原邏輯但 reputation 倍率改 0.7（revenue 維持 1.0）。

```typescript
// pseudocode
quizRunner.on('correct-answer', () => {
  const totalThroughput = computeTotalThroughput(rooms, doctors);
  const deltaRep = 0.3 * totalThroughput / 60;  // "1 second worth" * 0.3 / 60
  updateGameCounters({ reputation: +deltaRep });
});

// idle tick (modified)
function runTick() {
  // ... compute totalThroughput same as before ...
  const deltaRevenue = totalThroughput * elapsedSec / 60;        // unchanged
  const deltaReputation = deltaRevenue * 0.7;                    // NEW: 70% multiplier
  updateGameCounters({ revenue: +deltaRevenue, reputation: +deltaReputation });
}
```

**Rationale**:
- **Event-emit + listener** 解耦：`quiz-runner` 不需要 import hospital stuff（保持一階 / 二階 quiz runner 程式碼共用、只在 二階 app 註冊 listener）
- **Per-Q delta = 0.3 × throughput / 60**：拿「1 秒 worth of throughput」當 base，乘 0.3 為 30% per-Q 佔比。Player 答 12 題/min ≈ 12 × 0.3 × throughput / 60 = 0.06 × throughput 每分鐘 from per-Q；idle 0.7 × throughput 每分鐘 from idle — 兩者比例 ~6:70 ≈ **0.085:1 ≈ 8% per-Q 實際 contribution**（如果玩家答 12 題/min；快慢有差）
- **Revenue 不動 split**：revenue 維持「全 idle 1.0×」(deltaRevenue = throughput × elapsedSec / 60)，因為 revenue 的 sink 是 `wire-hospital-spend` 不該被 per-Q 噪音
- **Math sanity check**：60s idle 期間 throughput=100 patients/min → revenue +100, reputation +70；若玩家同期答 10 題正答 → reputation 額外 +10 × 0.3 × 100/60 ≈ +5。Total reputation +75 vs revenue +100，**reputation 落後 revenue 是預期的**（要 wire-hospital-spend 把 revenue 變大但 reputation 慢漲，作為 prestige currency）

**Alternative considered**：
- (a) Per-Q 固定 +5 reputation flat（不看 throughput） — 否定，後期 throughput 上去後 per-Q 變相不值錢；scale 才合理
- (b) 50/50 split — 否定，per-Q 佔太重會讓 idle 體驗弱化（背景 5s tick 變得無感）
- (c) Per-Q 直接 += deltaRevenue 同步 — 否定，revenue 不該被 quiz 行為直接影響（revenue 是「醫院營運收入」，跟玩家答題能力解耦）

### Decision 4: All numbers locked in spec (no constants file deferred)

**Choice**: Mapping table、affinity bonus 5 階表、0.3/0.7 split、5s tick interval 全部寫進 spec scenario，不留 `TBD - tune via dogfood`。

**Rationale**:
- Spec 寫死 → QA test 可直接 assert 數值，不需要查 source code 對照
- 未來 dogfood 發現要 tune（例如 0.3/0.7 → 0.4/0.6）就開新 MODIFIED change，比留 magic constant in code 更可追溯
- 跟前一個 change `wire-hospital-tycoon-engine` 風格一致（也是 lock baseRate=10, roomFacility=1.0, 5s tick, MAX_OFFLINE=300s）

**Trade-off**: 改數字要走 change-propose-apply-archive 流程（重一點），但對 dogfood 階段一個玩家的專案來說可接受。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **Mapping table 拍板可能爭議**（麻醉科 → outpatient 不符臨床直覺） | 在 spec scenario 標明 mapping 為「game balance prioritized over clinical strict accuracy」；future change 若要重排 mapping 開 MODIFIED |
| **Per-Q hook 加重 quiz runner coupling 風險** | 用 event emit 而非直接呼叫 hospital lib；quiz-runner 完全不 import hospital 相關 module；listener 只在 `apps/medexam2-hospital-tw` 註冊 |
| **Affinity bonus 公式可能在 dogfood 失衡**（P1 太強或 P5 太廢） | bonus 表寫進 spec scenarios，dogfood 兩週後若發現問題開 MODIFIED change tune；不 hot-fix code |
| **既有 tick loop test 會 break**（reputation 預期值改變） | `tasks.md` 明確列出要 update 既有 `tycoon.spec.ts` 的 reputation assertion；不漏更新 |
| **Per-Q hook 在無 assigned doctor 時的行為** | totalThroughput = 0 時 deltaRep = 0，無副作用；spec scenario 涵蓋此 edge case |
| **Save schema forward-compat**：affinity 是 derived value 不需 migration | 確認 schema 不變動；spec 內 explicit「no IndexedDB schema change」 |

## Migration Plan

純 forward-compat 變更，無 destructive migration：

1. Land engine code: `affinity.ts` + `reputation.ts` + quiz-runner event emit
2. Update `tycoon.ts` tick loop 加 0.7 multiplier on reputation
3. Update hospital app 顯示 affinity bonus marker
4. 既有 save 開機後：
   - 第一個 tick 走新公式（apply 0.7 multiplier on reputation）
   - 第一個 per-Q event 走 listener（apply 0.3 hook）
   - 不需 schema 改 / 不需 user 動作

**Rollback**：如果 dogfood 兩週後決定整套退掉，開 `revert-wire-hospital-reputation` change MODIFIED 把公式改回 1.0× + remove per-Q hook。Reputation 累積過的數值不回退（保留玩家進度）。

## Open Questions

1. **P2–P4 中間值是否 1.4 / 1.3 / 1.2**？已 lock（grill 推薦 + monotonic 合理），但 implement 前 user 可改
2. **內科 → ward 是否包括「家醫科」**？已決定不包括（家醫科 → outpatient），但 dogfood 可改
3. **HomePage 是否需顯示「下次 affinity bonus 來自」hint**？UI scope 留給 apply 階段試試看效果決定，spec 只要求 RoomCard 顯示當前 bonus marker
4. **Per-Q hook 是否該 throttle**（玩家點超快連續答對）？目前不 throttle — quiz-runner 本身有「答完一題到下一題」的 transition，不會 burst 太多 event。Apply 時觀察、若有 issue 開 follow-up change
