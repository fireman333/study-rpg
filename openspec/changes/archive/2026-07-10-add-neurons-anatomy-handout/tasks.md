## 1. 題庫挖礦（grounding 地基）

- [x] 1.1 寫 `scratch` 用挖礦 script：載 `dist/{questions.json,concept-recurrence.json,cram.json}`，取 700 題解剖學 + 87 concepts，依 `chapterId` 分桶、依 `breadth`/`tier` 排序
- [x] 1.2 每 concept 附其 source questions（stem/answer/optionExplanations/explanation），輸出每章證據包 JSON 到 scratch（印出各章題數 / concept 數 / 高頻清單，可回溯 qid）
- [x] 1.3 驗證證據包涵蓋 4 章、事實可回溯（700/700 題可回溯、0 orphan）

## 2. 分區內容生成（教學型講義）

- [x] 2.1 神經解剖學章：導言 + 必背 + 構造/神經/血供表 + 易混表（拆成 A/B 兩隻 agent，只吃該章證據包）
- [x] 2.2 頭頸部章：同上四段
- [x] 2.3 胸腹骨盆章（拆成 胸腔/腹腔/骨盆會陰 三隻）：同上四段
- [x] 2.4 上下肢章（含背）：同上四段
- [~] 2.5 主 agent 核對事實（已核 3 個高風險衝突：ventral SCT peduncle 已修正、內括約肌矛盾已修、腓骨頸動脈保留考選部答案並修正解釋）；其餘依 Codex + owner 逐章複核
- [x] 2.6 Codex 對抗審內容（14 findings：3 high / 8 medium / 3 low）→ 高風險已處理，其餘進 owner checklist
- [x] 2.7 owner 逐章拍板（OE 逐條查證 + 修正，owner 核可往下走）

## 3. 內容交付管線（比照 cram，CI-safe）

- [x] 3.1 定稿 HTML 寫入 `packages/content-neurons-tw/src/handout/解剖學.html`（8 sections、95 tables、420+ cites、138KB）
- [x] 3.2 新增 `scripts/build-handout.ts`：讀 fragment → 產 `dist/handout.json`（含押題誠實 lint）
- [x] 3.3 content pack `package.json` 加 `build:handout` + 併入 `build`；`index.ts` 匯出 `HandoutData`/`HandoutSubject`
- [x] 3.4 `copy-content.mjs` 複製清單加 `handout.json`
- [x] 3.5 build 確認 `public/content/neurons-tw/handout.json` 產出（259KB，非 SPA fallback）

## 4. UI 接線（按鈕 + 場景 + route + loader）

- [x] 4.1 新增 loader `lib/handout.ts`（mirror `cram.ts`、BASE_URL 前綴、cache + `useHandout()`）
- [x] 4.2 新增場景 `routes/HandoutPage.tsx`（portal + mounted guard + 全螢幕捲動 + TOC 章節導覽 + 綠系 CSS + `✕` 回 `/cram` + 陽明 attribution）
- [x] 4.3 `App.tsx`：`/cram/handout` 真 route（AnimatedRoutes 外）+ 佔位 route（內）
- [x] 4.4 `CramPage.tsx`：五分鐘速看版左側加「考前講義(beta)」綠底按鈕 + 新 style 常數

## 5. 驗證

- [x] 5.1 `pnpm -r typecheck` 全綠（content pack + app）
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test` 全綠（1120/1120）+ verify:cram PASS
- [x] 5.3 Preview e2e：按鈕在速看版左側 + 綠底；點擊開場景（8 章 / 95 表 / TOC）；`✕` 回 `/cram`；375px RWD 無橫向捲
- [x] 5.4 SPA 三件套（dev）：in-app nav + 直連 `/cram/handout` + F5 皆正確 render（非 404）
- [x] 5.5 `/opsx:verify` 綠（6/6 requirements, 0 critical）

## 6. 收尾（部署為對外 gate）

- [x] 6.1 `/opsx:archive`（synced → `openspec/specs/neurons-anatomy-handout/spec.md`, moved to archive/2026-07-10-）
- [x] 6.2 commit（track-neurons）
- [ ] 6.3 merge `track-neurons`→main + push（**對外部署 gate — owner 確認後**）→ CF Pages deploy
- [ ] 6.4 prod 驗證：`handout.json` 200 application/json；prod `/cram` 按鈕；prod `/cram/handout` SPA 三件套非 404
