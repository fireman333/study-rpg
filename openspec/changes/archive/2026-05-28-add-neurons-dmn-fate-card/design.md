## Context

`neurons-tw` 已 ship 11/11 capability（connectome-collection / neuron-variant-gacha / neuron-family-mastery / neurons-achievements / neurons-leaderboard / neurons-deploy + scaffold/motion-library/sprite layers）並 live at `https://med-study-rpg.com/neurons/`。Owner 即將走 Threads 公開介紹，需要一個 narrative novelty 鉤子可以三句話講完「為什麼這遊戲有梗」。

Grill summary (`/Users/kangweiling/.claude/scratch/grilled-neurons-tw-A-DMN-fate-card-2026-05-27.md`) 已 lock 6 個 design decision：(1) 混合觸發 (時間 + 行為)、(2) 蒐集 + 事件混合 payout、(3) 獨立 modal、(4) Threads 公開、(5) polish 三件套在 sibling change、(6) R2 bundle schema bump。本檔負責 fully unwind 上述決定 + 解 6 個 open uncertainty：每日抽卡 cap 數值 / event type pool / rarity ladder / v1 client backward compat / artwork count / Threads 文案歸屬。

## Goals / Non-Goals

**Goals:**

- 提供混合觸發 (時間軸 + 行為軸) 的 fate-card 抽卡額度系統，玩家每日可抽 ≤ N 張
- 抽到的卡同時是圖鑑收藏（永久）+ 一次性靈感事件觸發器（觸發後事件用完）
- DMN 5 種一次性事件 type 對應神經科學 narrative，effect magnitude 可被玩家感知但不破壞 variant gacha 的「永久 stat」平衡
- R2 bundle schema 從 v1 → v2，且 v1 client 讀 v2 bundle / v2 client 讀 v1 bundle 都不 throw（mirror 二階 `add-bookmarks-filters-and-wrong-history-medexam2` 的 cross-version tolerance）
- Ship 後可作為 Threads 公開介紹的「神經科學梗」鉤子，narrative 一句話講完（「累積唸書讓大腦進入發散模式 → 自發產生靈感」）

**Non-Goals:**

- ❌ 動 connectome SVG / SYNAPSE_TIMINGS token / force-sim（決策 #3，獨立 modal）
- ❌ 接 reading-timer 真實 wire（sibling change `polish-neurons-pre-ship` scope）
- ❌ 接 study-category achievement trigger（sibling change scope）
- ❌ 生成 real pixel-art artwork (本 change ship placeholder；follow-up `generate-dmn-card-artworks`)
- ❌ 寫 Threads 公開介紹文案（owner 手寫，本 change 只 ship feature）
- ❌ 開新 R2 bundle（沿用既有 `neurons` bundle、不加 Worker presign whitelist 第 5 個 bundle）
- ❌ DMN 卡作為跨 app 資產（neurons-mode Req 4 cross-app data flow disallowed 仍適用）
- ❌ 內購 / 廣告解鎖額外抽卡（純行為觸發）

## Decisions

### Decision 1: 每日抽卡 cap = 時間軸 2 抽 + 行為軸 bonus 3 抽 (total ≤ 5 / day)

**選擇**:
- **時間軸**: 累積唸書 30 min → +1 抽；累積 60 min → 第 2 抽（每日上限 2 抽）。Counter `dmnTimeAxisMinutesAccrued` 每日 midnight 歸零
- **行為軸 bonus** (每日上限 3 抽):
  - `streak.dayIncreased` (daily streak +1) → +1 抽
  - `connectome.variantSlotUnlocked` → +1 抽
  - `connectome.actionPotentialThresholdCrossed` (每個 10/30/80/200/500 threshold first-time crossing) → +1 抽

