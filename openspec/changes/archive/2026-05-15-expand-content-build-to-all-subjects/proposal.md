## Why

MVP build 預設只匯入「藥理學」一科 418 題（`packages/content-medexam-tw/scripts/build.ts` 第 32 行 `MEDEXAM_SUBJECTS = process.env.MEDEXAM_SUBJECTS ?? '藥理學'`）。dogfood 推進到 M2 必須先讓玩家在 quiz pool 看到全 10 科 ~3505 題，否則後續的 subject picker / per-subject XP / 多科 boss 都沒實際內容可接。本 change 是 M2 roadmap 第一個前置 step。

## What Changes

- Build script `MEDEXAM_SUBJECTS` 預設值從 `藥理學` → `all`（envvar 仍可覆寫）
- Build script 加 explicit counter：`imported / skipped / total` 三個數字必印，符合 [coding_principles.md No Silent Errors](../../../.claude/imports/coding_principles.md)
- 重 build `packages/content-medexam-tw/dist/` 與 `apps/medexam-tw/public/content/medexam-tw/questions.json`（含 subjects.json / meta.json）
- `CLAUDE.md` 的 build 快速指令說明從「defaults to 藥理學 only; set MEDEXAM_SUBJECTS=all for full 3505」更新為「defaults to all 10 subjects; set MEDEXAM_SUBJECTS=藥理學 for vertical-slice build」
- `openspec/project.md` M2 roadmap 表格的「10 科全解」項目標 ✓（其他 M2 子項仍 ⏳）

**Out of scope**（明確留給後續 changes）：

- 多科 mini-boss 範圍擴展（boss 仍只跑藥理）
- UI subject picker（玩家依科目過濾 pool）
- Per-subject XP / progression tracking
- 附圖 OCR / manual upload pipeline

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `build-tooling`: 預設 subject 範圍從單科改為全科；新增 imported/skipped/total counter 契約

## Impact

- **Files**:
  - `packages/content-medexam-tw/scripts/build.ts`（default 改 `all`、加 counter）
  - `packages/content-medexam-tw/dist/{questions,subjects,meta}.json`（重 build artifact）
  - `apps/medexam-tw/public/content/medexam-tw/{questions,subjects,meta}.json`（同步複製）
  - `CLAUDE.md`（build 指令說明更新）
  - `openspec/project.md`（M2 roadmap 「10 科全解」打 ✓）
- **Size budget**: `questions.json` gzip 後 ≤ 350 KB（M2 NFR 首屏 < 3s 仍需滿足）
- **No new deps**：純資料量擴展，不引入 framework / package
- **Quiz pool**：玩家下次 reload 後抽題池含 ~3505 題（之前 418）— 不破壞 SRS / save state schema
