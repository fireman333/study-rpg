## Context

neurons-tw 是台灣醫師一階國考考古題的像素 RPG reskin（~4600 題 / 11 subject family）。現有選題機制全為跨科或通用：expedition 拉全科錯題、daily prescription 每天只輪一個盲區 family 且總量 cap 12、weakness-radar 的 one-tap targeted drill 是無考試日框架的隨手弱點練習。玩家（醫學生）在考前針對某高配分科目（如解剖學）想「鎖一科、綁考試日、把有限時間換成最大單科分數」時，沒有對應模式。

本設計源自四路整合（Codex + Fable 獨立設計 + 學習科學實證文獻 + codebase 探勘）→ Fable 審查 → 使用者 grill 拍板 6 決定 → Codex/Fable 二輪討論。核心約束：**MVP 零 Dexie/R2 schema 改動**（救急狀態全 device-local），沿本 repo「零 schema 優先、免走 upgrade-fixture」的低風險路線。

現有可複用 handle（探勘確認）：`filterPoolByFamily/Year/NewOnly`（quiz-pool）、`buildTargetedDrillPool`（weakness-pressure.ts）、`computeWeaknessPressure`、`buildDueReviewPool`（srs-scheduler）、cram kernel + `CramPushItem.tier`/`sourceQuestionIds`、`buildSpeedReviewCards`、`QuizModal` 單一答題入口 + `recordQuestionResult`（必觸發）、expedition session 容器、`FamilyPicker`（既有一鍵特訓在 `pressure >= 0.45` 才渲染）。**刻意不接** `recordCramRescueAnswer`/`creditCramRescue`——那會寫既有 synced prescription meta，破壞「零 side-effect / device-local」精神（Codex 審查點）。

## Goals / Non-Goals

**Goals:**
- 一次只救一科、依剩餘天數 D（1–7）最大化「每分鐘邊際期望得分」的救急模式。
- 選題以「救分 ROI」而非「複習優先度」排序，並敢於**分診丟棄**（已會 / 沒救的低頻）。
- 挖出「高信心答錯」（最大隱形漏分）並施加 hypercorrection 加權——用 **pre-reveal** 信心捕捉，不汙染訊號。
- 可外推到任何科目（`typeCoefficient` seam）。
- MVP 零 schema、全 device-local，快速 dogfood。

**Non-Goals（defer v2 或永不做）:**
- 分數預測曲線、factual/reasoning 真旗標（人工標）、跨科「救完換下一科」meta 排程、睡眠 guard、信心跨裝置同步 → v2。
- 不 bump Dexie / R2 SCHEMA_VERSION / SYNCED_META_KEYS；不動 sync engine / 後端 Worker。
- 不影響 medexam-tw / 二階（資料程式獨立）。
- 不引入 IAP / 付費 / 廣告獎勵（救急不發任何 gacha roll；純學習工具面）。

## Decisions

### D1. 目標函數 = 邊際期望得分，非長期保留
救急最大化「固定近期截止日 D、單一科目、每分鐘邊際期望得分」。這使多處「學習常識」（尤其 spacing 教條）需重新校準，並正當化分診丟棄與 subject-level blocking。**Alternative**：沿用平常刷題的長期保留目標 → 否決，會把時間浪費在低頻與已會題。

### D2. 選題演算法：乘法 ROI
```
priority(q) = Yield(q) × Movability(q) × Confidence(q) × typeCoefficient(q) ÷ EstTime(q)
```
除以 EstTime 使其成為真正的「每分鐘」ROI。**Alternative**：Codex 的加權和 `0.32·freq + 0.23·kernel + ...` → 採乘法（Fable），因乘法更可解讀、且時間成本自然入分母；加權和的係數更難調且不含時間維度。

