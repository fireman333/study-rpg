## Context

三件首頁 UI 調整，彼此獨立但都收斂同一目標：讓首頁聚焦核心養成 loop。現況：
- 模考是首頁 CTA toolbar 的 secondary entry（`neurons-homepage` 既有 requirement），但定位是「純測驗、不長 connectome」，不屬養成循環。
- 模考/題庫作答目前仍走 `QuizModal` 的標準路徑：`recordCorrectAnswer(q.subject)`（給 maze 能量 + 推 walker + 觸發 variant settle）+ `recordQuestionResult`（`questionHistory`：coverage + `everWrong` + SRS row）。只有 connectome conduction batch 是出征專屬，模考不 flush。
- 首頁 maze 區有常駐「🚀 顯示/隱藏遠征動畫」header chip（`MazeGrid.tsx:847-851`）+ 帶子自帶的 × 快速隱藏（`MazeExpedition.tsx:314`），兩者共用一個持久化偏好 `getExpeditionHidden`（QuizModal 背景帶也讀同一偏好）。

DMN / 能量 / 裝備機制經三方（grill + 兩輪 codex）結論凍結，不在本 scope。

## Goals / Non-Goals

**Goals**
- 模考移出首頁 CTA、收進題庫 tab（`/bank`）並放大入口。
- 模考/題庫作答 = 純練習：不給養成獎勵（能量/walker/variant），但保留 study 紀錄（`questionHistory`：coverage + `everWrong` + SRS）。
- 移除首頁常駐遠征動畫 toggle chip；隱藏由 × 承擔、復原移 HelpMenu；自動顯示時機不變。

**Non-Goals**
- 不動 DMN / 能量 / 裝備 / consumable 任何機制。
- 不改 maze 經濟數值（pacing 係數不動；純練習只 gate 能量入帳的「呼叫與否」，不改 faucet 公式）。
- 不 bump Dexie/R2 schema、不動 sync、不加 Worker endpoint。
- 走迷宮 micro-cue 為 optional，不立 hard requirement。

## Decisions

### D1 — 純練習以「mode flag 跳過 recordCorrectAnswer，保留 recordQuestionResult + SRS」實作
`QuizModal` 加一個 `practice`（或 `exam`）mode flag。answered 流程在 practice mode 下：
- **跳過** `recordCorrectAnswer` / `recordIncorrectAnswer` 的養成 side-effect（maze 能量入帳、walker 推進、variant settle、connectome batch）。
- **保留** `recordQuestionResult(q.id, q.subject, isCorrect)` → `questionHistory` 照寫（coverage 計算 + `everWrong` monotonic-OR 不變）。
- **保留** SRS `reviewCardBinary` 排程（study schedule 非養成獎勵；`neurons-quiz-modes` 既有「SRS regardless of mode」原則不被破壞）。

*為什麼不在 `recordCorrectAnswer` 內加 flag*：能量/walker/variant 是 `recordCorrectAnswer` 的整包 side-effect，呼叫端 gate（mode flag 決定呼不呼叫）比在 service 內部開分支乾淨，也不污染其他呼叫者。模考本來就不 flush connectome，所以跳過 `recordCorrectAnswer` 只額外失去「能量」這一項——正是目標。
*Alternative considered*：在 `recordCorrectAnswer` 加 `{ grantEnergy: false }` 參數 → 否決，會讓 service 簽章長出 mode-aware 分支，且 walker/variant 仍綁在內。

### D2 — 模考 picker 整塊搬到 QuestionBankPage，複用既有 coverage 邏輯
把 `OverviewPage` 的 `examModeButton` + `expeditionMenu==='exam'` picker JSX + handlers（`openExamMode` / `chooseExamPaper` / `examPapers` memo）移到 `QuestionBankPage`。`listExamPapersWithCoverage` / per-book pool builder 不動（`neurons-exam-set-expedition` 既有邏輯）。題庫頁的模考入口放大；選卷後 `QuizModal` 以 practice mode 開啟。首頁 CTA toolbar 收斂為 🎲 + ⚔️。

### D3 — 遠征動畫：移 chip、留 ×、復原進 HelpMenu，持久化偏好不變
- 移除 `MazeGrid` 常駐 header chip（line ~847-851）。
- 帶子 × 快速隱藏（`MazeExpedition.tsx:314` `onHide`）→ set `expeditionHidden=true`（寫 `getExpeditionHidden` 同一持久化 key）。
- HelpMenu 加一個「遠征動畫：顯示/隱藏」控制（讀寫同一偏好），作為 × 關掉後的復原入口。
- 自動顯示時機**不變**：出征（QuizModal compact band）+ 閱讀（MazeGrid band，`paused={reading.status!=='reading'}`）。reduced-motion freeze 不變。閱讀帶文案對齊「探索迷宮」敘事。

## Risks / Trade-offs

- [純練習跳過 `recordCorrectAnswer` 可能連帶跳過非養成的副效應（如每日 streak、firedToday）] → apply 時清點 `recordCorrectAnswer` 完整 side-effect 清單，確認只有「能量/walker/variant/connectome」被有意跳過；若 streak 等 study-tracking 副效應也綁在內，需拆出保留（study 紀錄 ≠ 養成獎勵）。verify 時實測：題庫答對不漲能量、不抽 variant；答錯仍進錯題清單。
- [× 關掉後玩家找不到復原入口] → 復原明確放 HelpMenu；× 的 title 文案提示「可於說明選單恢復」。
- [模考 picker 搬家造成 deep-link / 既有玩家肌肉記憶斷裂] → 模考使用率低、且題庫 tab 已在 nav；首頁移除後不留死按鈕。

## Migration Plan

純前端 UI 重組，無資料遷移。部署即生效；rollback = revert commit（無 schema/sync 足跡）。

## Open Questions

- 走迷宮「正在前進」micro-cue 是否要做、做成什麼形式（walker tick 微動 / 能量條脈動）——列 optional，dogfood 後再定，不阻擋本次 ship。
