## Context

二階 (`study-rpg-2nd`) 已上線「整回挑戰」雙模式並把核心邏輯寫成 UI-agnostic 純函式，註解明寫「Phase 2 lifts this module as-is into `@study-rpg/core`」。但 `packages/core` 原始碼只在本 monorepo（二階 standalone 從 npm 吃 `@study-rpg/core`），所以 lift 只能在 neurons worktree 做。

neurons 現況：
- `QuestionBankPage.tsx`（734L）的 模考 picker：`listExamPapersWithCoverage`（年×次×冊 coverage）→ 選卷 → `buildExamSetExpeditionPool`（該冊**未答** remainder，依題號排序）→ `<QuizModal preserveOrder practice>`。逐冊純練習、resumable coverage grind。
- paper 定址走 **`q.meta.{year, session, book}`**（`book ∈ {醫學一, 醫學二}`，一冊 ~100 題），**不是**二階的 `<year>-<sitting>-<book>-<subject>-Q<n>` ID 解析。
- `recordQuestionResult(questionId, family, isCorrect)`：錯題本寫入；`everWrong` monotonic-OR。
- Dexie 在 `db.ts:761` v18（最新 = `connectorNeurons` backfill）。
- 既有 `mock-exam` capability spec = 舊一階 engine 的 TBD placeholder（碼錶 / `mockAttempts` / XP-loot burst / SRS enqueue），neurons 不適用。

core 現況：`packages/core@0.6.1`；`src/lib/mock-exam.ts` **已存在**（legacy 一階 `scoreMock` / `applyMockPassReward` / `paperIdOf`，從 `src/index.ts` 匯出，neurons 不消費）。

二階參考實作（`apps/medexam2-hospital-tw/src/lib/`）：`mock-exam.ts`(209L) `exam-set.ts`(105L) `mock-exam-draft.ts`(74L) + `components/ExamSetModal.tsx`(597L) `QuestionJumpGrid.tsx`(146L)；spec 藍本 `openspec/specs/exam-set-practice/spec.md`(9 req)。

## Goals / Non-Goals

**Goals:**
- 把二階 corpus-agnostic 純函式 lift 進 `@study-rpg/core`（單一真實來源），neurons workspace 立即用、二階之後 npm swap。
- neurons 模考 picker 加雙模式；模擬考試 = 閉卷整卷、交卷一次批改 + review。
- 統一計分公式（normalize），無 per-app 常數。
- 交卷批次寫錯題本 → 出征 wrong-pool 更完整。
- 草稿 resume（local-only）+ stale 偵測。
- 退役過時 `mock-exam` spec。

**Non-Goals:**
- 模擬考神經元變體 gacha 收藏線（→ change ②）。
- 任何 R2 / leaderboard / Worker / 雲端 sync 改動（草稿純 local）。
- maze 能量 / 迷宮變體 / connectome / DMN 觸發（模擬考是純練習）。
- 動 legacy core `lib/mock-exam.ts`（仍在 published 契約內，留待未來 cleanup）。
- 執行 `npm publish`（owner-driven）。
- 對齊二階改 capability 名（保留 `neurons-exam-set-expedition`，不 rename，降 churn）。

## Decisions

### D1 — Core 模組命名：新檔 `exam-set.ts` + `exam-set-mock.ts`，不碰 legacy `mock-exam.ts`

core 已有 `lib/mock-exam.ts`（legacy 一階）。二階待 lift 的 `mock-exam.ts` 是**不同概念**（整回挑戰 reducer），直接同名會撞。

決定：lift 成兩個**新**核心檔 ——
- `packages/core/src/lib/exam-set.ts` ← 二階 `exam-set.ts` 的**計分部分**（`examSetScore` / `ExamSetScore` / `POINTS_PER_QUESTION`）。
- `packages/core/src/lib/exam-set-mock.ts` ← 二階 `mock-exam.ts` 全部（reducer / state / scoring / navigator）+ draft pure helpers（`paperKeyHash` / `isDraftFresh` / `MockExamDraftRow` type，來自二階 `mock-exam-draft.ts`）。

二階 `mock-exam.ts` 內 `import { examSetScore } from './exam-set'` 的相對 import 在 core 內維持成立（兩檔同 `lib/`）。Legacy `lib/mock-exam.ts` 一行不動。

