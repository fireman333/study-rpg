## Context

neurons-tw（Vite+React+TS SPA、Dexie、pixel 主題）題庫能做題/看詳解/看原始詳解 PDF（`openExplanation(questionId)` → Drive fetch + Cache API → docked/overlay PDF panel），但缺「考前收斂視圖」。速看重點內容已於前階段產出（11 科 evidence packets + grounded-compression，每行可回溯真實考題；standalone HTML + A4 PDF 已驗於真 390px 手機寬度）。

本 change 把它 app 化並補押題/來源連結/PDF 下載。設計經 Explore（app 架構）+ Codex（技術/版面）+ Fable（押題內容）consult 收斂。

> **依賴 `add-neurons-concept-tags`**：概念詞彙、4600 題 primary-concept 標註、concept-recurrence 資料集（23 sittings、tier、濾送分）皆由該前置 change 產出。本 change 只**消費**其資料：押題清單 = 各科高 recurrence 概念（raw counts + tier）；押題項目對應的考題 = 標該概念的題。概念詞彙方法論見 `add-neurons-concept-tags/design.md`，本檔不重複。

**約束**：復用既有元件（QuizModal / QuestionReviewCard / PDF panel / SubTabLayout）；不動題目 `id`/`answer`/內容；不 bump Dexie/R2/sync。pixel tokens：gold `--rarity-ssr:#d4a04d`、cream `--bg-cream:#f4ecd8`、Cubic 11 `--font-pixel-cjk`；exam 內文 `--font-legible`。

## Goals / Non-Goals

**Goals**
- 題庫 → subtab group（`/bank` 保留 + `/cram` 新增）。
- `/cram` 呈現每科 速看重點 + 押題清單，pixel 主題、手機優先、版面乾淨（progressive disclosure）。
- 每條內容連回真實考題 + 原始詳解（展開清單，不雜亂）。
- 一鍵下載預生成 A4 PDF（與 app 內容同源）。

**Non-Goals**
- 不建概念詞彙 / 不標題目 / 不算 recurrence（那是 `add-neurons-concept-tags`）。
- 不做概念搜尋 / 非可點 label（也在 `add-neurons-concept-tags`）。
- 不做前端即時 PDF 生成；不改 cloud sync / Dexie / R2。
- 不把押題鎖進 XP/gacha、不加 streak 壓力；不宣稱命中率 / 不顯示 normalized 分數。

## Decisions

### D1. 資料模型：cram 內容 bake 成 typed source → build 生成獨立 lazy `cram.json`
- 不併入主 `ContentPack` / `getContentPack()`（避免初始 bundle 膨脹）；`/cram` route lazy-fetch。
- 每個可引用單元（subject / table block / table row / keyword trigger / 必中考古 kernel / 押題 item）帶 `sourceQuestionIds: QuestionId[]` + 選填 `representativeQuestionIds`。
- 押題 items 由 `add-neurons-concept-tags` 的 recurrence 產生（配分加權數量、raw counts、tier）。
- *Alternative*: 併入主 content pack（放棄——bundle 膨脹、初載變慢）。

### D2. 版面：subject accordion 單開、醫一/醫二分區、押題-先-速看-巢狀、count-chip 兼下鑽
- 單一 `/cram` subtab：頂部常駐 disclaimer + ⓘ「怎麼算的」展開 +「統計至 115-1」版本戳。
- 主軸 subject；醫學一（上午卷）/ 醫學二（下午卷）兩大區；科目 accordion **單開**，收合時科名旁 tiny 計數 chip；展開後押題預設可見、速看表格**巢狀收合**；手機頂部 sticky 科目快跳。
- **來源連結 progressive disclosure**：cram line 必獨立可讀；低彩度計數 chip 兼證據+下鑽；點→年份新→舊 inline mini-list（上限 + 「還有 N 題」跳題庫 filtered view）→ 點題 **inline 展開既有 `QuestionReviewCard`**（非 PDF panel、非 modal）；card 的「看原始詳解 PDF」鈕才 on-demand 開 PDF panel。source 列永不預設展開。

### D3. PDF 單一真實來源 = cram 資料，build 重生
- `render-cram-pdf` 腳本（headless Chromium）於 build 從同一份 cram 資料重生 A4 PDF；靜態 asset + 直接下載鈕；`sourceContentHash` validator 防漂移。
- *Alternative*: 手維護 PDF（漂移）；window.print（手機卡、非直接下載）；前端 jsPDF（加相依、中文轉點陣糊）。

### D4. 題庫 subtab 重構用既有 `SUBTAB_GROUPS` + `GroupNavLink`
- App.tsx 加 `bank` group（`/bank` + `/cram`），頂 nav「題庫」改 `GroupNavLink` 使 `/cram` 仍高亮題庫；`/bank` 為預設 route。注意既有 flat routes / active-state / SPA 直接進 `/cram` F5（CF Pages `_redirects` SPA catch-all 已在，仍要驗）。

### D5. 誠實約束（寫進 spec 當 normative）
- 押題只 raw counts + tier；禁 normalized/命中率%/保證·必中·100%·今年一定考；降溫明標；必帶版本戳；手挑項目標主觀且與 data-driven 分開；押題與遊戲壓力機制解耦（不鎖 XP/gacha、不加 streak）。

