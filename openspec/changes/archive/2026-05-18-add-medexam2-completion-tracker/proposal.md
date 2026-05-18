## Why

二階 玩家目前無從得知「我這科還剩幾題沒答過」— RecruitmentBanner 只顯示親和度 / 招募 / 🔴 due chip，沒有題庫覆蓋率指標。同時 QuizModal 強制 SRS due-first，玩家想針對某科 grind 新題時必須先把該科 due queue 清光，對「已唸完想刷題補進度」的場景體驗不佳。這次改動是 mania mode 兩階段計畫的 Phase 1 — 先用最小變動補完成度可見性 + 一鍵跳 SRS，dogfood 一週後再決定 Phase 2 (mania mode + 經濟重設計) 的真實 scope。

## What Changes

- **RecruitmentBanner 加完成度 chip** — 每個科別 banner 在現有 `🔴 N due` chip 旁加一顆 `✅ X / Y` chip，X = 該科 `questionHistory` 中 distinct `questionId` 數，Y = 該科 playable pool 大小（已扣 `hasOptionImages` 題）。零後端，純 IndexedDB live query
- **QuizModal 加「跳過 SRS」勾選框** — 預設 off；勾起來後 next-question 永遠走 `pickRandomQuestion` 直接 fall-through，不再呼叫 `getNextDueCardForSubject`。Toggle state 只在 modal 生命週期內存活（開合一次重設），不寫 Dexie
- **Pool-exhausted toast** — `pickRandomQuestion` 偵測到 `seenIdsRef.size >= pool.length` 並回傳重複題時，emit 一次 `本科獨立題已掃完，繼續會開始重練` toast；同 session 同科只 emit 一次（用 `useRef<Set<SubjectId>>` 追蹤已觸發的科）
- **新 helper `lib/completion.ts`** — 暴露 `useCompletionMap(): Map<SubjectId, { answered: number; total: number }>`，內部 join `questionHistory` distinct-by-questionId 跟 quiz pack `bySubject` 大小；HomePage 一次拿全 map 餵 14 個 banner，避免 N+1

## Capabilities

### New Capabilities

無 — 純 UI 增強現有 capability。

### Modified Capabilities

- `hospital-quiz`: 加「Skip SRS 切換 → 強制 random 路徑」UI requirement、加「pool exhausted toast」requirement
- `hospital-srs`: 修改 "Due-first picker in quiz modal" 加 bypass case（toggle on 時 picker 不查 due queue）
- `recruitment-gacha`: 修改 "Banner UI SHALL display per-subject state and progress" 加完成度 chip 渲染（chip 顯示位置與 due chip 並列；不影響 gacha 邏輯本身）

## Impact

- **改動檔案**：
  - `apps/medexam2-hospital-tw/src/components/RecruitmentBanner.tsx`（新增 `completion` prop + chip render）
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`（新增 `skipSrs` state + toggle UI + 修改 `loadNextQuestion` 分支 + exhaustion toast）
  - `apps/medexam2-hospital-tw/src/pages/HomePage.tsx`（接 `useCompletionMap` 餵 banner）
  - `apps/medexam2-hospital-tw/src/lib/completion.ts`（新檔，~50 行）
  - `apps/medexam2-hospital-tw/src/lib/quiz.ts`（加 export `getPoolSize(subjectId)` 或讓 `loadPack` 暴露 size map）
  - `apps/medexam2-hospital-tw/src/styles.css`（新增 `.banner__completion-chip`，沿用 `.banner__due-chip` precedent）
- **Schema / 資料層**：無 Dexie migration、無新增 persisted state、無 cloud sync table 變動
- **Out of scope（明確留給 `add-mania-mode` Phase 2）**：
  - 經濟重設計（tycoon tick 暫停、revenue-per-correct 公式、reputation 公式）
  - 醫院 tier 升級 gate 變動
  - 獨立 mania UI surface（題庫格子圖、click-to-drill、coverage heatmap）
  - 任何 Dexie schema 變動
- **驗證面**：`pnpm -r typecheck` 全綠；Chrome MCP live smoke — 開 `/`、看 14 個 banner 都有 chip、進 QuizModal 勾 toggle、答一題看 chip + 1
