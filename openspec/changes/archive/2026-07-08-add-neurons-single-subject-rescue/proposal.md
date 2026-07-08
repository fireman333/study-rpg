## Why

高配分科目（如解剖學）在考前需要「鎖定單一科目、綁定考試日、把有限時間換成最大單科分數」的救急刷題模式，但 neurons 現有機制全是跨科或通用的：expedition 拉全科錯題、daily prescription 每天只輪一個盲區 family 且總量 cap 12、targeted drill 是無考試日框架的隨手弱點練習。沒有任何入口能回答「我 3 天後考解剖，這 3 天怎麼刷這一科最有效」。

本 change 引入以學習科學實證為基礎的**單科考前救急系統**（single-subject last-minute rescue）——一次只救一科、依剩餘天數 D（1–7）做 backward-planning 逐日排程、用「救分 ROI」而非「複習優先度」選題。設計刻意做到 **MVP 零 Dexie/R2 schema 改動**（救急狀態、信心紀錄、telemetry 全 device-local），以最低風險快速 dogfood。可外推到任何科目（解剖只是首個範例）。

實證錨點（詳見 design.md）：retrieval practice（Roediger & Karpicke 2006）、pretesting g=0.54（Pan 2023, PMID 37640836）、時窗內 spacing（Cepeda 2008）、elaborated feedback g=0.49（Van der Kleij 2015）、hypercorrection（Butterfield & Metcalfe 2001）、study-technique utility 排名（Dunlosky 2013, PMID 26173288）。

## What Changes

- **新增救急模式核心**：選題演算法 `priority(q) = Yield × Movability × Confidence × typeCoefficient ÷ EstTime`，含分診丟棄（已會 / 沒救的低頻）與止損干預切換（高頻卡關 → 塞速看版 kernel 重讀再測；低頻卡關 → 降權）。
- **診斷突襲（diagnostic blitz）**：進入救急先做一場考頻加權摸底測（題數隨 D 縮放，D=1 縮到 10 題並以既有答題史當底），產出 concept 紅/黃/灰戰情圖。
- **Pre-reveal 雙鍵信心捕捉**：救急 session 內選項選定後點「確定・有把握 / 確定・猜的」即送出（tap 即 submit，零額外摩擦、pre-reveal 無偏），用以挖出「高信心答錯」並施加 `×1.5` hypercorrection 加權。
- **Backward-planning 逐日排程**：從考試日往回、每晚 rolling 重排；spacing 壓縮進剩餘時窗；考前夜純鞏固；新增考試日早晨 15 分鐘速掃 preset。
- **RescueScore(0–100)** 就緒度指標（runtime recency-decay 衍生）+ 質性回報三檔（夯/普通/低迷；**不顯示假精確的「預估追回 X 分」**）。
- **救急 lifecycle**：啟動 / D-day 倒數 / 考後自動歸檔並 revert 特訓吸收 / 中途放棄 / 一次一科 gate。
- **薄 telemetry**：device-local flat append-only JSON + 一鍵 export（**不做 in-app 圖表 / dashboard**），供 dogfood 校準 magic number。
- **修改 homepage 入口**：FamilyPicker header 新增常駐「考前救急」入口鈕；active 救急科的 family card 變身為救急 chip（D-N · RescueScore · 今日佇列 CTA）。
- **修改 weakness-radar 特訓吸收**：救急期間，該科的 one-tap targeted drill 路由進當日救急佇列（不另開平行 drill）；考後自動 revert；其他科不受影響。
- **外推 seam**：`typeCoefficient(q)` 函式與呼叫點就位、MVP 一律回傳 `1.0`（factual/reasoning 真值 defer v2），並以 Vitest 契約測試鎖定其在 priority 公式內被呼叫。
- 非 BREAKING：純加法；MVP **不 bump** Dexie version / R2 SCHEMA_VERSION / SYNCED_META_KEYS。

## Capabilities

### New Capabilities
- `neurons-single-subject-rescue`: 單科考前救急模式的完整行為契約——救急 lifecycle、diagnostic blitz、`priority` 選題演算法（Yield / Movability / Confidence / typeCoefficient / EstTime + 分診 + 止損干預）、pre-reveal 雙鍵信心捕捉、backward-planning 逐日排程與時窗 spacing、RescueScore 與質性回報、考試日早晨速掃、止損 device-local 覆寫、薄 telemetry、零 schema / device-local 不變量。

### Modified Capabilities
- `neurons-homepage`: FamilyPicker 新增 header 級「考前救急」常駐入口鈕（不受 `pressure >= 0.45` 特訓鈕渲染門檻限制）；active 救急科的 family card 於 WeaknessIndicator 列改渲染救急 chip（D-N · RescueScore · 今日佇列 CTA）。
- `neurons-weakness-radar`: 既有 one-tap targeted drill 行為新增條件覆寫——WHEN 該 family 有 active 救急計畫，THEN 其 targeted-drill 入口 SHALL 路由進當日救急佇列而非另開 generic drill；考後自動 revert；無 active 計畫時行為不變。

## Impact

- **新增（純衍生 + UI + device-local，零 schema）**：`buildRescueQueue`（含 core quota vs 覆寫加練 quota 分離）、`buildSubjectHighYieldPool`（join `CramPushItem.sourceQuestionIds` + 語料庫 9 年考頻 fallback）、`computeRescueScore`（recency-decay）、`deriveConfidenceSignal`、`typeCoefficient`（回 1.0 + 契約測試）、device-local rescue store（lifecycle + 佇列 + 止損解除旗標 + pre-reveal 信心 + telemetry）。
- **複用**：`filterPoolByFamily/Year/NewOnly`、`buildTargetedDrillPool`（救急期被吸收）、`computeWeaknessPressure`、`buildDueReviewPool`、cram kernel + `CramPushItem`、`buildSpeedReviewCards`（止損干預 + 早晨速掃）、`QuizModal` + `recordQuestionResult`、expedition session 容器。**刻意不接** `recordCramRescueAnswer` / `creditCramRescue`（會寫既有 synced prescription meta、破壞 device-local 精神）——救急答題只走 `recordQuestionResult` + SRS。
- **UI**：`FamilyPicker.tsx`（header 鈕 + card 變身）、救急 setup / 診斷突襲 / 戰情圖 / 救急 session（複用 expedition + 救急專用雙鍵 pre-reveal 送出）/ 早晨速掃 preset / lifecycle 歸檔・放棄；文案「救急計畫與信心紀錄存於本裝置」。
- **不動**：Dexie schema（`apps/neurons-tw/src/lib/db.ts` version chain）、R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS`、sync engine、後端 Worker。換裝置只損「計畫殼」，答題結果走既有 `recordQuestionResult` → questionHistory 已同步，佇列可從已同步輸入重建。
- **medexam-tw / 二階不受影響**（資料與程式完全獨立）。
