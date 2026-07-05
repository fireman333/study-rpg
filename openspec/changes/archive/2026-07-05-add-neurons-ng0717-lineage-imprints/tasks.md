## 1. Service layer — imprint state + trigger (prescription.ts)

- [x] 1.1 加 meta key builder `imprintKey(subjectId, date)` = `prescription:v1:ng0717:imprint:<subjectId>:<date>` 與前綴 helper（沿用既有 `WRONG_PREFIX` 慣例）
- [x] 1.2 加派生型別 `Ng0717Imprint = { subjectId; firstUnlockedDate; lastTouchedDate; touches }` + stage 派生純函式 `imprintStage(touches): 'absent'|'sprout'|'warm'|'myelinated'`（門檻常數 dogfood-tunable，export 供測試）
- [x] 1.3 在既有 `recordPrescriptionAnswer` 的 day-complete transition 內，`plan.breadthFamilyId != null` 時 write-once 寫 `imprintKey(breadthFamilyId, date)`（與 `completed`/`reward` 同 transition、同 write-once 判斷；`breadthFamilyId == null` → 不寫）
- [x] 1.4 加讀取 API `getImprints(): Promise<Ng0717Imprint[]>`：掃 `prescription:v1:ng0717:imprint:` 前綴 → 依 subjectId 聚合 → 派生 touches/first/last，回傳只含已長出的科（不含 absent）
- [x] 1.5 確認 `getImprints` 回傳排序穩定（firstUnlockedDate 遞增 tie-break subjectId），避免 UI 抖動

## 2. Hook + card wiring (usePrescriptionStatus / OverviewPage)

- [x] 2.1 新增 `useNg0717Imprints` hook：liveQuery over `db.meta` → `getImprints`，完成事件後自動刷新
- [x] 2.2 OverviewPage enrich imprints（subject.color + displayName）並傳進 `DailyPrescriptionCard`（presentation-only，卡片不計算/不寫入 imprint 狀態）

## 3. Imprint UI — buds around NG-0717 (DailyPrescriptionCard + new component)

- [x] 3.1 新增 `Ng0717BranchBuds` 元件：在既有 NG-0717 mascot 下方 strip 呈現已長 imprint 芽；stage → 亮度/glow/scale；**只渲染已長出的科**（absent 不渲染、無空 slot/灰佔位/缺口）
- [x] 3.2 可展開「分支細節」：列已長出的科 + persona + stage 文案（新生分支／分支變暖／已髓鞘化），不列未長出的科、不新增分頁
- [x] 3.3 文案審查：全程「長出／新生分支／固化」；live smoke regex 確認無「收集完成／解鎖全部／尚缺／還差／X/11／已解鎖 N/」（denomViolation=false）
- [x] 3.4 degrade under `prefers-reduced-motion`（芽 opacity transition 由 `useRespectsReducedMotion` gate）

## 4. Art — shared newborn granule-cell bud sprite + per-subject tint

- [x] 4.1 產 1 張共用新生 dentate granule cell bud 底圖（codex gpt-image-2；蒼白青綠、透明背景、對齊 NG-0717；`assets/ng0717/bud.png` 256²）— owner approved
- [x] 4.2 per-family tint = `subject.color` CSS multiply-mask（保留描邊+反光；11 科任意 hex 皆正確）。accent 暫省（tint 已足夠辨識，per design D5）
- [x] 4.3 stage（sprout/warm/myelinated）以 scale + drop-shadow glow + opacity 表現（單一 sprite），wire 進 `Ng0717BranchBuds`

## 5. Tests (Vitest)

- [x] 5.1 imprint 觸發：`dayComplete` 且 `breadthFamilyId` 非空 → 寫該科 imprint；`breadthFamilyId == null` → 不寫；未完成日 → 不寫
- [x] 5.2 同科跨日再完成 → touches +1、不新增第二科 key；同科同日重複 → idempotent（touches 不重複加）
- [x] 5.3 `imprintStage` 門檻：touches 1→sprout / 2→warm / ≥3→myelinated；monotonic（不 downgrade）
- [x] 5.4 `getImprints` 只回已長出的科、派生 first/last/touches 正確、排序穩定
- [x] 5.5 write-once / LWW 安全：重放同一日完成事件不改變狀態；既有 NG-0717 rolling-day 成熟不受影響（回歸：40 prescription 測試全綠）
- [x] 5.6 no-denominator 保證：live smoke regex 斷言（denomViolation=false）+ 結構保證（`getImprints` 只回已長科、UI 純 map array）。專案測試慣例為 node-env 純邏輯（無 jsdom/RTL），不為單一斷言引入 component-render 依賴

## 6. Verify + ship

- [x] 6.1 `pnpm --filter @study-rpg/neurons-tw typecheck` 乾淨 + 全套 810 測試綠（105 檔，含新增 7 imprint 測試）
- [x] 6.2 Preview smoke：seed 3 科不同 stage 芽（生理×3 myelinated／藥理×2 warm／微生物×1 sprout）→ 卡內 NG-0717 下方 strip 正確 render tinted 芽 + 展開細節 stage 文案正確 + 無分母 + console 無 error
- [x] 6.3 grep diff 確認無新增 Dexie `.version()`／R2 `SCHEMA_VERSION`／`SYNCED_META_KEYS`
- [ ] 6.4 `/opsx:verify` 三維檢查 → `/opsx:archive` → merge `track-neurons` → main → push（CF Pages auto-deploy）→ prod bundle 驗證（**owner 確認後才 commit/push**）
