## Context

neurons-tw 目前的作答流程（唯一入口 [`QuizModal.handlePick`](apps/neurons-tw/src/components/QuizModal.tsx:40)）只呼叫 `recordCorrectAnswer(q.subject)` / `recordIncorrectAnswer(q.subject)`（[connectome.ts](apps/neurons-tw/src/lib/services/connectome.ts:100)），兩者只吃 `familyId`，做 AP 累積 / synapse / 變體 gacha / DMN / 成就 / mastery / streak 等 family 級副作用。**沒有任何 per-question 結果紀錄**：Dexie（[db.ts](apps/neurons-tw/src/lib/db.ts)，目前 v8）有 `questionBookmarks` / `questionFlags`，但無 `questionHistory`。

二階對應功能 = `wrong-answer-list` capability（[openspec/specs/wrong-answer-list/spec.md](openspec/specs/wrong-answer-list/spec.md)）：建立在既有的 `hospital_question_history` 之上，把「目前未答對 / 歷史曾錯」做成 derived view，`everWrong` 走 monotonic-OR 同步。neurons 沒有等價的 history 表，所以這個 change 必須**同時**蓋地基（history 表 + 記錄 + 同步）與 UI。

R2 同步架構：[bundles.ts](apps/neurons-tw/src/lib/sync/r2/bundles.ts) 的 `SCHEMA_VERSION = 4`，`validateBundleMeta` 已實作 forward-compat tolerance（`schema_version > local` 只 `console.info` 不 throw，未註冊的 adapter key 在 apply 時自然被略過）。adapter 註冊在 [tables.ts](apps/neurons-tw/src/lib/sync/tables.ts) 的 `NEURONS_ADAPTERS`；既有 `dmnEventLogAdapter` 已示範 monotonic-union merge（明文 mirror 二階 `everWrong` 紀律）。

## Goals / Non-Goals

**Goals:**
- 補上 per-question 作答結果追蹤（`questionHistory` 表），在唯一作答入口寫入。
- `/bookmarks` 三段分頁：手動收藏（現況）/ 目前未答對（`lastResult==='wrong'`）/ 歷史曾錯（`everWrong===true`，答對不離開）。
- 三段共用篩選列：family（現況）+ 標記 ✨/🤔（現況）+ **新增 year**（民國年）。
- 跨裝置同步：`everWrong` monotonic-OR、`lastResult` LWW。
- 嚴守專案 Dexie 紀律：純 additive v9 + v8→v9 upgrade fixture。

**Non-Goals:**
- 既有玩家回填（過去答錯的題不回填 — 之前根本沒記）；無說明 banner。
- grace toast（答對→曾錯永久保留，promote 失去意義）。
- 錯題列行內操作（重新作答 / 收藏按鈕）— 純顯示。
- SRS 排程消費 questionHistory（未來 `add-neurons-srs-pipeline` 的事）。
- 動 core engine / Worker / Supabase / D1（皆不需要）。

## Decisions

### D1 — 單一新 capability `neurons-wrong-answer-list`，不拆 history / view 兩個

二階把 history（`hospital-quiz`）與 view（`wrong-answer-list`）分開，是因為 history 表早已存在。neurons 兩者同時誕生且緊耦合，拆兩個 capability 只是徒增 spec 檔。`questionHistory` 子系統作為這個 capability 的 substrate requirement。**Alternative**：拆 `neurons-question-history` + `neurons-wrong-answer-list` — 拒絕（YAGNI；目前唯一消費者就是這個分頁，未來 SRS 要用時再抽）。對 `neurons-mode` 為 additive，不開 delta spec（既有答題 requirement 沒被推翻，只是多一個 side-effect；既有收藏行為不變，只是被包進分頁容器）。

### D2 — `QuestionHistoryRow` 形狀與索引

```ts
interface QuestionHistoryRow {
  questionId: string          // PK，= question.id（如 "106-1-醫學一-解剖學-Q1"）
  family: string              // = question.subject，記錄當下寫入（比照 bookmark）
  lastResult: 'correct' | 'wrong'
  everWrong: boolean          // monotonic-OR：一旦 wrong 永為 true
  lastAnsweredAt: number      // LWW 依據 + 排序
  updatedAt: number           // R2 LWW 依據
}
```
Dexie v9：`questionHistory: 'questionId, family, lastResult, lastAnsweredAt, updatedAt'`。**`everWrong` 不入索引** — IndexedDB 不能索引 boolean；「歷史曾錯」分頁以 `toArray()` + JS filter（比照現有 [BookmarksPage](apps/neurons-tw/src/routes/BookmarksPage.tsx)，單一使用者已答題數量級小、200 列上限）。**Year 也不入欄位**，render 時從 `questionId` 前綴解析（D4），避免冗餘與 schema 噪音。**Alternative**：把 everWrong 存成 0/1 以便索引 — 拒絕（type 與 row 介面衝突、JS filter 已足夠）；把 year 存進 row — 拒絕（id 已是 single source of truth）。

### D3 — everWrong monotonic-OR，lastResult LWW（同步 + 本機記錄都遵守）

