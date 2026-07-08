# Guard anonymous → authed rescue adoption with a claim prompt

> **狀態：QUEUED / proposal-stage only.** 這是 2026-07-08 rescue R2 同步 dual-review（Fable × Codex）產出的 follow-up。proposal 先落地當 queue；`design.md` / spec delta / `tasks.md` 待 owner 對 UX 與 scope 決策後再寫（curator rule：spec scenario 需 owner 確認措辭才寫）。

## Why

Rescue 狀態刻意 account-owned（`openspec/specs/neurons-single-subject-rescue/spec.md:68`），但**未登入時**救急計畫已經直接寫進 account-owned 的 `db.meta`（`apps/neurons-tw/src/lib/services/rescue/rescue-store.ts:199-207` `writeEnvelope → putMeta`，無登入判斷；start 於 `:256-269`）。

首次登入既有帳號時，account gate 走 `evaluateAccountGate(null, uid) → 'proceed-and-write'`（`apps/neurons-tw/src/lib/sync/account-guard.ts:74-78`；`apps/neurons-tw/src/lib/sync/useSync.ts:81-86`）——**不 wipe、直接收編**本機匿名資料。之後 startup force-pull + `backfillRescueLWW` 以 `updatedAt` 比大小（`apps/neurons-tw/src/lib/sync/backfill/rescue.ts:50-64`；`rescue-sync-keys.ts:206-215`），匿名期的動作幾乎必然較新 → **匿名 envelope LWW 蓋掉雲端既有救急計畫**。

最壞形狀：使用者在新裝置未登入時 start 另一科（或匿名 abandon）→ 登入 → 雲端 active run 被替換/清空，其 run-scoped confidence 因 `createdAt` re-scope 一併失效 = 跨裝置 data loss。

現有 guard 不夠：`startupSyncPending`（`RescueScene.tsx:110-114`）只擋「pull 未落地時 mint 新 plan」，擋不住 sign-in **前**就已存在的匿名 envelope；same-family resume（`rescue-store.ts:256-263`）只救同科。

**兩位 reviewer 都獨立確認此洞為真**，但對急迫度分歧（見下方 Open Questions）——本 proposal 先把它變成可追蹤的 queued change，急迫度由 owner 定。

## What Changes（草案方向，待 owner 確認）

Fable 提的便宜版（rescue 特化，成本低）：**首次登入且雲端已有 rescue envelope 時，彈一個 claim 選擇「保留雲端 / 用本機」**，在 sync 收編本機匿名 rescue 資料**之前**攔一道。Codex 版更嚴：任何 rescue meta 存在且 ownership marker 缺席時，在 mount sync 前先做 adopt/discard gate。

- 不改 LWW / merge 語意本身，只在「匿名 rescue envelope 首次進 authed 帳號」這個邊界加一道人工選擇。
- 預期零 schema 改動（純攔截既有收編流程 + 一個 modal）。

## Capabilities

### Modified Capabilities
- `neurons-single-subject-rescue`：新增「匿名 → 登入 收編需經 claim gate」的 requirement（待 owner 確認 scenario 措辭）。
- 可能觸及 `neurons-cloud-sync`：現行 spec 明文「anonymous-progress upload-merge 維持不變」（`neurons-cloud-sync/spec.md:11-15`），與 rescue 的 account-owned 定位張力需在此 change 對齊。

## Impact

- **Code**：`account-guard.ts` / `useSync.ts`（首登 gate 分支）+ 一個 claim modal + `rescue-store.ts`（判斷「本機有匿名 rescue envelope」的 helper）。範圍待 design.md 收斂。
- **真機驗證**：首登 anon→authed 收編行為只能在部署後真機測（localhost dev R2 push 不可用）。

## Open Questions（owner 決策後才寫 design/spec/tasks）

1. **急迫度**：Codex = High「不該繼續 deferred」；Fable = P3「洞真但觸發窄——需『新裝置匿名玩過救急 → 才登入既有帳號』；owner 已登入，單人 dogfood 近期機率低」。→ 現在做，還是排在後面？
2. **Scope**：只做 rescue 特化的 claim prompt（Fable，便宜），還是做通用的「匿名 progress 首登收編 gate」（Codex，較大、會碰 `neurons-cloud-sync` 既有 anonymous-merge 語意）？
3. **UX 落點**：claim 選擇在 sign-in flow 彈，還是進 rescue scene 時彈？copy 怎麼寫（「這個帳號雲端已有救急計畫，要保留雲端還是改用這台的？」）。

## Provenance

2026-07-08 rescue R2 同步 dual-review（Fable re-check + Codex adversarial panel）。相關已修 sibling：`add-neurons-rescue-r2-sync`（B1/B2 cross-device safety，archived 2026-07-08）+ 本次同 session 修的 `archiveIfDue` startup-gate（同一 cross-device-safety family 的第三個漏網 gate）。
