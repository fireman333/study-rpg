## Why

二階 hospital mode 目前是純 idle tycoon — 6066 題二階國考題庫已 ingested、`affinity[subjectId]` counter 跟 banner threshold gate 都已 spec'd（`recruitment-gacha`），但**沒有任何 UI 入口讓使用者答題**。Affinity 永遠不會累積、banner 永遠 locked、gacha 永遠抽不到。本 change 補上 study RPG 的「心臟」：可以實際答題、累 affinity、刷 mastery 的 quiz UI。

新 save 還有一個 chicken-and-egg deadlock — 抽卡需 affinity ≥ threshold（最低泌尿科 9）、但 affinity 沒地方累。本 change 一併補上 onboarding starter pack 解開死結。

## What Changes

- 新增 quiz modal — 從 HomePage 既有 14 個 per-subject banner 的「📚 學習」button 進入；連續單題、隨時離開、必選 roster doctor 為敘事 partner（不影響 affinity 計算）；correct → `affinity[subjectId] +=1` + mastery 紀錄；wrong → 顯示 corpus 內 `explanation` 欄位、無懲罰
- 新增 per-subject mastery 計數（correct / total）+ per-question history table（含 `nextDueAt` / `interval` / `easeFactor` 預設值欄位、供下個 change `wire-hospital-srs-queue` 的 scheduler 用）
- 新增 onboarding starter pack：`ensureSeed` 預設 insert 2 個 P5 starter doctors（內科 + 外科）+ HomePage 加一張「⭐ 首抽」card（single-use、保底 P4+、bypass threshold + ticket consumption、用完消失）
- HomePage `RecruitmentBanner` 加雙按鈕（「📚 學習」+「🎫 招募」）、original roll behavior 不變
- `gameCounters` schema 加 `hasUsedStarterPull: boolean` 欄位（Dexie v4 migration）
- 答對題目時除了既有的 `createPerQReputationListener` 加 reputation 外、額外觸發 affinity + mastery 兩條 side-effect

不在本 change 範圍：SRS scheduler / due UI（拆給 `wire-hospital-srs-queue`）、specialty match quiz-time bonus（dogfood 後再看）、reputation 公式變動。

## Capabilities

### New Capabilities

- `hospital-quiz`: Quiz modal UI、entry from banner、doctor binding、subject filter、連續單題 flow、explanation reveal、affinity + mastery hook
- `hospital-mastery`: Per-subject mastery counters、per-question history schema（含 SRS fields 預留）、roster + banner mastery% 顯示
- `hospital-onboarding`: New-save seeded starter doctors、starter pull mechanic（single-use guaranteed P4+、bypass gates）、HomePage starter card UI

### Modified Capabilities

無。本 change 完全用 ADDED capabilities — 不動既有 `recruitment-gacha` / `hospital-management-mode` / `hospital-tycoon-engine` / `theme-pack-contract` / 等任何 spec 的 requirement。Banner UI 雖然 React component 被同時擴展，但 spec 級別「Banner 加學習 button」歸 `hospital-quiz` 的新 requirement、不 MODIFY recruitment-gacha 的 banner UI requirement。

## Impact

- **Affected files**:
  - `apps/medexam2-hospital-tw/src/db/schema.ts` — Dexie v4 migration（mastery / questionHistory tables、`gameCounters.hasUsedStarterPull`）
  - `apps/medexam2-hospital-tw/src/components/RecruitmentBanner.tsx` — 加「📚 學習」button
  - `apps/medexam2-hospital-tw/src/components/` 新增 `QuizModal.tsx`、`StarterPullCard.tsx`、`StarterPullModal.tsx`、`DoctorPicker.tsx`、`SubjectDropdown.tsx`、`MasteryBadge.tsx`
  - `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` — 接 starter card + banner double-button click handler
  - `apps/medexam2-hospital-tw/src/lib/quiz.ts`（new）— question picker、explanation rendering helper
  - `apps/medexam2-hospital-tw/src/lib/mastery.ts`（new）— increment helpers、mastery% formatter
  - `packages/content-medexam2-tw/src/recruitment.ts` — export starter pull rarity weights constant
  - `packages/content-medexam2-tw/src/index.ts` — re-export

- **No external API changes**: `@study-rpg/core` engine 不動、theme pack contract 不動、現有 `recruitment-gacha` spec 不動

- **Bundle size**: 預估 +30-40 KB（modal components + 已有 corpus、無新 asset）

- **Build / test**: typecheck + dev server smoke + Chrome MCP SPA route smoke 三件套；prod GitHub Pages deploy 後再跑 prod smoke

- **Dexie migration risk**: v3 → v4 加新 table + 新欄位、現有 save 需要 migration hook 處理「未存在的 mastery row」+「未存在的 hasUsedStarterPull flag」default values。Migration 不可破壞既有 affinity / doctors / rooms / gameCounters 資料