**為什麼這數字**:
- Catalog = 20 張卡（見 Decision 5），每日 5 抽 × 16 天 ≈ 解完一輪（保底 P2+ 出率約每天會抽到 1 張）
- 上限 5 抽防止一日狂打 20 抽破壞「rest produces inspiration」的節奏感
- 行為軸 bonus 用既有 event bus 不需新事件（mirror `neuron-variant-gacha` 的 connectome event 消費 pattern）
- 30 min / 60 min 跟既有 streak 系統的「連續唸書 30 min 才算 1 day」對齊

**Alternatives considered**:
- 純時間軸 (e.g. 每 15 min 1 抽 cap 4)：失去「答題行為」回饋，跟 variant gacha 重疊 — pass
- 純行為軸：失去「rest produces inspiration」narrative — pass
- 每日上限 10 抽：玩家一日打完所有 catalog，喪失蒐集 stretch — pass
- 不設每日上限：可被 grinding 玩家 1 小時打 50 抽，破壞節奏 — pass

### Decision 2: 5 種一次性靈感事件 type 與 magnitude

| `eventKind` | Effect | Magnitude | Duration |
|---|---|---|---|
| `family-buff` | 隨機選 1 個 family，該 family 答題 AP +2 而非 +1 | +1 額外 AP per correct answer | 1 小時 wall-clock |
| `variant-rate-up` | 下一次 variant slot unlock 的 rarity weight 改 20/30/30/15/5 (vs 預設 60/25/10/4/1) | 一次性 single slot unlock | 直到下一次 slot unlock |
| `quick-review-batch` | 立刻彈出 5 道 SRS due 題目串連答（任何科目） | 5 道題、答對照常 + AP | 立刻觸發 |
| `streak-shield` | 下次連續沒打開 app 1 天時 streak 不歸零 | 1 次「免疫」 | 直到使用（永不過期） |
| `hidden-reveal` | 顯示下一張 P1 DMN 卡的 artworkId「劇透提示」（圖鑑 silhouette 變清晰但不直接給卡） | UI 顯示，零遊戲機制影響 | 永久 |

**為什麼這 5 種**:
- 涵蓋三類玩家動機：(a) 進度加速 `family-buff` / `variant-rate-up` / `quick-review-batch`、(b) 防損 `streak-shield`、(c) 蒐集 spoiler `hidden-reveal`
- 每種都對應神經科學 narrative：
  - `family-buff` = 「神經元自發 burst firing」
  - `variant-rate-up` = 「synaptic plasticity 短時提升」
  - `quick-review-batch` = 「consolidation during REM」
  - `streak-shield` = 「myelination 保護記憶痕」
  - `hidden-reveal` = 「DMN 預先 simulate 可能性」
- 不放永久 stat buff（避免跟 variant gacha 衝突 / power creep）

**Alternatives considered**:
- 8–10 種事件：design + balance complexity 大幅增加，5 種足夠涵蓋玩家動機 — pass
- 加「金錢 / currency 獎勵」事件：neurons-tw 無 currency 系統 — N/A
- 永久 buff stack：破壞 variant gacha 「永久 stat」獨占性 — pass

### Decision 3: DMN rarity ladder = P1–P4 4-tier (不是 P1–P5)

**選擇**:
- Weights: **P1 = 2% / P2 = 10% / P3 = 30% / P4 = 58%**
- 不照 `neuron-variant-gacha` 的 P1–P5 (60/25/10/4/1) 對齊

**為什麼**:
- DMN 卡每張都有事件 effect → 事件設計成 P1 最強 / P4 最弱；P5 太弱會被視為垃圾 (variant gacha 的 P5 至少還是 permanent stat)
- 玩家拿 P1 機率 2% × 20 張 catalog = 平均 50 抽見 1 張，符合「真的稀有」但不到「永遠拿不到」
- 4-tier 比 5-tier 少一層意味著平均單抽 EV 更高（P4 58% vs P5 1%）— 補償「事件用完卡留圖鑑」的「半壽命」感

**Alternatives considered**:
- P1–P5 對齊 variant gacha (60/25/10/4/1)：對齊代價是 P5 雞肋 — pass
- P1–P3 3-tier (15/35/50)：太扁平、缺失「終極稀有」目標 — pass
- 對齊 二階 hospital-fate-cards rarity table：未檢查 — 略

