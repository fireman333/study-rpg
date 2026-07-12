# Tasks — 考前講義科目排序改按 EXAM_PAPER_ORDER

> 建議 apply 順序：先 `add-neurons-handout-rescue-deeplink`（其 `?subject=` 同步 initializer 已使 deep-link 不依賴陣列序）、再本 change。此為慣例排序，**非硬功能相依**（預設科解剖學排序前後不變）。

## 1. Runtime 排序

- [x] 1.1 `HandoutPage.tsx`：import `EXAM_PAPER_ORDER` from `@study-rpg/content-neurons-tw`（**只此一個**——flat `indexOf` 不需 `FAMILY_EXAM_PAPER`，多帶會 `noUnusedLocals` typecheck error）。把 `const subjects = data?.subjects ?? []`（`:67`）改為 `useMemo` 依 `[...EXAM_PAPER_ORDER.醫學一, ...EXAM_PAPER_ORDER.醫學二]` 的 `indexOf(subjectId)` 排序；`indexOf === -1` 的 subject 綴到尾端（extras fallback，不 drop）。注意 `HandoutSubject` key 欄位是 `subjectId`（非 sibling 的 `id`）。
- [x] 1.2 確認 picker（`:274`）與 `active` fallback（`:69` `subjects[0]`）都消費排序後的陣列（預設科 = 排序後第一科 = 解剖學，與現況相同）。

## 2. Typecheck + 測試 + 驗證

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean。
- [x] 2.2 `pnpm --filter @study-rpg/neurons-tw test`：既有測試全綠 + **新增排序斷言**（給定 handout `subjects[]`，排序後序列 === 解剖 / 胚胎 / 組織 / 生理 / 生化 / 微生 / 免疫 / 寄生 / 公衛 / 藥理 / 病理；未列科目綴尾）。若 `HandoutPage` 難以獨立測，抽 pure sort helper 測。
- [ ] 2.3 `/verify`（Chrome MCP）：講義選擇器順序 = 解剖 → 胚胎 → 組織 → 生理 → 生化 → 微生 → 免疫 → 寄生 → 公衛 → 藥理 → 病理；無 `?subject=` 時預設落在解剖學；deep-link（來自 deeplink change）到非第一科仍正確（跨 change 迴歸）。（Post-apply；gated on merge=部署確認。）
