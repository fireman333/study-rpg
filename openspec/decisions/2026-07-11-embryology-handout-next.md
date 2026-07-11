# Decision / Handoff — 下一科 handout：胚胎學

**2026-07-11 · handoff for next session（context 滿,clear 後 /spec resume 接手）**

## Context（已完成）
- **組織學 handout SHIPPED to prod 2026-07-11**(merge `ffec2178`,`med-study-rpg.com/neurons/cram/handout`)。archive:`openspec/changes/archive/2026-07-11-add-neurons-histology-handout/`(這是**worked example**,照抄它的結構)。
- **Region-keyed config pipeline 已建 + 鎖好**,完整寫在 project memory **`neurons-subject-handouts-pipeline.md`**(config 契約 / 引擎 / 守衛 / verify:handout / 陷阱)—— `/spec resume` 會自動載入。
- **加一科 = 一份 `<科>.config.json` + 一份 `<科>.html`,引擎零改動**。後三科是便宜 config-drive run。
- Follow-up 科目:胚胎(next)/ 病理 / 藥理 / 生理。另有 handout×rescue 合作已 scope 未做(memory `neurons-handout-rescue-integration-followup.md`)。

## 下一任務:`/opsx:propose add-neurons-embryology-handout`

## 胚胎學資料（已驗,直接可用）
- **1 blueprint chapter**(`embryology-development`),**12 leaves**(最小科),**108 題**,**0 untagged / 0 out-of-canonical / 22 multi-tagged(~20% cover overlap)** → 乾淨 partition,**不需 catch-all**。全寫(12 << 解剖 87 天花板),`targetDepth` 全 `'full'`,**不需 depth-tiering**。
- 12 個 canonical leafId（breadth 序,發育邏輯分組）:

## 建議 region 切法（draft,config authoring 時 owner 拍板）— 4 區
1. **`hdt-early-dev` 早期發育與三胚層**:`gametogenesis-fertilization`、`early-cleavage-implantation`、`germ-layers-gastrulation`（3）
2. **`hdt-pharyngeal-cardio` 咽弓與心血管發育**:`pharyngeal-arches`、`cardiovascular-development`（2；最高 yield 17+15,發育上相連——咽弓→大血管/心）
3. **`hdt-neural-bodywall-msk` 神經・體壁・骨骼肌肉發育**:`neural-tube-development`、`body-wall-diaphragm-development`、`limb-axial-musculoskeletal-development`（3）
4. **`hdt-viscera-senses` 內臟與感官系統發育**:`GI-development`、`respiratory-development`、`urogenital-development`、`special-sense-integument-development`（4）

= 12 leaves 嚴格 partition。regionId 用 `hdt-` ASCII kebab（= HTML `.hdt-region` id）。

## 步驟（照 histology,但更便宜）
1. `/opsx:propose add-neurons-embryology-handout`(可複用 histology proposal/design/tasks 結構,改 subject 資料 + 4 區)。
2. **pre-flight**:`node scripts/handout-pipeline/...` coverage probe(已預驗 0 orphan)+ 授權 `packages/content-neurons-tw/胚胎學.config.json`(4 區,canonical leafId,verify union===12)。
3. `mine.mjs 胚胎學` → per-region packets。
4. **gate-A 報價**(這次更小:**~4 隻 Sonnet** + Codex + OE)→ dispatch(4 隻平行,餵 packet + `_exemplar-region.html` 模板 + 誠實規則)。
5. `assemble.mjs 胚胎學`(結構 lint)→ **quality gate**(Codex 對抗審 + OE 逐條查證,考選部-primary;胚胎學 fact 嚴謹度同組織學)。
6. build:handout + copy-content → verify(組織學/解剖不變、胚胎 4 區測驗本區)→ `verify:handout` → typecheck + test。
7. 瀏覽器 e2e(dev)→ archive → commit(feat + spec archive)→ merge track-neurons→main(**= 部署 gate,owner 確認**)→ prod 驗證。

## 開頭要 owner 拍板
1. 4 區切法 confirm（或調整）？
2. gate-A:~4 隻 Sonnet draft(同組織學檔次)OK？

## Key handles
- Worked example:`openspec/changes/archive/2026-07-11-add-neurons-histology-handout/{proposal,design,tasks,specs}`
- Pipeline:`packages/content-neurons-tw/scripts/handout-pipeline/{mine,assemble}.mjs` + `_exemplar-region.html`(gitignored,重建:從 `解剖學.html` 抽一區)
- 引擎:`build-handout.ts`(region-config 分支,零改動)+ `src/handout/build-region-quizzes.ts`(純守衛)+ `verify:handout`
- 契約 + 陷阱:memory `neurons-subject-handouts-pipeline.md`
- Capability spec:`neurons-anatomy-handout`(legacy 名,已泛化)
