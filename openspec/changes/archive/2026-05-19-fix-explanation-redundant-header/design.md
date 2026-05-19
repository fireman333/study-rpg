## Context

`parseExplanationsFile` 在 `packages/content-medexam2-tw/scripts/build.ts` 從 side-car `.explanations.md` 抽出每題的詳解 block。目前邏輯：

```ts
const detailIdx = qBlock.indexOf('### 選項詳解')
if (detailIdx >= 0) {
  text = qBlock.slice(detailIdx).trim()  // 從 header 那行開始 slice
}
```

`qBlock.slice(detailIdx)` 把 `### 選項詳解` header line **包含**在 explanation 字串裡。QuizModal / BookmarksPage / ERConsultDialog 透過 `ExplanationMarkdown` component render，所以最終畫面上會有：

```
解析                              ← QuizModal 的 section label
選項詳解                          ← markdown 渲染的 h3 header（重複）
A. xxx
  - ...
```

User 在 production live 上 spot 到此版面冗餘（screenshot 2026-05-19）。

## Goals / Non-Goals

**Goals**:
- explanation 字串開頭不再含 `### 選項詳解` header
- 6080 題全部一致（不留 legacy ok / new not-ok 兩種狀態）
- Build pipeline 仍 idempotent — 重跑 build 結果一致

**Non-Goals**:
- 改 render code（`ExplanationMarkdown` / `QuizModal`）— content-only change
- 改 source `.md` 檔（會破壞 explanation 生成的 LLM pipeline 既有產物）
- 一階 (`medexam-tw`) — 不同 source schema，無此問題
- 變更 `Question.explanation` field 在 `content-pack-contract` 的型別 / 語意

## Decisions

### D1: Strip 時機 — build-time vs display-time

**Chosen: build-time strip in `parseExplanationsFile`**

Rationale:
- Single source of truth — 任何 consumer（一階 QuizModal / 二階 QuizModal / future fork app / SRS card preview）都拿到乾淨字串、不必各自實作 strip 邏輯
- 與 `content-pack-contract` 的「explanation is rendered markdown content」語意對齊：source 段落 header 本就不該洩漏進 content
- 改動範圍最小（1 line code），影響面可控
- Build script 跟 `.explanations.md` source format 本來就 tight coupling，把 quirk 吸收在 build script 裡符合分層原則

Alternatives considered:
- **Display-time regex strip in `ExplanationMarkdown`**: 需要散佈到所有 render 端、未來新 render 點容易漏；且把 source-format quirk 洩漏到 UI layer 違反 separation of concerns
- **改 LLM explanation generation pipeline**：投資 / scope 太大，且既有 266 個 `.explanations.md` side-car 要全部重生

### D2: Strip 範圍 — 整個 header line vs 只刪文字

**Chosen: 跳整行（含換行）**

`afterHeader = qBlock.indexOf('\n', detailIdx) + 1` — `indexOf('\n', detailIdx)` 找 header 行末，`+1` 跳到下一行起點。`+ 1` 在找不到時（`-1 + 1 = 0`）會退回 start，但實際上 explanation block 不會只有 header 沒換行，所以不會撞 edge case；額外保險可加 `if (afterHeader === 0) text = qBlock.slice(detailIdx + '### 選項詳解'.length).trim()`，但 6080 題實測過無此 case，**不加** 多餘 fallback（coding_principles 原則 2：不加沒被要求的 error handling）。

### D3: 對 placeholder 題目的影響

Pending 題目走另一條 path（`explanation = PLACEHOLDER_EXPLANATION = '詳解生成中...'`），完全不經 `parseExplanationsFile`，所以 placeholder text 不變。

## Risks / Trade-offs

- **[Risk] Side-car 改 schema 加新 `### 整體說明` 等 sibling section** → 改動只 strip `### 選項詳解` 自身那行，其他 `### *` heading 仍保留。**Mitigation**: 目前 266 個 side-car 全部單一 `### 選項詳解` section（grep 過），未來新 section 出現時是 spec 變化、需新 change 處理
- **[Risk] questions.json gzipped size** 已超過 NFR 2.5 MB ceiling（3.25 MB）→ pre-existing issue，跟此 change 無關；獨立 follow-up `lazy-load-medexam2-by-subject` 處理
- **[Trade-off] User-visible content 改變**：bookmark 已存的 explanation 沒任何遷移問題，因為 QuizModal / BookmarksPage 都即時從 `questions.json` 讀，IndexedDB 沒緩存 explanation 字串本身（只存 questionId）
