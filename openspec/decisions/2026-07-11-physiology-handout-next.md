# Decision / Handoff — 下一科 handout：生理學（build order #1 of remaining 8）

**2026-07-11 · handoff for next session（clear 後 `/spec resume` 接手）**

## Context（已完成，不用重做）
- **胚胎學 handout + 考前講義題庫第三 subtab SHIPPED to prod 2026-07-11**（merge `8ef518ae`，`med-study-rpg.com/neurons/cram/handout`）。worked example archive:`openspec/changes/archive/2026-07-11-add-neurons-embryology-handout/`（照抄它的 proposal/design/tasks/spec 結構）。
- **11 科擴張的 8 科架構已全部設計 + Fable/Codex 審查 + committed**（`823541ed`，`docs/handout-architectures/`）。每份是建置就緒藍圖。
- Region-keyed config pipeline 契約 / 引擎 / 守衛 / verify:handout / fact-gate 教訓 全寫在 project memory **`neurons-subject-handouts-pipeline.md`**（`/spec resume` 自動載入）。

## 下一任務：build 生理學
**唯一要讀的藍圖 = `docs/handout-architectures/生理學.md`**（12 區、完整 config JSON、depth 策略、per-region 考點、事實嚴謹 12 熱點、gate-A、Build checklist、node partition PASS 全都有）。**照它的〈Build checklist〉一步步做即可**，不用重新設計。

流程摘要（= 該檔 checklist）：
1. `/opsx:propose add-neurons-physiology-handout`（複用 embryology proposal/design/tasks 結構，改 subject + 生理 12 區）。
2. 貼上該檔〈分區〉JSON → `packages/content-neurons-tw/生理學.config.json`；node verify union===71 canonical（該檔已預跑 PASS）。
3. **gate-A 報價**（見下，開頭要 owner 拍板）。
4. `mine.mjs 生理學` → 12 packets → dispatch 12 隻 Sonnet（餵 packet + `_exemplar-region.html` + 誠實規則 + **該檔的 leaf-level 壓縮 + sub-split + 錨表指令**）。
5. `assemble.mjs 生理學` → **quality gate**（Codex 對抗審 + OE 逐條查證）。
6. build:handout + copy-content → verify（組織/胚胎/解剖不變、生理 12 區測驗本區）→ verify:handout → typecheck + test。
7. 瀏覽器 e2e（dev，內建 Browser）→ archive → commit → merge track-neurons→main（**= 部署 gate，owner 確認**）→ prod 驗證。

## 開頭要 owner 拍板（2 點）
1. **gate-A：~12 隻 Sonnet drafter（1 區 1 隻，9 full + 3 brief）+ Codex + OE。12 > 10 → 燒錢 gate A，動工前報一次規模等批准。** 同組織/胚胎檔次 OK？
2. 12 區切法 + depth（9 full / 3 brief：感覺/血液/生殖 brief）已在藍圖鎖定並經 Fable+Codex 修正——照走還是要調整？

## ⚠️ 生理學 build 專屬提醒（藍圖裡有，這裡再標一次）
- **首科用 `targetDepth:'brief'`**（3 區）：型別已 wire 但從沒 ship 過 brief HTML path → 對感覺/血液/生殖三區**額外 QA**（render + 測驗本區 + 長度）。
- **`full` 區內的 7 個壓縮尾葉**（cell 3 / renal 3 / neuro-core 小腦 1）：region-level depth 表達不了 → **必須寫進該區 drafter packet 的 authoring 指令**，否則 drafter 寫成 full 篇幅爆長度。
- **4 大區（neuro-core 8 / CV 7 / 呼吸 7 / 腎 7）authored 成兩個 sub-headed 半場**（不動 leaf partition，縫位在藍圖考點筆記）。
- **必 ship 的整合錨表**：unified 酸鹼四象限（Winter's formula + AG，錨 hdt-respiratory，cross-link 腎+血液）、體液間隔 60-40-20（hdt-renal）、O2-Hb + 凝血兩錨表（hdt-blood brief 的前提）、三型肌肉比較表逐格正確。

## 🔴 Fact-gate 鐵律（本次胚胎學最大教訓，勿忘）
Codex 對抗審找到的每一條「錯誤」，**先 packet-grep 對照考選部詳解原文**（是考選部官方答案還是 drafter 自創？）+ OE tiebreak → **保留考選部-aligned 事實、只修真錯**。胚胎學 Codex 報 21 條 HIGH，~11 條其實是考選部官方答案（與 Langman/Moore 分歧），盲套會讓講義給出考試判錯的答案。保留考選部 + 加 `<span class="hdt-intl">⚠️ 國際教科書：X</span>`小註（.hdt-intl 已在 HandoutPage 有樣式）。生理學 Guyton-primary，藍圖列了 12 個分歧熱點要 OE 逐點查。

## Key handles
- 藍圖:`docs/handout-architectures/生理學.md`（＋其餘 7 科同目錄，之後照 build order 往下）
- Worked example:`openspec/changes/archive/2026-07-11-add-neurons-embryology-handout/{proposal,design,tasks,specs}`
- Pipeline:`packages/content-neurons-tw/scripts/handout-pipeline/{mine,assemble}.mjs` + `_exemplar-region.html`（gitignored，重建:從 `解剖學.html`/`組織學.html` 抽一區）
- 引擎:`build-handout.ts`（region-config 分支，零改動）+ `src/handout/build-region-quizzes.ts`（守衛）+ `verify:handout`
- Capability spec:`neurons-anatomy-handout`（legacy 名，已泛化多科）
- Memory:`neurons-subject-handouts-pipeline.md`（契約 + fact-gate + 11 科 roadmap）

## Build order（之後照這個往下，一科一科）
生理(#1，本檔) → 藥理(#2，⚠️17 區=17 drafter，要 consolidate 或報大 fan-out) → 病理(#3) → 寄生蟲(#4) → 微生物(#5) → 生化(#6) / 公衛(#7) / 免疫(#8)。
