## Context

`/cram`（考前猜題）目前有兩種解剖學收斂工具：`cram.json` 的 `解剖學` 區塊（`CramPage`）與「五分鐘速看版」（`SpeedReviewPage`）。兩者都是 discriminator / 關鍵字對照小抄，預設讀者已唸過。缺一份第一次唸也看得懂、依分區系統整理、一週唸得完的**教學型講義**。

可複用的基礎設施：
- **全螢幕 route 場景 pattern**（`SpeedReviewPage.tsx` + `App.tsx`）：`createPortal` 到 `document.body` 逃離 `AnimatedRoutes` transform；真 route 放 `AnimatedRoutes` 外、佔位 route 放內。
- **CI-safe 靜態內容管線**（`cram.json`）：committed source → build script → `dist` → `copy-content.mjs` → `public/content/neurons-tw/`（既有 `content` assetDir）。
- **grounding 資料**：`dist/questions.json`（700 題解剖學、100% `optionExplanations`）、`dist/concept-recurrence.json`（87 解剖學 concepts，各帶 `chapterId` / `breadth` / `tier` / `testedSittings`）、`dist/cram.json` push（80 ranked concepts + `sourceQuestionIds`）、`src/concept-vocab/anatomy.ts`（官方 4 章 blueprint + leaf `chapterId` + synonyms）。

## Goals / Non-Goals

**Goals:**
- 一份解剖學教學型講義（beta），依官方 4 章分章、每章導言/必背/構造表/易混表，比小抄更詳盡好懂。
- 入口按鈕在速看版左側、底色有別；全螢幕可捲動場景。
- 事實 100% 綁題庫、押題誠實；交付前 Codex 對抗審。
- 內容契約 `subjects[]` 預留多科擴充；管線 CI-safe、零 sync/schema 影響。

**Non-Goals:**
- 不做其他 10 科（beta 只解剖學）。
- 不做圖（純文字講義；附圖是既有 `neurons-question-figures` / `explanation-figures` 的獨立議題）。
- 不做互動答題 / SRS / 收藏（純讀，與五分鐘速看版同性質但更長）。
- 不改 Dexie / R2 / sync / 排行榜 / 成就。

## Decisions

### D1：內容組織 = 官方 4 章 blueprint（章內再細分）
沿用 `anatomy.ts` 的 `chapters`（`neuroanatomy` / `head-and-neck` / `chest-abdomen-pelvis` / `upper-lower-extremities`），因為每個 leaf 已帶 `chapterId`，分桶零成本且對齊考試 blueprint。章內為可讀性再細分（胸腔/腹腔/骨盆會陰；上肢/下肢/背）。神經解剖章最大最高頻，內容比重最高。
- 替代方案：純頻率排序（跳躍、建立不起解剖空間感，owner 已否決）；器官系統分章（對不上一階分區命題，owner 已否決）。

### D2：內容以 `html` 字串儲存，`dangerouslySetInnerHTML` 渲染
`HandoutSubject.html` = 該科整篇教學 HTML（h2/h3 章節、ul 必背、table 構造/易混），沿用 `cram` 既有 block html 的渲染慣例。內容為 owner-authored、無使用者輸入，`dangerouslySetInnerHTML` 安全。場景層套用 pixel 主題 CSS（標題、表格、必背 callout、cite 標籤）。
- 替代方案：結構化 typed blocks（如 cram 的 `CramBlock` union）— 對教學型長文（大量散文 + 混排）過度工程，authoring 痛苦；beta 單科用 html 字串最簡。

### D3：交付管線比照 cram，source 為手寫 HTML fragment
`packages/content-neurons-tw/src/handout/醫學一__解剖學.html`（source of truth，人工撰寫 = 由題庫挖礦 + 分區 subagent 起草 + Codex 審後定稿的**靜態成品**）→ 極簡 `scripts/build-handout.ts` 讀 fragment(s) 包成 `dist/handout.json`（`{version, builtAt, subjects:[{subjectId, title, html}]}`）→ `copy-content.mjs` 複製到 public。build 不需 Chromium、不抓網路（內容已 bake 成靜態）。
- 替代方案：直接手寫 `handout.json`（跳過 build）— HTML 塞進 JSON 字串跳脫痛苦，且失去多科 fragment 慣例；故保留極簡 build。

### D4：內容生成 = 確定性挖礦 → 分區 grounded 起草 → 雙道把關
1. 挖礦 script（Node，非 LLM）：700 題 + 87 concepts 依 `chapterId` 分桶、依 `breadth`/`tier` 排序，每 concept 附其 source questions（stem/answer/optionExplanations/explanation）→ 產每章證據包 JSON（落 scratch，不進 repo）。
2. 每章一隻 subagent，**只吃該章證據包**，起草導言/必背/構造表/易混表（事實只准來自證據包 + 對題庫交叉驗證的標準解剖）。
3. 把關：主 agent 逐條對題庫核對 → Codex 對抗審抓事實錯誤/過度宣稱 → owner 拍板 → 定稿寫入 fragment。
- 為何不直接讓 LLM 憑記憶寫：owner 是醫學生，錯的解剖 fact 立刻被抓；`optionExplanations`（命題者自己的混淆地圖）是最佳防幻覺 grounding。

### D5：入口按鈕與 route 接線 = 複製 SpeedReviewPage
按鈕 `navigate('/cram/handout')`；`/cram/handout` 真 route 放 `App.tsx` `AnimatedRoutes` 外的獨立 `<Routes>`，佔位 route（`<span aria-hidden/>`）放 `AnimatedRoutes` 內；`HandoutPage` `createPortal` 到 body、`mounted` guard、`✕` `navigate('/cram')`。按鈕底色用解剖學色 `#6a8c3f` 系（綠），與速看版金 `linear-gradient(#f6e6b8,#efd88f)` 明顯區隔。

## Risks / Trade-offs

- **[事實錯誤傷 owner 信任]** → 100% 題庫 grounding + 主 agent 核對 + Codex 對抗審 + owner 逐章拍板；beta 標籤預留修正空間。
- **[內容過長塞不進一週]** → 依 `breadth`/`tier` 收斂到高頻精選（`常青必掃` 優先、低頻捨），非全 700 題覆蓋；每章導言點明「這章要抓什麼」。
- **[`dangerouslySetInnerHTML` XSS]** → 內容 owner-authored、build-time bake、無使用者輸入，風險為零（與既有 cram 相同慣例）。
- **[prod SPA route 404]** → 沿用速看版三件套接線 + BASE_URL 前綴；驗收含 prod F5/直連三件套（per chrome_mcp_preflight SPA 規則）。
- **[加新 public 檔未進 assetDir]** → handout.json 落既有 `content/neurons-tw/`，已在 `content` assetDir，無需改 allowlist（per neurons-cf-pages-asset-dir-allowlist）。

## Migration Plan

1. 挖礦 + 內容生成 + Codex 審 + owner 拍板 → fragment 定稿。
2. build script + copy-content + loader + 場景 + 按鈕 + route → typecheck + vitest 綠。
3. Chrome MCP e2e（dev）：按鈕位置/底色、開場景、渲染、RWD。
4. merge `track-neurons`→main（**對外部署 gate，須 owner 確認**）→ CF Pages deploy → prod SPA 三件套 + `handout.json` 200 application/json 驗證。
- **Rollback**：純新增 + 一顆按鈕，revert 該 commit 即完全還原；無資料遷移、無 sync 影響。