### D6. 考前猜題完全開放，無登入門檻
- **cram 內容 + A4 PDF 下載一律匿名開放**，不加任何進入門檻。
- 決策歷史：2026-07-06 曾評估「PDF 下載軟登入 gate」（用可攜 PDF 當 conversion 換註冊），經主 agent + Codex fusion 二審，判定「整個 tab gate」是策略性錯誤（把 top-of-funnel 口碑內容誤當 retention reward、擋掉考前冷啟動用戶、傷誠實定位），「只 gate PDF」屬可選折衷。**owner 最終決定完全拿掉門檻**——理由：不為 growth 擋考前口碑分享與焦慮考生，維持誠實讀書工具定位。
- *Alternatives rejected*: 整 tab gate（策略錯）；PDF 軟登入 gate（owner 拿掉）；硬 Worker gate / leaderboard gate / level-unlock gate（更不適合）。

### D7. 轉化用主動 on-ramp（carrot 非 stick），evidence-first（owner + Codex fusion 2026-07-06）
門檻拿掉後，靠**設計**把「來 cram 被動讀重點」的焦慮考生轉成「實際玩 RPG app」的活躍用戶。最強轉化 = **reading→answering**。

- **押題 drill-down = evidence-first + 內嵌主動 CTA**（不是二選一，是疊加）：點概念 chip → 先開**誠實 evidence drawer**（raw count「23 次考 N 次」+ tier + 代表題 read-only `QuestionReviewCard` mini-list，維持被動查證能力）→ drawer 內嵌低摩擦主要 CTA **「▶ 答 1 題看看」** → 開**既有 `QuizModal` practice mode**（concept-filtered pool；1-題 probe → 完成才給「再答 N 題鞏固」）。**不可把查證入口偷換成純導流按鈕**（會稀釋誠實猜題）。
- **wrong→出征 bridge 幾乎免費**：`QuizModal` practice mode 既有行為 = 不影響養成進度、**但答錯記入錯題本**（→ 餵既有 出征/connectome 迴圈）。答錯 framing =「找到可修復的 synapse · 加入錯題本，出征時修復」（**post-answer only**，非答題前強推）；答對 =「connection consolidated」+ 可選「再答 2 題鞏固」。
- **速看 blocks 維持 self-contained**（無 per-row 來源，SPEC 本就每行獨立）；每科 section 底部放 **ONE** 輕量「用本章高頻概念練 N 題」CTA（Codex 提案；單一低干擾 bridge，非 per-row CTA spam）。
- **Friction 鐵律**：1-tap 開始、不先問題數/難度/登入/建角色、第一題直接出現不經 full-screen promo modal、預設 1-題 probe。**未登入也能答**；登入只在要**保存**錯題/出征/collection 時出現，語氣「保存成果」非「解鎖內容」。
- **反面清單（normative 禁止）**：答題/看來源前強制註冊；把重點藏在遊戲進度後；命中率 / 保證會考 hype；過早推 gacha / leaderboard；streak / 倒數 / 排名落後製造焦慮；每個 highlight row 硬塞 CTA；速看假裝有精準來源回溯；答錯羞辱式文案。
- **source-links 範圍收斂**（取代原「every unit links to source」）：**押題 items** 帶 `sourceQuestionIds`（concept-tags 反查）→ evidence drawer + practice on-ramp；**速看 blocks** self-contained + 1 section-level practice CTA。build validator A 只驗押題 `sourceQuestionIds` ∈ questions.json。

## Risks / Trade-offs

- **手機 PDF panel 全螢幕 overlay**（<768px）→ accordion **絕不 auto-open** PDF panel，只有明確點 PDF 鈕才開。
- **壞掉來源連結靜默**（`sourceQuestionIds` 不存在）→ build validator 硬擋。
- **cram.json bundle 膨脹** → 獨立 lazy-fetch。
- **CF Pages assetDirs 遺漏** → 新靜態資源必加 allowlist，否則 prod 靜默 404（dev/CI 綠、prod 死）；post-deploy 必 `fetch()` prod 實測。
- **PDF 與資料漂移** → content-hash validator。
- **依賴未就緒**：若 `add-neurons-concept-tags` 尚未 ship，押題資料不存在 → 本 change 的 Phase 1（押題組裝）與 Phase 5 押題驗證會缺料；速看/連結/PDF 部分仍可先做（不依賴 recurrence）。

## Migration Plan

一次性、純新增（前置 = `add-neurons-concept-tags` 已 ship）：
1. Phase 1：組裝 baked cram typed source（速看 blocks 復用既有內容；押題 items 消費 recurrence），帶 sourceQuestionIds；build 生成 `cram.json` + 重生 PDF + 兩 validator。
2. Phase 2：UI（subtab 重構 + CramPage + 復用 QuestionReviewCard/QuizModal + pixel + 手機 sticky + disclaimer/ⓘ/版本戳）。
3. Phase 3：一鍵下載 PDF（完全開放、無門檻）+ CF Pages assetDirs。
4. Phase 4：verify（typecheck/test + Chrome MCP end-to-end + prod smoke）。

**Rollback**：純新增；移除 `/cram` route + bank group + cram.json/PDF 資源即回原狀。

## Open Questions

- 押題 mini-list 的「還有 N 題」跳題庫 filtered view 依賴 `add-neurons-concept-tags` 的概念搜尋已上——前置 ship 後即可接。
