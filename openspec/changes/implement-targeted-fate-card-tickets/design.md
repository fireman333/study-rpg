## Context

二階 fate card 卡池在 [packages/content-medexam2-tw/src/fate-cards.ts:89-99](packages/content-medexam2-tw/src/fate-cards.ts:89) 已宣告 epic / legendary 兩階的指定科招募券 reward key（`targeted-p3-ticket` / `targeted-p2-ticket`），且 spec [hospital-fate-cards/spec.md:33-34](openspec/specs/hospital-fate-cards/spec.md:33) 列在卡包 reward pool table 中。**但實作層 [fate-card.ts:145-152](apps/medexam2-hospital-tw/src/services/fate-card.ts:145) 用 `grantTickets(1)` fallback 處理**，description 標「定向券待後續實作」，等於把 100k rep 抽到的史詩 reward 縮水成一張普通券。

現況經濟線：
- `tickets.available`（global pool）— 由 daily refresh / quiz fresh-correct grant / banner-unlock bonus / fate card common/rare reward / 既有 fallback 來源累積
- `targetedTickets`（不存在）— 本 change 新增

設計約束（dogfood-confirmed 2026-05-19）：
- Common / rare ticket 維持 global（前期新手紅利）
- Epic / legendary 必須走 targeted 路徑（rarity floor 保底 + subject lock）
- Quiz → affinity → unlock 主迴圈不能被 bypass — targeted ticket 仍要求該科 banner 已 unlock 才能 assign

## Goals / Non-Goals

**Goals:**

- 抽到 `targeted-p3-ticket` / `targeted-p2-ticket` 後，UX 走「選科 → confirm → assign → 之後消耗」四步，不再 fallback 成普通券
- Rarity floor 必須兌現：epic 至少 P3，legendary 至少 P2
- 玩家在無 banner unlock 時抽到 targeted reward 不會浪費（pending 保存）
- 跟 global ticket pool 完全分離，互不干擾
- **接上既有二階 cloud sync engine**：新增的 `targetedTickets` + `targetedTicketHistory` 兩個 collection-table 接入 [tables.ts](apps/medexam2-hospital-tw/src/lib/sync/tables.ts) adapter + Supabase migration + `upsert_lww` whitelist 擴充，跟既有 hospital_doctors 同 pattern
- **首次 epic / legendary targeted draw tutorial step**：引導玩家完成 picker → confirm → assign → consume 完整流程，避免一頭霧水
- 後續 change（`lower-fate-card-tier-gating` / `add-fate-card-negative-events`）開工前接縫穩定

**Non-Goals:**

- ❌ 改 common / rare ticket 為 targeted（顯式保留 global，dogfood 設計決策）
- ❌ 改 fate card tier gating（下個 change）
- ❌ 改 fate card reward pool 內容 / weight（本 change 只動 ticket 處理流程）
- ❌ 改 affinity threshold / banner unlock 機制
- ❌ 玩家把已 assigned ticket reassign 到別科（一旦選定就 lock — 防誤觸靠 pre-assign double-step confirm，不靠 post-assign cancel）
- ❌ Pending ticket 累積上限（不設 cap，依 reputation cost gate 自然 throttle）
- ❌ Force-floor 觸發過程透明化（UX 只 reveal 最終 doctor，內部 reroll loop 對玩家不可見）

## Decisions

### 1. 新 Dexie table vs 擴 `tickets` 既有 row

**選**：新 table `targetedTickets`（plus `targetedTicketHistory` 記生命週期）

**為何不擴 `tickets`**：[recruitment-gacha/spec.md:240](openspec/specs/recruitment-gacha/spec.md:240) 既有 `tickets.available` 是單一 integer counter，加 per-ticket metadata（subjectId / minRarity / status）會破壞既有 Req 「Each successful roll SHALL consume exactly 1 ticket」的 atomic decrement 語意。獨立 table 也讓 cloud sync table adapter 邊界乾淨（per-row LWW），不會把整個 ticket counter 變成複雜 schema。

