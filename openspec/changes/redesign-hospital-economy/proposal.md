## Why

二階 hospital mode 目前的經濟體系存在三個結構性缺陷：(1) 營收 (`revenue`) 是純擺設 — 整個 codebase 沒有任何 subtraction / spend / cost site；(2) idle tick 累積 reputation 跟玩家是否真的在念書脫鉤，導致掛機通關，違背「養成型 RPG for exam prep」的核心承諾；(3) 升級門檻只看 reputation，被抽運放大 — lucky P1 玩家比 unlucky P5 玩家快 10 倍通關。本 change 把營收 / 聲望 / 升級重新對齊「念書時間就是進度」的主軸，並用 dual-gate（聲望 + 不同科別醫師收集數）穩定 pacing 到約 30 天 endgame。

## What Changes

- **新增「唸書 session」surface** — 計時 reading mode，玩家進入後 tick 才跑、退出立刻停。仿一階 reading timer：visibilitychange + idle > 90s auto-pause 防作弊。視覺呈現「醫師看診畫面」（codex 生 sprites）
- **移除 idle 自動 tick** — `runTick()` 不再每 5 秒自動觸發；改為 study session 啟動期間才 tick
- **新增 `totalStudyMinutes` counter** — 累積讀書分鐘數，供 telemetry / 命運卡 cap / dogfood 調整參考；不直接 gate tier（gate 仍走 reputation）
- **移除 per-Q reputation hook** — 答題正確只增加 `affinity.correctCount`（招募 gate），不再 +reputation。reputation 來源唯一是 study session tick
- **加第 4 個 tier「國家級教學醫院」** — 拉長 endgame；`TIER_ORDER` 變 4 entries
- **Tier upgrade dual-gate** — 聲望門檻校準 (48k / 192k / 2,000,000) + 不同科別醫師收集數（5 / 8 / 12，後兩階要求 P3+ / P2+ 且含 P1）
- **新增「醫師進修」** — 消耗營收以機率升級醫師 rarity（P5→P4 50% / P4→P3 30% / P3→P2 15% / P2→P1 5%）；失敗只損營收、不掉 rarity；同醫師連續失敗 N 次後 pity 必中
- **新增「醫師薪水」recurring drain** — **全員制**（含 bench）+ proportional salary = `powerMultiplier × 4 / min`；診所 0% grace + 區域以上 100% rate；數值校準成 default 配置每階都 net positive（無需 0 floor clamp 觸發）。設計意圖：用 payroll 壓力獎勵擴建 + facility 投資，但不會破產
- **新增「設施升級」** — 消耗營收提升 `room.roomFacility` 倍率（1.0 → 1.5 → 2.0 → ...）
- **新增「房間擴建」** — 在 tier 內額外購買 outpatient / surgery / ward 房間
- **新增「特殊事件」** — 觸發率隨 reputation scale（0.5–3.0×），含醫療糾紛 / 負面新聞 / 學會質疑（負面，扣 rep）/ VIP 病人 / 急診加開 / 醫療評鑑 / 學會獎項（正面）。負面隨機 rep 損失 1k–10k，總比率 ≤ 5%
- **新增「命運卡」抽卡** — 消耗 reputation 抽 4 階卡包，內容池含招募券 / 進修保證券 / facility / throughput 加成 / 衰運。**Pity 3：連續 3 次衰運後第 4 次必中 reward**（每階獨立 counter）
- **新增「教學提示機制」** — 首次玩 7 步 onboarding 流程 + 每個 surface 首訪 contextual hint + 隨時可開的 `❓` help menu + state-trigger toast tips（如 revenue 達 1000 / pity 達 5）

## Capabilities

### New Capabilities

- `hospital-study-session`: 唸書 surface 行為定義 — session 啟動 / 暫停 / 停止語意、tick 跟 session 綁定、visibilitychange + idle auto-pause、看診 scene assets
- `doctor-training`: 醫師進修機制 — 消耗營收、機率升級、失敗保護、pity counter
- `hospital-finances`: 整合營收 sink — 醫師薪水（assigned-only drain）+ 設施升級 + 房間擴建
- `hospital-events`: 隨機特殊事件 — 醫療糾紛 + VIP 病人，trigger 條件、解析機率、reward / penalty
- `hospital-fate-cards`: 命運卡抽卡 — 4 階卡包定義、reputation 消耗、內容池、consecutive-bad-luck pity 3
- `hospital-tutorial`: 遊戲教學系統 — 7 步 onboarding flow + per-surface contextual hint + always-available help menu + state-milestone toast tips

### Modified Capabilities

- `hospital-tycoon-engine`: idle tick 拿掉，改成 session-tick only；新增 `totalStudyMinutes` 欄；移除 per-Q reputation hook 引用；薪水扣款掛在 tick 內
- `clinic-level-up`: TIER_ORDER 加第 4 個「國家級教學醫院」；tier gate 從單一 reputation 改成 reputation + diversification dual-gate
- `hospital-reputation`: per-Q hook 移除（reputation 只來自 session tick）

## Impact

- **Code**：
  - `apps/medexam2-hospital-tw/src/lib/tick.ts` — 拿掉自動 setInterval、改成 session-gated
  - `apps/medexam2-hospital-tw/src/db/schema.ts` — `gameCounters` 加 `totalStudyMinutes`；新表 `trainingHistory` / `eventLog` / `fateCardHistory`
  - `apps/medexam2-hospital-tw/src/pages/` — 新增 `StudySessionPage.tsx`（看診 scene）/ `TrainingPage.tsx` / `FateCardPage.tsx`
  - `packages/content-medexam2-tw/src/` — 新增 `training.ts` / `finances.ts` / `events.ts` / `fate-cards.ts`；改 `reputation.ts`（移除 per-Q listener）/ `clinic-tiers.ts`（加 tier + diversification helper）
- **Schema**: gameCounters 加欄、3 新 table；HospitalDB version bump v4 → v6（v5 預留給 cloud sync 用，已在 add-cloud-sync 規劃）
- **Assets**: codex 生看診場景 sprites（醫師看病人、診間互動）— 至少 4 種 room type × 1 種狀態
- **Spec dependencies**: 影響 `hospital-management-mode` capability 的某些 high-level 假設（如「rooms auto-process patients」），但不改 hospital-management-mode 本身（top-level capability 描述仍成立）
- **Backwards compat**: v4 → v6 migration patcher 加進 `db/schema.ts` upgrade chain；既有玩家保留進度，新欄位 default 0
- **Pacing target**: dogfood 對齊「中位數玩家 30 天通關」(20 / 50 / 200 hr 累積讀書 → 區域 / 醫學 / 國家級)；variance ±20%
