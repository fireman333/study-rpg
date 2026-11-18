# Decisions / Next-session handoff — 2026-07-12

> 寫給 clear 後 `/spec resume` 接手。本 session 已把**全 11 科考前講義 SHIPPED to prod**（merge `1c63bb94`；archive `2026-07-12-add-neurons-remaining-subject-handouts`）。以下是 owner 交代的 2 個 next-session 任務，**都尚未動工**。

## 任務 1（優先）— handout×rescue 整合 MVP

**目標**：把「考前救急」戰情圖的**紅色概念 chip** deep-link 到「考前講義」對應 **region**。單向（救急→講義）、唯讀、**零新持久狀態**。

- **走 OpenSpec**（`/opsx:propose` → apply → verify），**停在 merge=部署紅線前等 owner 確認**（不自行部署）。
- **完整規劃 doc**（recon agent 已產，read 它再動工）：`~/coding-scratch/2026-07-12-handout-rescue-11subject-plan.md`（已複製到跨-session 持久位置，clear 後仍在；point 使用者「看一下這個檔」即可，否則按 coding-scratch CLAUDE.md root .md 不主動讀規則）。備援：project memory `neurons-handout-rescue-integration-followup.md`（原始 scoping）。
- **關鍵事實（recon grep 確認）**：join key 已天然對齊 —— 救急 `plan.familyId` === 講義 `subjectId` === `q.subject`；救急 `WarMapConcept.conceptId` === 講義 config `leafIds` === canonical leafId。**免手寫 concept→region 對照表**。整合是**一次性 subject-agnostic engine change（3~4 檔）**，非 per-subject 工作。source: `RescueScene.tsx:800`（紅 chip `<span>`→button）；target: `HandoutPage.tsx`（加 `?subject=`+`?leaf=` 解析，用 `active.chapterQuizzes[].leafIds→regionId` 前向 resolve）。
- **主要 trap**：leafId 跨科不唯一（68 共用）→ resolver 必須 (subject,leaf) 兩段、禁全域 map；conceptId 可能落在無 region 的 disputed-only leaf → 明示 unavailable、**絕不 fallback 到 region 0**；11 科都已上線故不必 gate chip（但保留 guard）；overlay→route 先 `onClose()` 再 navigate。零 R2 SV bump（維持 28）、零 Dexie。
- **現在完全 unblocked**：全 11 科講義已 live（任務 2 重排不影響 join key，可任一先做）。

## 任務 2 — 考前講義科目排序改按 family 原順（先醫學一再醫學二）

**現況**：`SUBJECT_META`（`packages/content-neurons-tw/scripts/build-handout.ts`）order = 解剖0/組織1/胚胎2/生理3/藥理4/病理5/寄生6/微生7/生化8/公衛9/免疫10 —— 醫學一/二**交錯**。

**改成**：對齊 **`packages/content-neurons-tw/src/families.ts` 的 `EXAM_PAPER_ORDER`**（single source of truth，勿另抄一份魔數）：
- 醫學一：解剖學 → 胚胎學 → 組織學 → 生理學 → 生物化學
- 醫學二：微生物學 → 免疫學 → 寄生蟲學 → 公共衛生學 → 藥理學 → 病理學

**實作建議**：與其手改 11 個 order 數字，不如讓 `SUBJECT_META` 的 order 從 `EXAM_PAPER_ORDER`（`[...醫學一, ...醫學二].indexOf(subjectId)`）**衍生**，避免日後兩處 drift（content-neurons-tw 已 export `EXAM_PAPER_ORDER`，可 import）。
- **deploy-affecting**（改 subject picker 順序，user-visible）→ 走 OpenSpec 或至少 batch change，收尾要 merge=部署（owner gate）。可與任務 1 同一批上或分開。
- verify:handout / build 的 region 數斷言不受 order 影響（只驗 count + 非空池），不用改。

## 本 session 狀態快照
- Git：track-neurons 與 origin 同步（0 ahead）；working tree 只剩 2 個無關 untracked（`.claude/launch.json`、`docs/VIDEO-HARNESS-GUIDE.md`）。
- OpenSpec：`openspec validate --all` = 108/0。唯一 in-progress change = `eliminate-cross-device-r2-412-storm`（parked Phase-2 tracker，與這兩個任務無關）。
- 上線後非阻塞：生理 ALPHA-WAVE framing（`hdt-neuro-core`，考選部 107-2-Q50 vs 111-2-Q51 自相矛盾，原文保留）；21 個 brief 區 prod 掃一眼。