- **Yield(q)**：`CramPushItem.tier` 是 freeform string，實際值為 `常青必掃 / 穩定考點 / 經典但降溫`（build 產物確認），ordinal 映射 高/中/低（≈1.0 / 0.6 / 0.3，數值 dogfood-tunable）；未命中 concept → **語料庫 9 年跨年出題次數分位數 fallback**（top/mid/bottom tercile → 高/中/低），不一律判低頻。stop-loss 的「high-frequency」與 triage 的「mid-frequency」門檻都指這組 band。實證：high-yield 80/20（Dunlosky 2013 間接 + Deng 2015 dose-response，每 +445 題 ≈ Step 1 +1 分, PMID 26498443）。
- **Movability(q)**：**5 band**（Unanswered / Wrong-learnable / Correct-unsure / Unrecoverable / Already-mastered；見 spec）——「高信心答錯」不是獨立 band，是 Wrong-learnable 題再吃 Confidence ×1.5。**Already-mastered = Movability 0（單點）**，由分診 `DROP if Movability==0` 丟；另 `DROP if <=0.05 AND Yield<中頻`（沒救冷門）。實證：region of proximal learning。
  - **U（未作答）**必須有 band——每日佇列 65% 是新題；用 concept-mastery 推 prior（弱 concept 0.8–1.0 / 強 0.2）。
  - **E（已會）**用「近期連對 ≥2 或 SRS `interval >= 7` 天未到期」判定，**不依賴 opt-in flag**（否則穩答對但沒標的題落進中檔、救急去重刷已會）。
  - **D（沒救難題）**改**純行為判準**（歷史錯 ≥3 且近期正確率 0 且已止損一次），**不引用型別旗標**——MVP 無旗標，若引用則 Band D 空集合 → 分診丟棄變死碼。
- **Confidence(q)**（信心 ×1.5 的唯一住所）：高信心答錯 ×1.5 / 低信心答對 ×1.1 / 其餘 ×1.0。實證：hypercorrection（Butterfield & Metcalfe 2001）——高信心錯被糾正後記最牢。
- **typeCoefficient(q)**：見 D5。

### D3. Pre-reveal 雙鍵信心捕捉（本案最 load-bearing 的縫）
救急 session 內把送出改成**雙鍵**：選定選項後點「確定・有把握」或「確定・猜的」其一即送出。tap 就是 submit → 零額外摩擦、pre-reveal、無偏。
- **Alternative A（post-reveal 答錯時收）**：否決——玩家已看到自己錯了才報信心＝回溯信心，有系統性偏誤，會讓 ×1.5 槓桿與其 telemetry 驗證一起被靜默汙染（Fable 二輪抓到；hypercorrection 要的是 *prospective* 高信心）。
- **Alternative B（純用現成 easyMarked/guessedMarked 反推）**：否決——那些是 opt-in 按鈕、覆蓋率低，「曾 easy × 現在錯」三重交集近乎空集合，槓桿失效。
- **Alternative C（答題前獨立信心 tap）**：否決——多一次點擊、摩擦高。
現有 flag 降為 cold-start prior；換裝置退化為 ×1.0 起步、session 內重新累積。

### D4. 止損干預切換 + device-local 覆寫
concept `attemptsToday>=6 且 recentAccuracy<0.40`：**高頻卡關 → 注入 concept-scoped 重讀卡強制 30 秒重讀、60–90 分後再測**（retrieval practice 對從未編碼的內容無效）。重讀卡來源 = 該 concept 的 `CramPushItem`（經 `sourceQuestionIds`）；無 concept-level 卡時 fallback 到 subject-level `buildSpeedReviewCards`（明標 fallback，因該函式是整科級、非 concept 級）。低頻卡關 → priority ×0.15。
玩家可覆寫「我就是要繼續練」，但：**device-local concept-level「止損解除」旗標**（存 rescue store），**不寫 synced `pinnedAt`**。
- **Alternative（複用 pin-queue）**：否決——`pinnedAt` 是 R2-synced（SV25），在 iPhone 覆寫會把題 pin 進 iPad 日常出征，救急狀態洩漏到全域體驗，且與 expedition 容器消耗時機互吃。
覆寫帶可見成本（「置頂會擠掉約 N 分鐘高頻目標」）、24h 或再 6 題自動重評、進「加練 quota」不擠 core quota、telemetry 記覆寫後正確率但**不計入演算法成功指標**（防考前自虐硬練冷門）。

