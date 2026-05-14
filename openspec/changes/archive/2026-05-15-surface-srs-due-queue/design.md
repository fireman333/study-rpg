## Context

SRS engine fully wired (見 `archive/2026-05-14-wire-srs-queue/`)：
- `db.srs` table 用 questionId 為 key 存 `SrsCard`
- 答題後 `reviewCard(quality=4|2)` upsert
- App.tsx mount 時 query `db.srs.where('dueAt').belowOrEqual(now)` 撈 due cards
- `dueQuestionIds: QuestionId[]` 已存進 component state 並 pass 給 QuizModal as prop
- QuizModal `useMemo` selection logic：`shuffledDue + filler` 已 due-biased

**唯一 missing**: App.tsx 沒任何 UI 顯示「N 題到期」。`dueQuestionIds` 只被 QuizModal 默默用。

## Goals / Non-Goals

**Goals:**
- 玩家在主畫面就能看到「N 題到期複習」的數字
- 點下進入 review-only quiz（純 due cards，不混 fresh）
- N=0 給明確 hint，避免「按了沒事」的困惑
- 區分 review vs reading mode，玩家知道現在在做哪種
- 維持既有 quiz flow 不變（向後相容）

**Non-Goals:**
- 不做推播 / 通知 / badge dot 提醒系統
- 不做 per-subject 拆分（目前只有藥理一科）
- 不重新設計 reward curve（review XP fine-tune 留之後）
- 不畫 retention chart / forgetting curve（之後 stretch goal）
- 不寫 multi-day streak（B 在做）

## Decisions

### 兩個按鈕 vs 單按鈕切換 mode

| 方案 | Pros | Cons |
|---|---|---|
| **A**：主畫面兩個獨立按鈕（「開始答題」+「複習到期 N 題」） | 玩家一眼看到 due 數字；兩種 mode 完全獨立 | 主畫面多一個按鈕，UI 略擠 |
| B：「開始答題」加 toggle / dropdown | UI 緊湊 | due 數字藏在 dropdown 後面，違背 surface 初衷 |

**選 A**：本 change 的核心目的是 surface，藏起來等於沒做。主畫面已有 5 個按鈕，多一個不會崩。

### QuizModal mode prop 設計

新增 `mode?: 'reading' | 'review'`（預設 `'reading'`）：

```ts
interface Props {
  pool: Question[]
  subjectFilter?: SubjectId
  count?: number
  dueQuestionIds?: QuestionId[]
  mode?: 'reading' | 'review'  // NEW, default 'reading'
  onClose: (results: QuizResult[], questionResults: QuestionResult[]) => void
}
```

Selection logic 分支：
- `mode === 'reading'`：既有行為（due-biased + fresh filler）
- `mode === 'review'`：只取 `dueInPool`，shuffle 後最多取 `min(due.length, REVIEW_BATCH_SIZE)` 題；**不** filler

**Alternative**：兩個 modal component。**Rejected**：90% 邏輯共用（render、reveal、summary、reward batching），分兩個 component 重複太多。一個 prop 切 selection 是最小 diff。

### REVIEW_BATCH_SIZE = 20

| 候選 | 理由 |
|---|---|
| 5 | 跟 reading-mode 一致；缺點：N=50 時要進 review 10 次才清完 |
| **20** | 一次 review session 玩家專注度合理上限（~10 分鐘）；累積到 50 題還算 manageable（3 次 review） |
| 100 | 一次清完；但 50 題以上 review 容易倦怠、reward 也太多 |

選 **20**。N>20 時 hint 顯示「先複習 20 題，剩下 X 題下次」讓玩家知道 backlog 存在但不慌。

放在 `packages/core/src/lib/quiz.ts` 或新增 `srs.ts` 常數區。**選 host app constant**（先寫在 App.tsx 或 components）— 屬於 UI policy 不是 engine concern；之後想開放給 fork app 自定再 promote 到 core。

### Review-mode banner UX

```
┌────────────────────────────────────────┐
│ 🔄 複習模式 · 共 N 題到期               │  ← 跟 image-placeholder banner 視覺區隔
│   (這次都是熟題、SRS 排程)              │
├────────────────────────────────────────┤
│ Q1. 題幹...                            │
└────────────────────────────────────────┘
```

- 紫色 / 藍色系，跟 image-placeholder 的橘黃區隔
- 只在 mode='review' 時 render，每題都顯示（提醒「這還在 review session」）

### N=0 邊界

按鈕 disabled + hint：「目前沒有到期複習，繼續累積中」

避免可點但 modal 開了沒題目的尷尬。

## Risks / Trade-offs

- **Risk**: 玩家累積 100+ due cards 後永遠清不完 → discouraged。**Mitigation**: REVIEW_BATCH_SIZE=20 一次處理一塊；hint 顯示 backlog 不藏。未來看 dogfood 數據再決定要不要做 "review priority" UI（先抽 lapse 多的）
- **Risk**: review-mode 跟 reading-mode 玩家分不清 → 已答的題重複出現以為 bug。**Mitigation**: banner 文案明確；不同顏色；header 也標 `複習模式 — N/M`
- **Trade-off**: review 跟 reading 共用 reward 不分 → review XP 可能偏高（既有題 vs 新題 effort 不同）。**Accept**: 先做 surface 才有 data，等 dogfood 一週看數據再細調。本 change scope 只做 surface，reward fine-tune 另開
- **Risk**: N=0 時玩家失望「沒事可做」。**Mitigation**: hint 文字主動鼓勵「繼續累積中」、後續可加 daily streak（B change）強化動機
