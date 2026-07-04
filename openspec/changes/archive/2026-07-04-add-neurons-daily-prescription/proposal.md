## Why

考前最後 13 天（考試 2026-07-17），玩家最大的阻力不是「不想讀」，而是**決策癱瘓 + 啟動成本**——打開 app 面對 ~4600 題、11 科、一堆錯題，不知道現在該先刷哪裡，於是乾脆不開始；而且不知道「今天何時算讀完」，讀到深夜也停不下來。此時 app 的角色應從「催你多讀」轉為**減害**：給下一步、給結束的許可、讓努力與休息看得見、不加壓不恐嚇。本 change 交付一組**每日一開一關**的體驗（處方箋開 + 熄燈關），設計方向由 OpenEvidence PubMed-anchored 實證支持。

## What Changes

- **今日處方箋（開）**：首頁每日兩行處方（訂正錯題 N + 開發盲區 M，總量 ≤12），單一 CTA「開始今日處方」自動導向下一個未完成項（先錯題後盲區），玩家不需選模式；路由進**現有**錯題出征與 family `fresh` 新題模式（不新增 quiz mode）。少寫題 MVP = unseen。
- **完成獎勵 NG-0717（收藏神經元）**：完成處方養成「NG-0717」——一隻齒狀迴新生神經元 mascot，隨**完成天數**逐步成熟 4 階段（幹細胞→遷移→佈線→成熟），完全體解鎖永久 keepsake（刻印 2026.07.17）。當情感隱喻，文案只斷言無爭議的神經學事實（成熟歷程 / 學習促存活 / 系統固化）。
- **抗焦慮 pacing**：成熟只看 rolling 完成天數（不綁日曆）、只增不減、漏一天中性無懲罰、無達不到的分母、考後不 lockout（倒數轉「考試結束 · 繼續固化」）。直接解「不到 14 天」+「不想有漏刷負面感」。
- **熄燈儀式（關）**：首頁常駐「今天到此為止」，按下 → connectome 轉夜景、今天碰過的科微光、rest/睡眠固化 reframe；任何時間可按、每日一次；之後首頁進入低刺激收工態（安靜/隱藏 push CTA，但非 hard lock，可「還是想再讀一下」還原）。純質性、不顯示題數/倒數/pass-fail。
- **經濟安全（hard）**：不發 DMN 抽卡、不發新貨幣、不新增排行榜軸；可選物質獎勵只走既有 daily-capped 傳導能量 faucet。
- **零 Dexie schema bump**：所有每日狀態放 `meta` key-value（per-day ISO-date + per-question write-once key），全 local-only，不進 `SYNCED_META_KEYS`。

## Capabilities

### New Capabilities
- `neurons-daily-prescription`: 每日兩行處方的生成/縮放/選科規則、單一 CTA 路由、進度計數與防灌水、抗焦慮的 partial/monotonic/無負面感 pacing、完成獎勵 NG-0717（rolling 成熟 + 永久 keepsake）、零-schema meta 資料模型與經濟安全不變式。
- `neurons-lights-out`: 「今天到此為止」熄燈收工儀式——夜景 + 質性回顧 + 睡眠固化 reframe + 低刺激收工態（非 hard lock），local-only、零 schema、睡眠文案 OE 錨。

### Modified Capabilities
- `neurons-homepage`: 首頁 OverviewPage SHALL 在 merged stat card **上方** surface 可收合的「今日處方箋」卡片（兩行進度 + 單一 CTA + NG-0717 成熟顯示），展開/收合 device-local 記憶。

## Impact

- **New code** (`apps/neurons-tw/src/`):
  - `lib/services/prescription.ts` — 處方生成（snapshot 錯題 eligible + 選盲區科 + 縮放 N/M）、進度計數、完成/NG-0717 成熟/獎勵判定，全走既有 `meta`。
  - `lib/hooks/usePrescriptionStatus.ts` — reactive 狀態 hook（mirror `useDmnStatus`）。
  - `components/DailyPrescriptionCard.tsx` — 卡片 UI（兩行進度 + CTA + NG-0717 mascot 依 derived stage + 收合）。
  - `components/LightsOutRitual.tsx`（或掛進 homepage）+ 收工態 gating。
  - 掛載進 `routes/OverviewPage.tsx`（處方卡在 stat card 上方；熄燈控制常駐）。
- **Reused, unchanged**: 錯題出征 `buildWrongQuestionPool`、family `fresh` `filterPoolByNewOnly`/`computeFamilyModeCounts`、每日重置 `runDailyResetIfNeeded`、`todayISO()`、傳導能量 faucet、connectome 夜景重用既有 render。**不新增 quiz mode**。
- **New asset**: `packages/theme-pixel-neurons/sprites/` 新增 NG-0717 4 階段 sprite（384×384 16-color GBA 風透明背景，concept 已生成），走既有 `src/sprites.ts` `import.meta.glob` 註冊。
- **No schema / sync change**: 不改 Dexie `.version()`、R2 `SCHEMA_VERSION`、`SYNCED_META_KEYS`、D1；不動 DMN。
- **Neuroscience anchors**: design.md 附 OpenEvidence PubMed citation 表（reconsolidation / behavioral tagging / systems consolidation / retrieval-as-LTP / 顆粒細胞成熟序列 / 成人人類神經新生爭議避雷 / 睡眠固化）。