**Schema**:
```typescript
interface TargetedTicket {
  id: string                              // crypto.randomUUID()
  subjectId: SubjectId | null             // null when status='pending'
  minRarity: 'P2' | 'P3'                  // floor (epic→P3, legendary→P2)
  status: 'pending' | 'assigned' | 'consumed'
  obtainedAt: number                      // Unix ms
  assignedAt: number | null               // set when status transitions to 'assigned'
  consumedAt: number | null               // set when status transitions to 'consumed'
  resultDoctorId: string | null           // FK to doctors.id, set on consume
  sourceFateCardTier: 'epic' | 'legendary'
  updatedAt: number                       // for LWW sync
}

interface TargetedTicketHistoryRow {
  ticketId: string
  event: 'obtained' | 'assigned' | 'consumed'
  at: number
  meta: { subjectId?: string; doctorId?: string; rarity?: Rarity }
}
```

### 2. Subject picker timing：draw-time vs consume-time + double-step confirm 防誤觸

**選**：draw-time（抽中 reward → 立刻開 picker）+ 點選後彈 confirm modal 二段驗證

**為何不選 consume-time**（讓 ticket 一直是 pending，玩家在 recruitment 頁面再選科）：
- Draw-time 把「選擇」綁在「reward 開出」的高情緒節點，玩家感覺到 reward 對自己的 specific 影響
- Consume-time 會讓 inventory 累積一堆 "any subject" P3 票，變相 reset 成 global pool（違反指定科 spec 意圖）

**Double-step confirm 設計**（grill 2026-05-19 確認）：
- Picker 列出 unlocked banner，玩家點某科 → 不立即 commit，先彈 confirm modal「確定要把這張 ${tier} targeted ticket 指派給 ${subjectId}？此操作不可逆」
- 玩家按「確認指派」才實際寫入 `status='assigned'`；按「我再想想」回到 picker
- 防誤觸（misclick），同時保持 commit 後完全 lock 的簡潔語意（無 24h cancel window、無 pre-consume reassign）

**例外 fallback**：玩家 0 unlocked banner 時，仍允許 `status='pending'` 暫存（避免抽中 reward 但無法 assign 的死局），但 UI 持續 nudge「解鎖任一 banner 即可指派」

### 3. Rarity floor enforcement：deterministic reroll vs rarity-floored weight table

**選**：deterministic reroll up to `TARGETED_REROLL_CAP = 5` 次，若 5 次都低於 floor 則 force floor-tier

**為何不選新 weight table**：
- 既有 `recruitment.ts` 的 weight table 是 P1=2% / P2=10% / P3=30% / P4=40% / P5=18%（per spec [recruitment-gacha/spec.md:81-91](openspec/specs/recruitment-gacha/spec.md:81)）。要做 rarity-floored 版本要重算 weight 並 normalize，多一張 table 維護
- Deterministic reroll 簡單可預測，5 次內命中機率：epic (P3+ = P1+P2+P3 = 42%) → 1 − 0.58⁵ ≈ 93.5%；legendary (P2+ = 12%) → 1 − 0.88⁵ ≈ 47% — legendary 命中率偏低需要強制 floor，這正是「保證 P2」的本意
- 5 次 reroll cap 是性能保險（async loop 不該無限跑）+ 統計可預測（最壞情況：epic ~6.5% 走 force-P3、legendary ~53% 走 force-P2）

**Pseudocode**:
```typescript
async function rollBannerWithRarityFloor(
  subjectId: SubjectId,
  minRarity: 'P2' | 'P3',
): Promise<Doctor> {
  for (let attempt = 0; attempt < TARGETED_REROLL_CAP; attempt++) {
    const roll = rollRecruitment(subjectId)  // existing gacha
    if (rarityIsAtLeast(roll.rarity, minRarity)) return roll
  }
  // 5 rerolls all below floor — force floor tier
  return rollRecruitmentAtFixedRarity(subjectId, minRarity)
}
```

`rollRecruitmentAtFixedRarity` 是新 helper：sample 該科該 rarity 的 doctor template（同 [recruitment-gacha/spec.md:152-170](openspec/specs/recruitment-gacha/spec.md:152) doctor instantiation flow，只是 rarity 固定）

### 4. Pity 計數：targeted ticket 不增 pity

**選**：targeted ticket 的 reroll 過程**不計入** `recruitment-gacha` 既有的 30/100 保底（[recruitment-gacha/spec.md:285-290 wire-recruitment-gacha 沿用 loot.ts 保底](packages/core/src/lib/loot.ts)）

