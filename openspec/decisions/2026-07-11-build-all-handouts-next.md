# Decision / Handoff — 下次任務：跑 build-all workflow（一次 build 剩下 8 科考前講義）

**2026-07-11 · handoff（clear 後 `/spec resume` 接手）· 取代 `2026-07-11-physiology-handout-next.md`（計畫從「一科一科」改為「平行一次做完」）**

## Context（已完成）
- 胚胎學 handout + 題庫第三 subtab **SHIPPED to prod**（merge `8ef518ae`）。
- 8 科架構藍圖 committed（`823541ed`，`docs/handout-architectures/<科>.md`）。
- **Build-all workflow 已設計好（Fable，commit `44b2fd9c`）**，可直接跑。

## 下次任務：跑 workflow（設計已完成，只差執行）
```
Workflow({ scriptPath: "scripts/handout-pipeline/build-remaining-handouts.workflow.js" })
```
一次把 8 科（生理/藥理/病理/寄生蟲/微生物/生化/公衛/免疫）從藍圖 build 到 **build-ready**（config + html + SUBJECT_META + verify-handout + build:handout + verify + typecheck + test 全綠）。**workflow 停在 build-ready，不 commit/merge/deploy**。

**設計說明全文**：`docs/handout-architectures/_BUILD-ALL-WORKFLOW.md`（phase 結構、fact-gate 編碼、風險、run 步驟）。

## 🔴 動工前 owner 拍板（燒錢 gate A，一次報價）
- **~113 隻 agent**（1 preflight + 8 config + **87 Sonnet drafter** + 8 Codex + 8 Opus gate + 1 build），**~1.5–3 小時 wall**。>10 subagent + >30 min → 觸發 gate A，**launch 前報一次規模等 owner 批准**，批後同批次不再問。

## Workflow 做對的關鍵（我已 review）
- **GlobalBuild 是唯一 barrier**（`await pipeline(...)` 之後跑一次）— `build:handout` 讀全部 `src/handout/*.html` 組單一 `handout.json`，per-subject 平行會 race。config/mine/draft/assemble/fact-gate 才 per-subject 平行。
- **Fact-gate 兩路查證（非盲套 Codex）**：每條 Codex finding → packet-grep 考選部原文（是官方答案還是 drafter 自創？）+ OE tiebreak → 保留考選部-aligned（加 `⚠️國際教科書` 小註）、只修真錯、含糊的進 `unresolved`。胚胎 21 條 HIGH 有 11 條是考選部官方答案 → 盲套會 ship 考試錯的答案。
- config 用正確的 `leafId` 欄位（非 `.id`）；partitionOk 必須 true 才進 draft。

## 跑完後 owner 要做的（workflow 刻意停在這之前 = 對外發布 gate）
1. 讀每科 `src/handout/<科>.html` + fact-gate 回傳的 **`unresolved` 清單**（尤其各藍圖的事實嚴謹熱點）——**別只信 build 綠燈**。
2. **dev 瀏覽器 QA**（內建 Browser）：subject picker 列全科、各測驗本區開得出非空題池、**21 個 brief 區 render**（首次 ship brief）、console clean、SPA 三件套。
3. **Ship**：⚠️ workflow **沒**建 per-subject OpenSpec spec delta —— 8 科的 spec 是 build 後另一步。建議**一次 bulk**：對 `neurons-anatomy-handout` 加 8 個「<科> region-keyed 教學結構」requirement（比照胚胎學那條）+ 各科 verify-handout built-output 斷言已由 workflow 加好。然後 archive → commit → **merge track-neurons→main（= CF Pages deploy，owner 確認）** → prod 驗證。

## ⚠️ 藥理學 17 區 = 17 drafter
gate-A 最大科。workflow 照藍圖跑（藍圖已鎖 17 區），若嫌 drafter 太多，build 前可在 `藥理學.md` 藍圖 consolidate 分區再跑。

## Key handles
- Workflow script：`scripts/handout-pipeline/build-remaining-handouts.workflow.js`（`node --check` 過，self-contained，免改直接跑）
- 設計說明：`docs/handout-architectures/_BUILD-ALL-WORKFLOW.md`
- 8 藍圖：`docs/handout-architectures/<科>.md`
- Worked example（單科）：`openspec/changes/archive/2026-07-11-add-neurons-embryology-handout/`
- Memory：`neurons-subject-handouts-pipeline.md`（契約 + fact-gate + roadmap）

## ⚠️ 併發注意（2026-07-11 22:00 發現）
handoff 當下另一個 session 正在改 `cloudflare/sync-worker/src/leaderboard.ts`（拿掉 doctor_count 上限，二階 leaderboard bug fix，非本任務）。跑 workflow 前確認該檔已由對方 session 收尾/commit，避免 staging race。