### Decision 4: v1 → v2 bundle schema bump + reader tolerance (backward compat)

**現況**: `apps/neurons-tw/src/lib/sync/r2/bundles.ts` line 87-91 對 schema_version `< 1` 或 `> SCHEMA_VERSION` 都 throw（hard fail）。直接 bump 到 v2 會讓尚未升級的 v1 client 讀 v2 bundle 時整個 sync engine 死。

**選擇**:
1. **改 reader tolerance**: line 90-91 `throw 'unsupported_schema_version'` → `console.info('[sync] bundle schema_version newer than client; unknown fields will be dropped')` 後繼續 parse；schema_version `< 1` 仍 throw（防 corrupt bundle）
2. **`SCHEMA_VERSION` bump 1 → 2**
3. **新增 4 個 optional dmn-* fields** (在 `BundleSnapshot` interface 加 `?`):
   - `dmnCards?: DmnCardRow[]`
   - `dmnMeta?: { dailyDrawsConsumed: number, dailyDrawsResetAt: string, bonusDrawsAvailable: number }`
   - `dmnEventLog?: DmnEventLogRow[]`
   - `dmnActiveBuffs?: DmnActiveBuffRow[]` (有 TTL 的事件 effect)
4. **v1 client 讀 v2 bundle** → tolerance log + drop dmn-* fields，其餘照常 parse
5. **v2 client 讀 v1 bundle** → dmn-* fields undefined → preserve-on-omission（用 local 值 / default empty）

**為什麼**:
- 走 二階 `add-bookmarks-filters-and-wrong-history-medexam2` 的同個 pattern（已實證一週 dogfood、跨裝置 race 都沒問題）
- 不開新 bundle = 不動 Worker presign whitelist + 不加 client adapter 第 5 個 bundle entry，scope 最小
- Optional field design = 永遠 backward-compatible（即使未來再加 dmn-* 子欄位，v2 client 也照樣 parse）

**Alternatives considered**:
- 不 bump schema_version、直接加 optional fields：可行但失去「明確標記新版本」的 telemetry signal — pass
- 開新 R2 bundle `dmn`：Worker + auth + presign + 第 5 個 client adapter — scope 過大 — pass
- 強制升級所有 client（拒絕 v1 client）：dogfood 階段不需要 — pass

### Decision 5: Catalog = 20 張卡 + 21 張 placeholder artwork

**選擇**:
- **Catalog 大小 = 20 張卡**：P1 × 2 / P2 × 4 / P3 × 6 / P4 × 8
- **Artwork**: 每張卡 1 張 384×384 正面 + 1 張共用卡背 = **21 張 PNG**
- **本 change ship placeholder** (1×1 transparent PNG)；real art 走 follow-up `generate-dmn-card-artworks` (codex CLI batch ~1 hr)

**為什麼 20**:
- 20 / 5 平均日抽 = 16 天 / 滿圖鑑（給 Threads 公開後 dogfood 階段足夠長的 retention curve）
- 5 種 eventKind × 4 卡平均 = 每種 event 有 ≥ 3 張卡帶它（validator 強制 ≥ 1，design 給更高 floor）
- 每 rarity tier 卡數遞增 (2/4/6/8)：稀有度跟密度相關，P4 撞到次數多 = 「DMN 重複靈感」narrative

**Alternatives considered**:
- 30 張：retention curve 延長到 ~24 天，但 catalog design + art generation 時間翻倍 — 後續再加
- 10 張：~8 天解完，太快 — pass
- 50 張：對應 二階 hospital fate cards catalog 大小，但 neurons-tw narrative 不需要那麼多事件 type — pass

### Decision 6: Threads 文案 = owner 手寫（不走 /klaude-vibecoding 自動）

**選擇**: 本 change scope 不含 Threads 文案；ship 後 owner 手寫貼文 + 4 張截圖 (connectome / variant gacha / DMN modal / DMN collection page)，走 `wlk-public-writing-style` + `/threads create_thread` 發。