**為何**：targeted ticket 本身已有 rarity floor 保證，再疊 pity 等於雙重 mechanic、難 reason about 玩家體感。Targeted consume 是獨立路徑，pity counter 只跟著 global ticket roll 累積。

### 5. History fidelity：兩 layer

**選**：保留既有 `fateCardHistory.rewardKey = 'targeted-p3-ticket'`（記 fate card draw 結果）+ 新增 `targetedTicketHistory` table（記 ticket 生命週期 3 個 event）

**為何不合**：fate card history 是 fate-card-side telemetry（cost、result、pity），targeted ticket lifecycle 跨 fate card → recruitment 兩個系統。分開讓 fate card history 保持 stable schema，不被 ticket 後續行為污染。

### 6. UI surface 位置

- **抽中 targeted reward 後**：`FateCardPage.tsx` 既有 result modal 接 subject picker 階段（複用 modal，不開新頁）；picker 點選後接 double-step confirm modal
- **Pending ticket banner**：`FateCardPage.tsx` 頂部顯示 chip「N 張待指派 targeted ticket — 解鎖任一 banner 後可指派」
- **Assigned ticket consume**：`RecruitmentPage.tsx` 新增 `TargetedTicketRow` 元件，列在既有 banner grid 上方獨立 section；按下 consume → confirm modal → roll → 顯示 doctor reveal（複用既有 reveal UI；force-floor 觸發過程不可見，只 reveal 最終結果）

### 7. Cloud sync 整合方式

**選**：兩個新 table 都用 collection-shape adapter，跟 hospital_doctors 同 pattern

**為何不 collapse 進 hospital_state singleton**：
- `targetedTickets` 是 per-row entity（每張 ticket 有獨立 lifecycle），不適合 blob aggregation
- Singleton blob 容量上限約 1 MB JSONB，pending ticket 累積（無 cap）可能撐爆
- Per-row adapter 自然支援 LWW conflict resolution（targetedTickets 跨裝置可能同時 assigned）

**Postgres schema**：
```sql
CREATE TABLE targeted_tickets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  subject_id TEXT,
  min_rarity TEXT NOT NULL,
  status TEXT NOT NULL,
  obtained_at BIGINT NOT NULL,
  assigned_at BIGINT,
  consumed_at BIGINT,
  result_doctor_id TEXT,
  source_fate_card_tier TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  app_version TEXT
);
CREATE INDEX targeted_tickets_user_status_idx ON targeted_tickets(user_id, status);
ALTER TABLE targeted_tickets ENABLE ROW LEVEL SECURITY;
-- 4 RLS policies (SELECT/INSERT/UPDATE/DELETE on user_id = auth.uid())
```

`targeted_ticket_history` 結構類似，PK = (user_id, ticket_id, event) 或 surrogate UUID。

**`upsert_lww` whitelist 擴充**：新 migration `0009_upsert_lww_targeted.sql`，比照 [0006_upsert_lww_bookmarks.sql](supabase/migrations/0006_upsert_lww_bookmarks.sql) 的 `CREATE OR REPLACE` + 新增 dispatch ELSIF branch 慣例

### 8. Tutorial step 設計

**選**：首次 epic OR 首次 legendary 抽到 targeted reward 觸發一次 tutorial step（兩 trigger 各觸發一次，不要每次抽都跳）

**State tracking**：用既有 `hospital-tutorial` 的 milestone-tip 機制（`useMilestoneTips`），新增兩個 milestone key（例 `firstEpicTargetedDraw` / `firstLegendaryTargetedDraw`）

**Copy**：
- First epic：「你抽到了第一張史詩 targeted ticket — 選一科 unlocked 的 banner 指派給這張券，使用時保證 P3+ 等級！指派後不可改科。」
- First legendary：「傳奇 targeted ticket！同樣選一科指派，這次保證 P2+ 等級。」

**位置**：tutorial step 在 picker modal 打開前以 overlay 形式顯示，玩家確認後才進 picker

## Risks / Trade-offs