### D5. 外推 seam：typeCoefficient 回 1.0
`typeCoefficient(q)` 函式與呼叫點就位、MVP 一律回 `1.0`，並以 **Vitest 契約測試**鎖定其在 priority 公式內被呼叫（防未來當「永遠回 1.0 的死碼」清掉）。命名 / UI 不得暗示已有題型智慧。
- **理由**：一次只救一科時型別係數是 subject 級常數 → 對科內排序是 no-op；真正作用在科內變異（需人工標、v2）與跨科 meta 排程（v2）。MVP 回 1.0 對核心佇列幾乎零損失。
- **Alternative（heuristic 自動猜型別）**：否決——無驗證資料下誤標 ×0.6 = 主動壓低好目標，風險大於收益。**Alternative（MVP 人工標）**：defer——要花標註時間，非 MVP load-bearing。

### D6. 入口分離 + 卡片變身 + 特訓吸收
- **codebase 事實**：`FamilyPicker.tsx:498-508` 一鍵特訓只在 `pressure >= 0.45` 渲染 → 不能升級同鈕（最需救急的薄史/綠色科目按不到入口）。且 gate 變數相反（特訓＝當下弱不弱；救急＝考試日逼近）。
- **三規則**：(1) **入口分離**——特訓鈕不動；救急入口 = FamilyPicker header 常駐「考前救急」鈕 → setup。header 級單入口天然承載「一次只救一科」。(2) **卡片變身**——active 救急科的 family card WeaknessIndicator 列改救急 chip。(3) **執行層吸收**——救急期間該科特訓鈕路由進當日救急佇列，考後自動 revert，其他科不受影響。
- **Alternative**：Codex 的「升級同鈕 + action sheet」→ 否決（渲染門檻 bug）；long-press（不可發現、桌機差）與 mode toggle（低頻功能常駐 UI 狀態）→ 否決。

### D7. 零 schema / device-local + 救急 lifecycle
救急 state（`{familyId, examDate, dailyMinutes, createdAt, lastStudiedAt, local-only}`）、當日佇列、止損標記、止損解除旗標、pre-reveal 信心、telemetry 全存 **device-local**（localStorage）。答題結果仍走 `recordQuestionResult` → questionHistory（已同步）。
Lifecycle：啟動 → D-day 倒數 → 考後自動歸檔並 revert 特訓吸收 → 中途放棄入口 → 救 B 科時 A 科 active 的一次一科 gate + confirm。
- **理由**：救急衝刺天生是「這台裝置、這幾天」暫態；零 schema 免走 upgrade-fixture、風險與工時最低。

### D8. RescueScore recency-decay + 質性回報
`mastery(c)` 用 runtime 掃該科 questionHistory 的 `lastResult × lastAnsweredAt` 指數 decay（τ≈7–14 天），**不用 `familyMastery`**（那只有累積 correct/total、無近期性）；`RescueScore = 100 × Σ Yield_norm·mastery / Σ Yield_norm`。回報顯示**質性三檔（夯/普通/低迷）**，不顯示「預估追回 X 分」。
- **理由**：Δp 是發明數字，精確分數是假精確、且不合本專案統計嚴謹措辭紀律（NS/估計值不做大字主視覺）。