**Alternative rejected**：把二階邏輯塞進既有 `lib/mock-exam.ts` —— 概念混淆、且改動既有匯出語意有 breaking 風險。

### D2 — 計分 normalize：`examScore = total > 0 ? (correct/total)×100 : 0`

二階寫死 `examScore = correct × 1.25`。neurons 100 題 → 125 破表。

決定採 `(correct/total)×100`：
- 二階標準 80 題滿卷：`correct/80×100 = correct×1.25`，**數值完全等價**（含部分分）。
- neurons ~100 題卷：滿分剛好 100。
- 無 per-app 常數。

**已知後果（須在 review/UI 留意）**：normalize 後 `examScore` 在數值上**等於** `accuracyPct`（兩者都 = `(correct/poolLength)×100`，因為 `scoreMockExam` 以 `pool.length` 為 total）。決定**保留兩個欄位**（`ExamSetScore { accuracyPct, examScore }`）以維持二階解構相容；UI 標籤分別呈現「正確率 %」與「國考換算分（滿分 100）」，顯示同數值可接受且直覺。

**二階 swap 時的行為差異（非本 change 行為，但須在 bus 訊息點明）**：對被選項圖縮水的卷（answerable < 80），二階 OLD `correct×1.25` 上限 < 100；core normalize 上限回到 100（按 answerable 比例）。這是對玩家有利、刻意的語意改變，二階 swap 時自行確認可接受。

### D3 — 模擬考 pool = 整卷（含已答），即時詳解 = 未答 remainder

即時詳解沿用 `buildExamSetExpeditionPool`（未答 remainder，resumable coverage grind）。**模擬考是「坐一整份卷」**，須含已答過的題、依題號完整呈現。

決定：在 `expedition.ts` 新增 `buildExamSetPaper(pool, history?, year, session, book)` —— 回傳該冊**全部**題目（不濾 `answered`），複用既有 `examOrderCompare`（paper → qNumber → id）。即時詳解的 remainder builder 不動。

### D4 — Draft 持久化：core 出純 helpers + 型別，neurons 自寫 Dexie ops

二階 `mock-exam-draft.ts` = pure helpers（`paperKeyHash` / `isDraftFresh`）+ Dexie ops（`getHospitalDB`）。Dexie ops 綁 app db，不可 lift。

決定：
- core `exam-set-mock.ts` 匯出 `paperKeyHash` / `isDraftFresh` + `MockExamDraftRow` 型別（結構欄位：`paperKeyHash, year, sitting, book, questionIds[], answers[], flaggedIndexes[], index, startedAt, updatedAt`）。`isDraftFresh(draft, pool)` 只讀 `draft.questionIds` / `draft.answers`，corpus-agnostic。
- neurons 新增 `apps/neurons-tw/src/lib/services/mock-exam-draft.ts`：`saveMockDraft / loadMockDraft / deleteMockDraft` 打 neurons `db.mockExamDrafts`，型別 = core 的 `MockExamDraftRow`。

**Paper key 欄位差異**：core `ExamPaperKey`/`MockExamDraftRow` 用 `sitting`（二階詞彙）；neurons 用 `session`。neurons 呼叫端做 `{ year, sitting: session, book }` 映射即可（`paperKeyHash` 只是 `${year}-${sitting}-${book}` 字串）。不為此改 core 欄位名（保二階相容）。

### D5 — 交卷批次寫錯題本

交卷時 `wrongOrUnansweredIndexes(pool, answers)`（送分題已排除）→ 逐題 `recordQuestionResult(q.id, q.family, false)`。每題 `family` 取自 neurons `Question.family`。批次後 `everWrong` 全置（monotonic-OR）→ 進 ⚔️ 出征 wrong-pool。不發 DMN（無 `onExpeditionComplete`/`creditExpeditionDraws`）—— 模擬考非出征軸。

### D6 — Dexie v18 → v19（additive，無 callback）

```ts
this.version(19).stores({
  ...allV18Stores,                       // 逐字保留 v18 全部 store index 字串（含 connectorNeurons）
  mockExamDrafts: '&paperKeyHash, updatedAt',
})
// 無 .upgrade()：純加 table、不動既有 PK（dexie_pk_change_pitfall）
```

