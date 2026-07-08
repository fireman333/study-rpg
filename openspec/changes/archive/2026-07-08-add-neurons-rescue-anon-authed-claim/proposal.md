# Guard anonymous → authed rescue adoption with a claim prompt

> **狀態：DECIDED (cloud-wins-B) + implemented, verify green.** owner 於 2026-07-08 選定 **B（雲端優先、無 UI）**。`design.md` / spec delta / `tasks.md` 已寫；code + 4 新 tests + 1081-suite green + typecheck clean。剩：spec 措辭 owner 確認 → archive → commit + merge/deploy（owner-gated）→ 真機驗。

## Why

Rescue 狀態刻意 account-owned（`openspec/specs/neurons-single-subject-rescue/spec.md:68`），但**未登入時**救急計畫已經直接寫進 account-owned 的 `db.meta`（`apps/neurons-tw/src/lib/services/rescue/rescue-store.ts:199-207` `writeEnvelope → putMeta`，無登入判斷；start 於 `:256-269`）。

首次登入既有帳號時，account gate 走 `evaluateAccountGate(null, uid) → 'proceed-and-write'`（`apps/neurons-tw/src/lib/sync/account-guard.ts:74-78`；`apps/neurons-tw/src/lib/sync/useSync.ts:81-86`）——**不 wipe、直接收編**本機匿名資料。之後 startup force-pull + `backfillRescueLWW` 以 `updatedAt` 比大小（`apps/neurons-tw/src/lib/sync/backfill/rescue.ts:50-64`；`rescue-sync-keys.ts:206-215`），匿名期的動作幾乎必然較新 → **匿名 envelope LWW 蓋掉雲端既有救急計畫**。

最壞形狀：使用者在新裝置未登入時 start 另一科（或匿名 abandon）→ 登入 → 雲端 active run 被替換/清空，其 run-scoped confidence 因 `createdAt` re-scope 一併失效 = 跨裝置 data loss。

現有 guard 不夠：`startupSyncPending`（`RescueScene.tsx:110-114`）只擋「pull 未落地時 mint 新 plan」，擋不住 sign-in **前**就已存在的匿名 envelope；same-family resume（`rescue-store.ts:256-263`）只救同科。

**兩位 reviewer 都獨立確認此洞為真**，但對急迫度分歧（見下方 Open Questions）——本 proposal 先把它變成可追蹤的 queued change，急迫度由 owner 定。

## What Changes（cloud-wins-B，已實作）

**首次登入的第一次 pull（marker 為 null 的 `proceed-and-write` 收編路徑）**：若帳號雲端 rescue plan envelope 帶 **非 null（active）plan**，雲端計畫為準 → verbatim 取代本機 envelope、**不看 `updatedAt`**，匿名本機計畫（即使 `updatedAt` 較新）無法 LWW 蓋掉帳號真實計畫。雲端 plan **absent 或 explicit-null** → 走正常 LWW → 全新帳號仍帶匿名進度過去。

- 純 merge-端最小改動：`useSync` 設一次性 adoption flag（consumed on first pull）→ `runOnPullComplete` → `backfillRescueLWW` 的 `cloudPlanWins` opt。無 UI、無 modal。
- 順序安全既有保障：startup force-pull 先於第一次 push（S3），cloud-wins 先落地 → 匿名計畫永不被上傳蓋雲端。
- **零 schema 改動**（不 bump Dexie / R2 SCHEMA_VERSION / SYNCED_META_KEYS；純 merge 決策）。機制細節見 design.md。

## Capabilities

### Modified Capabilities
- `neurons-single-subject-rescue`：新增「匿名 → 登入 收編需經 claim gate」的 requirement（待 owner 確認 scenario 措辭）。
- 可能觸及 `neurons-cloud-sync`：現行 spec 明文「anonymous-progress upload-merge 維持不變」（`neurons-cloud-sync/spec.md:11-15`），與 rescue 的 account-owned 定位張力需在此 change 對齊。

## Impact

- **Code**：`account-guard.ts` / `useSync.ts`（首登 gate 分支）+ 一個 claim modal + `rescue-store.ts`（判斷「本機有匿名 rescue envelope」的 helper）。範圍待 design.md 收斂。
- **真機驗證**：首登 anon→authed 收編行為只能在部署後真機測（localhost dev R2 push 不可用）。

## Decisions（2026-07-08，owner）

1. **急迫度**：現在做（此 session 隨 re-check 一起收）。
2. **Scope**：**B — rescue 特化的 cloud-wins（無 prompt）**。不採 A（claim prompt，觸發過窄、UI 不划算）、不採 C（通用匿名收編 gate，over-scoped、會碰 `neurons-cloud-sync` anonymous-merge 不變量）。
3. **UX 落點**：無 UI（純 merge 決策）。代價：帳號雲端已有 active 計畫時，靜默丟掉匿名本機 cram plan（ephemeral、低害）；owner 明確接受。

## Provenance

2026-07-08 rescue R2 同步 dual-review（Fable re-check + Codex adversarial panel）。相關已修 sibling：`add-neurons-rescue-r2-sync`（B1/B2 cross-device safety，archived 2026-07-08）+ 本次同 session 修的 `archiveIfDue` startup-gate（同一 cross-device-safety family 的第三個漏網 gate）。