**本機記錄**（`recordQuestionResult(questionId, family, isCorrect)`）：
```
prev = get(questionId)
put({
  questionId, family,
  lastResult: isCorrect ? 'correct' : 'wrong',
  everWrong: (prev?.everWrong ?? false) || !isCorrect,   // 永不被 correct 清掉
  lastAnsweredAt: now, updatedAt: now,
})
```
**同步 apply**（`questionHistoryAdapter`，mirror `dmnEventLogAdapter`）：對每個 incoming row，
```
final.everWrong = (local?.everWrong ?? false) || incoming.everWrong       // monotonic-OR
其餘欄位（lastResult / lastAnsweredAt / family）= LWW by max(lastAnsweredAt)  // 最近作答勝
final.updatedAt = max(local.updatedAt, incoming.updatedAt)
```
這是本 change 的核心正確性不變量：**禁止把 everWrong 改成純 LWW**（純 LWW 下，舊裝置一筆 `lastResult='correct', everWrong=false` 的 stale row 會把新裝置的 `everWrong=true` 蓋回 false）。由 `question-history-merge.test.ts` lock。**Alternative**：純 LWW — 拒絕，正是二階踩過的 race。

### D4 — Year 自 question id 前綴解析

`parseExamYear(id: string): string` → `id.split('-')[0]`，驗 `/^\d+$/`，否則回 `'unknown'`。Year chip 集合 = 當前 questionHistory rows 解析出的 distinct year（降冪，民國年）。`'unknown'` 桶只在真的解析失敗時出現（理論上不會，全 3600 題 id 皆 `<民國年>-<場次>-醫學<n>-<科>-Q<n>`）。篩選與 family/flag chip 同列、跨三分頁共用。

### D5 — 記錄接點：QuizModal 作答後，獨立 try/catch

在 [`handlePick`](apps/neurons-tw/src/components/QuizModal.tsx:40) 既有 `recordCorrectAnswer` / `recordIncorrectAnswer` await 之後，呼叫 `await recordQuestionResult(q.id, q.subject, isCorrect)`，包自己的 try/catch（channel `[question-history]`），失敗只 log 不中斷作答流程（mirror connectome 既有 `triggerAchievementCheck` post-commit 紀律）。**唯一入口**：neurons 目前只有 QuizModal 一條作答路徑（無二階的 er-consultation / mock-exam 分流）。若未來新增作答模式，必須同樣呼叫 `recordQuestionResult` — 寫進 spec scenario + 由 code review 把關（TS 不強制）。

### D6 — `/bookmarks` 三段分頁，篩選列上移共用

[BookmarksPage](apps/neurons-tw/src/routes/BookmarksPage.tsx) 重構為：頂部 header → **共用篩選列**（family + year + flag chips）→ **分頁 tab 列**（手動收藏 / 目前未答對 / 歷史曾錯）→ 對應清單。tab 狀態 local `useState`，預設「手動收藏」。手動收藏清單保留現有列操作（🎯 重新作答 / ★ 取消）；兩個錯題清單為 display-only 列（family badge + year + stem 截斷 + `lastAnsweredAt` 相對時間）。沿用現有 200 列 render 上限與空狀態樣式。

## Risks / Trade-offs

- **everWrong 被誤改回 LWW** → `question-history-merge.test.ts` 明文 lock + adapter inline 註解標「DO NOT replace with LWW」（mirror dmnEventLog 既有註解）。
- **Dexie v9 無 upgrade fixture → CI 擋** → 依 [docs/DEXIE_UPGRADE_FIXTURE_RULE.md](docs/DEXIE_UPGRADE_FIXTURE_RULE.md) 補 `db-v9-migration.test.ts`（含字面 `.version(8).stores(`，seed v8 → reopen v9 → 斷言無 DatabaseClosedError + 既有資料完整）。純 additive、無 PK change，遵守 [dexie_pk_change_pitfall.md](dexie_pk_change_pitfall)。
- **跨版本 bundle** → v9 client 讀 v4 bundle：無 `questionHistory` key → adapter 收 `[]` → no-op，本機保留。v8 client 讀 v5 bundle：未註冊 `questionHistory` adapter → 該 key 自然被略過（既有 reader tolerance）。雙向安全。
- **Rollback** → Dexie 不支援降版：一旦 v9 上線，returning user 的瀏覽器 DB 為 v9；若 code 回退到只宣告 v8 會觸發 `VersionError`。故**只能 roll forward**（與專案既有所有 schema bump 同風險，非本 change 新增）。
- **flag 篩選套在錯題清單** → 多數錯題未設 ✨/🤔 flag，啟用 flag 篩選時錯題清單可能變空 → 預期行為（共用篩選的代價），空狀態文案說明即可。

## Migration Plan

1. 純 additive Dexie v9（加 `questionHistory` 表），既有 v8 玩家升級不丟資料、questionHistory 起始為空。
2. R2 `SCHEMA_VERSION` 4 → 5；Worker 對 bundle 不透明，無需動。
3. 經正常 CF Pages（`pnpm deploy:cf`）出貨；GH Pages 不發 neurons。
4. Rollback = roll forward（見 Risks）；無資料遷移腳本、無後端 migration。

## Open Questions

- 無 blocking 未決項。實作期確認：`useLiveQuery`（dexie-react-hooks）在 neurons 既有 hook（`useAllBookmarks`）的用法是否一致沿用 — 預設沿用同 pattern。
