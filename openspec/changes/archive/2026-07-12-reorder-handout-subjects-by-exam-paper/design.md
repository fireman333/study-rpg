## Context

考前講義科目選擇器（`HandoutPage.tsx` 的 `subjects[]` → picker）目前直接吃 `handout.json` 的 build-time 順序，源頭是 `packages/content-neurons-tw/scripts/build-handout.ts` 的手寫 `SUBJECT_META.order`（醫學一/二交錯）。App 內其他兩個科目選擇器已用 runtime `EXAM_PAPER_ORDER` 排序：`FamilyPicker.tsx:232` 與 `CollectionPage.tsx:155`，皆 `import { EXAM_PAPER_ORDER, FAMILY_EXAM_PAPER } from '@study-rpg/content-neurons-tw'`，pattern = 對每個 paper 取 `EXAM_PAPER_ORDER[paper]` 依序展開、再以 `FAMILY_EXAM_PAPER[id] === paper && !seen` 的 extras 補綴。`EXAM_PAPER_ORDER`（`families.ts:131`）內容經核對 = 醫學一 5 科 + 醫學二 6 科的正確 paper 順序。`HandoutSubject` 的 key 欄位為 `subjectId`（非 sibling 的 `id`）。

## Goals / Non-Goals

**Goals:**
- 講義科目選擇器依 `EXAM_PAPER_ORDER` 排序（醫學一先於醫學二），與 `FamilyPicker` / `CollectionPage` 同源同慣例。
- 未列於 `EXAM_PAPER_ORDER` 的 subject 不遺漏（extras fallback）。

**Non-Goals:**
- ❌ 改 build script `SUBJECT_META`（會讓 handout 成為唯一 build-side 排序的特例、製造 build/runtime drift）。
- ❌ 任何 schema / handout.json 內容 / 排序以外的 UI 改動。

## Decisions

### D1 — runtime sort in HandoutPage（非改 build script）

`HandoutPage.tsx` 的 `subjects` 改為 `useMemo` 依 `EXAM_PAPER_ORDER` flatten 排序，mirror `FamilyPicker` / `CollectionPage`。**理由**：那兩個 sibling 已 runtime 消費 `EXAM_PAPER_ORDER`，讓 handout 對齊 → `EXAM_PAPER_ORDER` 成為全 app 唯一被消費的排序真實來源；改 build script 反而讓 handout 變成 build-side 特例、且 handout.json 重排後仍要 runtime 保證不倒退，多一處 drift 風險。UX 結果與 build-side 完全相同。

- **Alternative（改 build-handout.ts `SUBJECT_META` 從 `EXAM_PAPER_ORDER` 衍生）**：handoff doc 的實作建議。同達成「對齊 EXAM_PAPER_ORDER」，但排序真實來源分裂在 build 端、與兩個 runtime sibling 不一致。捨棄。

### D2 — extras fallback 防漏

flatten `[...EXAM_PAPER_ORDER.醫學一, ...EXAM_PAPER_ORDER.醫學二]` 後，`subjects` 依 `indexOf(subjectId)` 排序；`indexOf === -1`（未列科目）綴到尾端（不 drop）——mirror sibling 的 `extras` 邏輯，防未來新增科目未進 `EXAM_PAPER_ORDER` 時 silently 消失。

## Risks / Trade-offs

- **[與 deeplink change 的 `subjects[0]` 落點耦合]** → deeplink change 的 `?subject=` 同步 initializer 使 deep-link 不依賴 `subjects[0]`；apply 順序 deeplink 先、本 change 後即解耦。
- **[排序真實來源信任 `EXAM_PAPER_ORDER`]** → 已核對其內容正確；且它已是兩個 sibling 的來源，本 change 只是第三個消費者，不新增來源。

## Migration Plan

- 純 client-side runtime 排序，無 schema / build / 資料遷移。
- 部署 = merge track-neurons → main 觸發 CF Pages（owner 紅線 gate，與 deeplink change 同批）。
- Rollback = revert 該 commit（純顯示順序、零持久狀態）。

## Open Questions

- 無。