- **[Risk] Player 抽到 epic targeted 但無 banner unlock → 體感「卡關」** → Mitigation: pending status + 顯眼 UI nudge「解鎖任一 banner 即可指派」+ 首次抽中 tutorial step（本 change 內整合 hospital-tutorial）
- **[Risk] Rarity floor 5-reroll cap 在 legendary 觸發 force-P2 的機率高（~53%）** → Mitigation: 這正是「保證 P2」的本意，spec 文案明確說 floor enforcement 而非 weighted sampling；UI 不顯示 reroll 過程、只顯示最終結果，玩家感受不到「reroll 5 次」
- **[Risk] Dexie schema bump 對既有玩家做 migration** → Mitigation: 新增 table 不影響既有 row；migration 只需 v9 `stores({ targetedTickets: '...', targetedTicketHistory: '...' })`，無資料遷移
- **[Risk] 新 Supabase migration + RLS 設定錯誤可能造成 cross-user data leak** → Mitigation: RLS policy `auth.uid() = user_id` 套既有 hospital_doctors 同 pattern；migration 上 prod 前在 staging 跑 `supabase/sanity/` 風格的 sanity SQL 驗證 only-own-rows visibility
- **[Risk] Pending ticket 無 cap 可能讓單個 user 累積上千列、撐大 Supabase storage / sync payload** → Mitigation: epic / legendary 抽取需要 100k / 1M reputation cost，自然 throttle；若 dogfood 發現異常 hoarding 行為，後續 change 補 soft cap
- **[Trade-off] 抽中 targeted reward 強制當下選科 vs 累積後選** → 選 draw-time 強化 reward 對 specific 影響的感受 + double-step confirm 防誤觸，代價是抽 5 連 legendary 要連選 5 次（mitigated by 大部分玩家不會連抽 legendary）
- **[Trade-off] 不做 24h cancel window** → 玩家若選錯科自負，但 double-step confirm 已是兩道閘門（picker tap + confirm modal），誤觸機率低；換來語意簡潔（一旦 assigned 就是 final）

## Migration Plan

1. **Supabase migration**（新檔 `0008_targeted_tickets.sql`）：建 `targeted_tickets` + `targeted_ticket_history` table、index、4 RLS policy；對 staging 跑 sanity SQL 確認 RLS
2. **`upsert_lww` whitelist 擴充**（新檔 `0009_upsert_lww_targeted.sql`）：`CREATE OR REPLACE` 含 2 個新 table dispatch branch（比照 0006 慣例）
3. **Dexie schema bump**：`apps/medexam2-hospital-tw/src/db/schema.ts` 加 version 9：
   ```typescript
   this.version(9).stores({
     targetedTickets: 'id, status, subjectId, obtainedAt, updatedAt',
     targetedTicketHistory: 'ticketId, at, event',
   })
   ```
4. **Sync adapter**：[apps/medexam2-hospital-tw/src/lib/sync/tables.ts](apps/medexam2-hospital-tw/src/lib/sync/tables.ts) 加 2 個 collection-shape adapter（per hospital_doctors pattern）
5. **Service layer**：[fate-card.ts:145-152](apps/medexam2-hospital-tw/src/services/fate-card.ts:145) 拆成兩階段 — `handleFateCardReward` 抽到 targeted 時呼叫 `createPendingTargetedTicket(tier)` 不 grant global ticket；UI 接著開 picker；首次觸發 tutorial overlay
6. **UI delivery**：FateCardPage picker modal + double-step confirm → RecruitmentPage targeted row → consume reveal flow
7. **Tutorial integration**：`useMilestoneTips` 加 `firstEpicTargetedDraw` / `firstLegendaryTargetedDraw` milestone key 與對應 copy
8. **Rollback**：dexie v9 forward-only；Supabase migration 用獨立 `0008_` / `0009_` 編號便於 revert；若要 service rollback 改回舊 `grantTickets(1)` 同時保留 `targeted_tickets` table（廢棄但不刪除）讓玩家既有 ticket 不消失

## Open Questions

無 — grill 2026-05-19 解開原本三個 Open Questions：

- ~~Q1 取消 assigned ticket~~ → **已決**：不允許 cancel；改用 picker → confirm modal 二段驗證防誤觸（per Decision #2）
- ~~Q2 Targeted ticket history UI~~ → **已決**：本 change 只做資料 layer，UI listing 待 dogfood 看需求
- ~~Q3 P1 dropped during reroll loop~~ → **已決**：P1 是 P3+ / P2+ 合格 result，直接 return，不刻意 dampen