必帶 `apps/neurons-tw/src/__tests__/db-v18-to-v19-migration.test.ts`，仿 `db-v17-to-v18-migration.test.ts`：開 v18 fixture（含資料）→ 升 v19 → 斷言既有資料完整 + `mockExamDrafts` 可讀寫。CI `dexie-fixture-lint` 掃到 `.version(19)` 會要求 sibling 測試含字面 `.version(18).stores(`。

### D7 — 退役 `mock-exam` spec

delta `specs/mock-exam/spec.md` 用 `## REMOVED Requirements` 列出其 8 條 requirement（各附一句 reason：舊一階 engine placeholder、neurons 無 XP/loot、一階 app 已移除）。archive sync 後該 main spec 清空；tasks 末步**手動 `rm -rf openspec/specs/mock-exam/`** 並 `openspec validate --all` 確認無 dangling。core legacy `lib/mock-exam.ts` 程式碼**不在本 change 移除**（仍 published）。

### D8 — Mode 選擇器 UX

選卷後、開跑前出現 mode 控制（即時詳解 / 模擬考試），仿二階 `ExamSetModal`。即時詳解選擇直接走現有 `QuizModal preserveOrder practice`（零行為改動）；模擬考試開 `MockExamRunner`。Mode 鎖定於該 run，切 mode 須重開。

### D9 — 版本 + dist-tag

additive 匯出 → patch bump `0.6.1 → 0.6.2`，`latest` dist-tag（mirror shoutout / continuation 匯出 precedent：「both consumers adopt directly, no pre-release」）。`CHANGELOG.md` 加 `0.6.2` 條目列新匯出。`npm publish` 由 owner 手動。

## Risks / Trade-offs

- **examScore ≡ accuracyPct 冗餘** → 保留雙欄位維持二階相容；UI 雙標籤呈現同值（可接受，直覺）。design D2 已載明，review 時不視為 bug。
- **二階 swap 後 shrunk-paper 分數上升** → 非本 change 觸發（二階自行 swap 時才發生）；bus 訊息明點，二階確認後採用。
- **`Question.family` 在批次寫錯題本須存在** → neurons content model 既有 `family`（QuizModal 已用 `recordQuestionResult(q.family, ...)`）；apply 時 grep 確認，缺則 fallback 取 `q.subject`→family 映射（與既有路徑一致）。
- **整卷 pool 含已答題** → 模擬考重坐已答題會再寫 `questionHistory`（LWW 覆蓋 lastResult）。這是預期：模擬考是真實重考，答對會把該題 lastResult 轉 correct（移出「目前未答對」），答錯維持 everWrong。不影響 coverage 語意。
- **Dexie v19 fixture 漏帶** → CI `dexie-fixture-lint` 直接擋 push，apply 階段就會發現。
- **core 雙模組 import 解析** → `exam-set-mock.ts` import `./exam-set` 同 `lib/` 相對路徑，tsup bundle 單檔輸出，無 subpath 風險（per `core-npm-package` 單一 root export）。

## Migration Plan

1. core lift（D1）+ normalize（D2）+ 匯出 + CHANGELOG + version 0.6.2 + core `__tests__`；`pnpm --filter @study-rpg/core build` + typecheck 綠。
2. neurons：`buildExamSetPaper`（D3）+ `mock-exam-draft` service（D4）+ Dexie v19 + fixture（D6）+ `MockExamRunner`/`QuestionJumpGrid` + mode 選擇器（D8）+ 交卷批次寫錯題本（D5）。
3. spec：MODIFY/ADD `neurons-exam-set-expedition`；REMOVED `mock-exam`（D7）。
4. `pnpm -r typecheck` + neurons vitest + `pnpm lint:dexie-fixtures` 綠 → `/verify`（Chrome MCP 三件套：mode 選擇 / 模擬考跑一卷 / 交卷 review / 重整 resume / console clean）。
5. archive → 手動 `rm -rf openspec/specs/mock-exam/` → validate。
6. owner `npm publish @study-rpg/core@0.6.2`（latest）→ session-bus 回二階可 swap。

**Rollback**：草稿 local-only、Dexie v19 additive 無 callback → 無資料風險。回退 = revert change（core 留在 0.6.1、neurons 移除 runner/mode/v19）；已升到 v19 的 client 多一張空 `mockExamDrafts` table 無害。

## Open Questions

- （已於 grill/handoff 收斂；design 內無未決項。change ② 的變體 gacha schema/sync/數值/sprite 留待 `add-neurons-exam-set-mock-variants`。）