**為什麼**:
- DMN 的神經科學梗 + 個人 vibe-coding 心得 owner 自己寫最有 voice（`/klaude-vibecoding` 適合長文，Threads 短文 owner 直寫更快）
- 本 change 純 feature ship，文案歸 ship 後 marketing action

### Decision 7: 觸發 detection 架構 (single `dmn-trigger.ts` service)

**選擇**:
- 新 `apps/neurons-tw/src/services/dmn-trigger.ts` 單一服務 at boot 註冊：
  - `ReadingTimerSubscriber` interface（時間軸 — 接 reading-timer service tick）
  - Event bus listener for `streak.dayIncreased` / `connectome.variantSlotUnlocked` / `connectome.actionPotentialThresholdCrossed`
- 內部 maintain pending bonus draws + daily-cap counter
- Daily midnight reset (lazy on next user interaction crossing local midnight — 跟 connectome-collection 的 reset 同 pattern)
- Stub reading-timer interface: 接口存在但 timer service 不在本 change ship → 時間軸 inactive，DMN 暫時純行為軸；polish change ship 後 timer service 一上線自動接通

**為什麼集中在單一 service**:
- 避免散落在 4–5 個 trigger 點各自寫 boilerplate
- Daily cap counter / pending bonus counter 統一管理，跨裝置 sync 邊界清楚
- Mirror `neuron-variant-gacha` 的 single `variant-gacha.ts` orchestrator pattern

### Decision 8: Event dispatch idempotency + cross-device sync

**選擇**:
- 每張抽到的卡 → 立即 dispatch event via `dmn-event-dispatcher.ts`
- `dmnEventLog` table 紀錄 `(cardId, dispatchedAt, deviceId)`，sync 用 **monotonic-union merge**（不是 LWW）— 任一 device 觸發過就算觸發、卡不會在另一 device 重抽
- `dmnActiveBuffs` 用 `(buffKind, expiresAt)`，sync 用 LWW on `expiresAt`
- 跨 device race：device A 抽出 family-buff、device B 同步前也抽出同卡 → idempotent 在 cardId 唯一性（每張卡 unique，抽過就從 pool 移除 — 走 LWW on `obtainedAt` + monotonic-union on `dmnEventLog`）

**為什麼 monotonic-union for event log**:
- LWW 會讓 device A 在 line 後同步 device B 的「未觸發」狀態，導致重觸發
- 跟 二階 `add-bookmarks-filters-and-wrong-history-medexam2` 的 `everWrong` monotonic-OR 同 pattern

### Decision 9: 「卡從 pool 抽到後從 pool 移除」vs 「可重複抽」

**選擇**: 卡 unique（pool 抽到後該 cardId 不再 redraw）— **closed-cap collection**，全 20 張抽到後抽卡功能淡出（按鈕變灰、文案改「DMN 圖鑑已完整、累積經驗繼續 +AP」）

**為什麼**:
- Mirror `neuron-variant-gacha` 的 closed-cap pattern (Pokédex 蒐集而非 infinite slot machine)
- 避免「重複抽到同卡」的負面情緒
- 蒐集完成有明確 milestone（可接 achievement trigger，sibling change scope）

**Alternatives considered**:
- 可重複抽 + 多張同卡可疊 buff：power creep 風險 + 增加 design complexity — pass
- 抽完後重置 catalog：破壞 milestone 感 — pass

## Risks / Trade-offs

