## Why

二階 fate card 系統的 epic / legendary 卡池 spec 設計了「指定科 P3+ / P2 招募券」（[hospital-fate-cards/spec.md:33-34](openspec/specs/hospital-fate-cards/spec.md:33)），但 MVP 落地時 [fate-card.ts:145-152](apps/medexam2-hospital-tw/src/services/fate-card.ts:145) 把這兩個 reward 暫當 `grantTickets(1)` 發進 global pool，UI description 標「定向券待後續實作」。

抽到 epic（100k rep）或 legendary（1M rep）大價錢卡卻拿到一張普通券，玩家會覺得 reward 縮水；本 change 把 spec ↔ implementation gap 收掉。此外這是後續兩個 fate card change（`lower-fate-card-tier-gating` + `add-fate-card-negative-events`）的前置：早抽到 fate card 之前要先把高階卡的指定科 UX 做穩。

## What Changes

- **Targeted ticket 獨立 data model**：新增 `targetedTickets` Dexie table，存 `{ id, subjectId, minRarity, obtainedAt, status: 'pending' | 'assigned' | 'consumed' }`，跟 global `tickets.available` 分開
- **Draw 後 subject picker modal**：epic / legendary 抽到 targeted-pN-ticket → 開 picker，列出 **已 unlock 的 banner**（`affinity[subject] >= threshold[subject]`）；玩家選一科後 ticket `status = 'assigned'`，subjectId 固定不可改
- **「Save for later」 fallback**：抽中時若無任何 banner unlock，ticket `status = 'pending'`，FateCardPage / RecruitmentPage 顯示 chip `「N 張待指派 targeted ticket — 解鎖 banner 後可指派」`
- **Recruitment page 新增 targeted ticket consume row**：列出 `status = 'assigned'` ticket，按下 consume → auto-roll 該 banner、套 rarity floor 保證
- **Rarity floor enforcement**：deterministic reroll up to 5 次，若 5 次都低於 floor 則強制給 floor-tier doctor（P3 for epic / P2 for legendary）。簡單可預測、不需要新 rarity-floored weight table
- **History fidelity**：`fateCardHistory.rewardKey` 仍記 `targeted-p3-ticket` / `targeted-p2-ticket`；新增 `targetedTicketHistory` row 記錄 ticket 完整生命週期（obtained / assigned / consumed → doctorId）
- **保留 common / rare 為 global**（dogfood 確認 2026-05-19）：`recruitment-ticket-x3` / `recruitment-ticket-x10` 不動，給前期新手「用得起且不浪費」的紅利去解鎖陌生科別

## Capabilities

### New Capabilities

無新 capability。本 change 在既有 `hospital-fate-cards`、`recruitment-gacha`、`hospital-tutorial` 三個 spec 內擴 requirement。

### Modified Capabilities

- `hospital-fate-cards`: 新增 targeted ticket 持久化 + draw-time subject picker（含 double-step confirm）+ pending fallback 三條 requirement；spec line 33-34 的「targeted P3+/P2 recruitment ticket」reward 從「caller 自由解讀」收成「對應持久化 `targetedTickets` row」
- `recruitment-gacha`: 新增 targeted ticket consumption flow requirement — `tickets.available`（global）與 `targetedTickets`（per-ticket subject+rarity floor）兩條獨立路徑；targeted consume 強制走 rarity floor reroll loop
- `hospital-tutorial`: 新增首次 epic / legendary targeted draw 觸發 tutorial step 引導玩家完成 picker → confirm → assign → consume 流程

## Impact

### Affected code

- `apps/medexam2-hospital-tw/src/services/fate-card.ts:145-152` — 取代 fallback `grantTickets(1)`，改成寫 `targetedTickets` table
- `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx` — 抽中 targeted reward 後接 picker modal（含 double-step confirm 防誤觸）；新增 pending ticket chip
- `apps/medexam2-hospital-tw/src/pages/RecruitmentPage.tsx`（或新元件 `TargetedTicketRow.tsx`）— assigned targeted ticket consume UX
- `apps/medexam2-hospital-tw/src/db/schema.ts` — Dexie schema bump（新 table `targetedTickets` + `targetedTicketHistory`）
- `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` — 新增 2 個 collection-table adapter（per existing hospital_doctors pattern）
- `supabase/migrations/000X_targeted_tickets.sql`（新檔） — `targeted_tickets` + `targeted_ticket_history` Postgres table + RLS
- `supabase/migrations/000Y_upsert_lww_targeted.sql`（新檔） — 擴 `upsert_lww` RPC whitelist 接受新 table
- `packages/content-medexam2-tw/src/fate-cards.ts` — `FATE_CARD_TARGETED_TICKET_RARITY` 已存在（line 106-109），不動；新增 `TARGETED_REROLL_CAP = 5` 常數
- `apps/medexam2-hospital-tw/src/services/targeted-ticket.ts`（新檔） — `rollBannerWithRarityFloor(subjectId, minRarity)` helper + lifecycle service（create / assign / consume）

### Affected specs

- `openspec/specs/hospital-fate-cards/spec.md` — 新增 3 個 requirement section（持久化 / picker with double-step confirm / pending fallback）
- `openspec/specs/recruitment-gacha/spec.md` — 新增 2 個 requirement section（targeted ticket consumption with rarity floor + 獨立 UI section）
- `openspec/specs/hospital-tutorial/spec.md` — 新增 1 個 requirement section（首次 epic / legendary targeted draw tutorial step）

### Cloud sync integration（本 change 範圍內）

二階 cloud sync 已 shipped（`openspec/changes/archive/2026-05-17-add-cloud-sync/` + [apps/medexam2-hospital-tw/src/lib/sync/tables.ts](apps/medexam2-hospital-tw/src/lib/sync/tables.ts) 已實作 hospital_state / hospital_doctors / hospital_mastery / hospital_question_history 四個 adapter）。新增的 `targetedTickets` / `targetedTicketHistory` 兩個 table **本 change 內就要接上 sync engine**，理由：targeted ticket 是 epic（100k rep）/ legendary（1M rep）大價錢 reward，玩家換裝置時不能丟。實作方式跟既有 collection-table pattern 一致：

- Supabase migration（新檔，例 `supabase/migrations/0008_targeted_tickets.sql`）建 `targeted_tickets` + `targeted_ticket_history` 兩個 table + RLS policy `auth.uid() = user_id`
- 擴 `upsert_lww` RPC whitelist（新檔 migration，例 `0009_upsert_lww_targeted.sql`，比照 `0006_upsert_lww_bookmarks.sql` 慣例）
- [apps/medexam2-hospital-tw/src/lib/sync/tables.ts](apps/medexam2-hospital-tw/src/lib/sync/tables.ts) 加 2 個 adapter，per-row LWW（`updatedAt` 已在 schema）
- 兩 table 都是 collection-shape（不 collapse 進 hospital_state singleton），跟 hospital_doctors 同 pattern

### Out of scope (for this change)

- Common / rare ticket targeting — 保留 global（前期新手紅利設計）
- Fate card lower-tier gating — 排程下一個 change `lower-fate-card-tier-gating`
- Negative event pool — 排程第三個 change `add-fate-card-negative-events`