### D9. Backward-planning 排程 + 時窗 spacing
從考試日往回、每晚 rolling 重排。**D = `examDate − today` 的 calendar-day diff：D=0 = 考試當天、D=1 = 考前一天。** 每日 ~20% 昨日錯題回收 / ~65% 高優先新目標（blocked 到 in-block 正確率 ≥0.75 再切 interleaved）/ ~15% 收尾混合檢測。時窗 spacing：`D>=4 隔天/+2 天`、`D=2~3 傍晚+隔早`、`D=1 +60~90 分+當晚`（考前夜純鞏固 block 放在 **D=1 晚上**）、`D=0 早晨 quick-scan`。plan 於 `examDate + 1 day` 自動歸檔。
- 實證：retrieval practice（Roediger & Karpicke 2006）、pretesting g=0.54（Pan 2023, PMID 37640836）、時窗內 spacing（Cepeda 2008，1 週 horizon 最佳間隔約 1 天）、interleaving 需先有 mastery（先 blocked 再 interleaved）、elaborated feedback g=0.49（Van der Kleij 2015）。
- **D=1 blitz vs 早晨速掃 重疊規則**：D=1 首次進 → 跑 10 題 blitz；已有 active 計畫的考試日早晨 → 只跑 quick-scan，不重診斷（除非手動重設）。

### D10. Telemetry 薄（可證偽性基礎，但鎖 scope）
device-local **flat append-only JSON + 一鍵 export，不做任何 in-app 圖表/dashboard**。event taxonomy 最小集：`diagnostic-answered` / `confidence-tap`(pre-reveal) / `priority-selected` / `stop-loss-demoted` / `manual-override` / `quick-scan-opened|completed`；另記各 band 次日正確率變化（驗 Movability 假設）+ 每題秒數。**早晨速掃 preset 標為「超支時第一個砍」的洩壓閥、排 tasks.md 最後**。

## Risks / Trade-offs

- **信心 tap 覆蓋率不足** → Mitigation：D3 pre-reveal 雙鍵 tap＝submit，覆蓋率＝作答率（100%）。
- **device-local 換裝置掉「計畫殼」** → Mitigation：答題結果已同步；換裝置重跑縮短版 diagnostic 決定性重建佇列（~10 秒 setup）；UI 明示「救急計畫與信心紀錄存於本裝置」。
- **cold-start 科目 10 題 blitz 精度低** → Mitigation：blitz 結果只當「啟動權重」不當高精度診斷；低 evidence 項不過度排序（與 Confidence 因子相搭）。
- **止損誤殺可救的低頻送分題** → Mitigation：分診只殺 Band D×低頻（Band A 低頻題仍在、只是排後面時間有剩浮上）；玩家可 D4 覆寫；telemetry 記覆寫後正確率判誤殺 vs 自虐。
- **magic number（τ / 止損閾值 / 未答 prior / EstTime）未校準** → Mitigation：D10 telemetry 使其可證偽；起手值 dogfood 後調。
- **MVP scope 偏胖（全進）** → Mitigation：兩道 fence（telemetry flat-JSON only、早晨速掃為可砍洩壓閥）。
- **特訓吸收造成使用者困惑** → Mitigation：救急 chip 明示 active；考後自動 revert；其他科特訓不變。

## Migration Plan

- 純加法、零 schema：不需 Dexie 遷移、不需 R2 SV bump、不需後端變更。部署走既有 CF Pages pipeline（`pnpm deploy:cf`）。
- Rollback：feature 完全 device-local，移除 header 入口鈕即停用，無資料清理需求（localStorage 殘留無害、不進 sync）。
- 驗證：Vitest（演算法純函式 + typeCoefficient 契約測試 + Movability band 覆蓋 + 分診/止損）+ Chrome MCP end-to-end（進入救急 → 診斷突襲雙鍵送出 → 逐日佇列 → 止損 → 覆寫 → 考後歸檔 revert）。SPA 三件套（in-app nav / direct URL / F5）若加 route 時跑。

## Open Questions

- τ recency-decay 常數起手值（傾向 7–14 天，對齊 SRS interval 尺度）——dogfood 校準。
- 止損閾值 6 題 / <40% / 24h——dogfood 初值。
- 未答題 concept-mastery → prior 的映射曲線。
- U / E band 邊界細節。
- 救急入口是否另加薄 route `/rescue/:subjectId`（deep-link / F5 用），或純 overlay——傾向 overlay（如 study-room scene）先不加 route。