- **[Risk] v1 client backward compat 沒測試完整** → **Mitigation**: Vitest `dmn-bundle-cross-version.test.ts` 必含兩個方向（v1 → v2 / v2 → v1）round-trip；CI 跑通才 merge；dogfood 前手動跑跨裝置（一邊裝 v1 = production GH Pages、另一邊裝 v2 = CF Pages staging）
- **[Risk] Event magnitude 平衡未經實證** → **Mitigation**: Ship dogfood 一週後 owner review telemetry（每種 event 觸發頻率 / 是否被視為「白癡 vs 神物」），第二個 change 微調 magnitude
- **[Risk] 行為軸觸發跟現有 streak / variant gacha 過度耦合** → **Mitigation**: trigger detector 是純消費端（不改 publisher）；如果發現某個 event 觸發過頻，調 magnitude 不調 trigger source
- **[Risk] Placeholder art ship 第一週很醜** → **Mitigation**: 接受、follow-up change 1 週內補；Threads 公開 wait 直到 real art 上線（owner 先 dogfood 一週、real art 跟 polish change 同 wave ship）
- **[Risk] Dexie v5 → v6 migration 在既有 dogfood saves** → **Mitigation**: 純加 table + meta keys（無欄位變更）；標準 Dexie upgrade callback；smoke test 從 v5 fixture 升 v6 verify 行為
- **[Trade-off] Closed-cap (20 張) 一輪解完 retention 結束** → 接受：本 change ship 為 Threads 公開鉤子，retention 由 base game loop (connectome / variant / streak) 維繫，DMN 是 novelty 而非長期黏著機制
- **[Trade-off] 時間軸 stub 階段 DMN 純行為軸** → 接受：polish change 1 週內 ship 接通；stub 階段玩家仍能透過行為觸發拿卡（最低 1–3 抽 / day）

## Migration Plan

**Phase 1 — Code merge (本 change)**:
1. Catalog + validator + types (no runtime impact)
2. Dexie v5 → v6 migration
3. R2 bundle schema bump v1 → v2 + reader tolerance
4. Service layer (trigger / orchestrator / event dispatcher)
5. UI (modal / collection page / button)
6. Worker schema bump (separate PR or same commit)
7. Vitest covering catalog validator + roll mechanics + bundle cross-version + event idempotency

**Phase 2 — Deploy**:
1. CF Pages + GH Pages 同步部署（依 `add-neurons-deploy` two-deploy pipeline）
2. Worker `deploy-worker.yml` 跑一次（schema v2 上線）
3. Smoke check：Chrome MCP 跑 single-device draw + cross-device sync (v1 client on GH Pages reading v2 bundle 不 throw)

**Phase 3 — Dogfood (1 週)**:
1. Owner 自己每日 dogfood，蒐集 event magnitude feedback
2. 同期 ship `polish-neurons-pre-ship`（reading-timer 接通 → DMN 時間軸 activated）
3. Ship `generate-dmn-card-artworks`（real art 替換 placeholder）

**Phase 4 — Threads 公開**:
1. Owner 手寫 Threads 串文 + 4 張截圖
2. 走 `/threads create_thread` 發
3. Ship 後 第一週每日掃 Supabase `bug_reports` 走 L1 hotfix workflow

**Rollback**:
- 純加 capability、不改既有 game loop → 直接 revert merge commit即可
- Dexie v6 → v5：標準 Dexie 不支援自動降版；rollback 需手動 `DELETE FROM dmnCards; DELETE FROM meta WHERE key LIKE 'dmn%'` (DEV-only) 或讓玩家 reset save (極端情況)
- R2 bundle v2 → v1：直接把 SCHEMA_VERSION 改回 1，v2 bundle 的 dmn-* fields 在 v1 client 看不到（preserve-on-omission），不破壞既有資料

## Open Questions

（design.md 解開 grill summary 6 個 uncertainty 後，目前無 critical 未決問題。可能 emerge 的細節留給 tasks.md / apply 階段：）

- Modal 動畫的 framer-motion 變換具體 timing（複用 `neurons-motion-library` SYNAPSE_TIMINGS 或新建？）→ apply 階段決，預設複用 SYNAPSE_TIMINGS
- DMN 入口按鈕放 top nav 還是 connectome 角落浮動 → apply 階段看 UX 試出來
- 「DMN 圖鑑完整」milestone 是否觸發 achievement → 留給後續 achievement catalog 加一條 P1 entry（不在本 change scope）
