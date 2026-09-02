# 讓 `add-cloudflare-auth-migration` 退場

> 2026-08-02。owner 決定。
> ⚠️ **這份提案從來沒有進過 git，現在已經刪除，所以本文是它唯一的存底。** 下面刻意記得比一般
> 退場說明詳細——不是為了留戀，是因為刪掉的是 229 行 design（D1–D16）、138 行 tasks（11 段 88 條）
> 與 4 份 delta spec（31 條 requirement），而其中有些判斷跟這份提案的存廢無關、日後仍可能有用。

## 它是什麼

`openspec/changes/add-cloudflare-auth-migration/`，2026-05-25 建立、05-26 最後改動，四個 artifact
齊全、`openspec validate --strict` 通過、**tasks 0/88**、零實作。它在 owner 自己的清單上代號
**B2**（`decisions/2026-06-03.md:28`：「draft: proposal + design + tasks + specs, fairly complete…
Run in main worktree」），之後至少四份文件重複記載「那是另一個 session 的資料夾，先別碰」，最近一次
是 `study-rpg-2nd/openspec/decisions/2026-07-30`。**沒有人在做它，也沒有 worktree 對應**——它是被
刻意停放的，不是 propose 中斷的殘骸。

目標：把最後三個 Supabase 面向全部搬離。

1. **Auth** — Supabase Auth (Google OAuth) → Worker 自己做 PKCE code exchange、簽 ES256 JWT。
   `sync-worker/src/auth.ts` 從 65 行的 JWKS verifier 擴成完整 auth module（~250 LOC），新增
   `/auth/google/start`、`/auth/google/callback`、`/auth/refresh`、`/auth/logout`、`/auth/me`。
2. **`bug_reports`** — Supabase Postgres + RLS → D1 表，RLS 換成 Worker 端 JWT scoping；
   owner 端從 dashboard SQL 改成 `GET /bug-reports/admin/list`（靠 JWT `role: 'owner'` claim）。
3. **三個 RPC** — `delete_my_data` / `delete_my_account` / `export_my_data` →
   `POST /account/reset-data`、`DELETE /account`、`GET /account/export`。

三個 app（一階 `medexam-tw`、二階 `medexam2-hospital-tw`、神經元 `neurons-tw`）都拿掉
`@supabase/supabase-js`。~29 個 dogfood 使用者被迫重新登入一次，靠 Google `sub` claim 對回原本的
UUID，讓 R2 bundle 路徑與兩張 leaderboard 表繼續指向同一個玩家。

## 為什麼現在退場（四條，前兩條是決定性的）

1. **前提在提案寫完一週後就過期了。** 它整份建立在「三個 app」之上。而 `medexam-tw` 移除、二階拆成
   獨立 repo，兩件事都發生在 **2026-06-03** —— 比提案晚了八天。現在這個 repo 只剩 `neurons-tw`。
   一份談「把三個 app 的 auth 一起換掉」的 breaking change，對著一個 app 是另一件事，不是同一件事
   打折。
2. **Supabase 這半年走的是相反方向。** 提案的第一句話是「唯一剩下的 Supabase 面向是 auth /
   bug_reports / 三個 RPC」。那句話今天是假的：`0021`–`0035` 在 Postgres + RLS 上蓋出整套
   community notes（notes / revisions / flags / helpful / images / profiles，十幾張表、二十幾個
   函式），還有 `0034` 剛把七個 legacy 函式收成 default-deny。**Supabase 不再是「快要清空的殘留」，
   它是現在承載最多新功能的地方。** 「拿掉第二家廠商」這個動機本身已經不成立。
3. **D1 編號假設全部作廢。** 它假設 `0006_auth_and_bug_reports.sql` 是「0001–0005 之後的下一個」，
   並會生成 `0007_seed_users` / `0008_seed_bug_reports`。三個號現在都被 neurons 佔走
   （`0006_neurons_variant_cap_and_settles`、`0007_neurons_variant_cap_220`、`0008_neurons_shoutout`），
   下一個空號是 **`0011`**。⚠️ 它**不含任何 Supabase migration**，所以與同日的 `0000` / `0035`
   無衝突——這點查過，不是假設。
4. **兩個半月零進度。** 不是「排在後面」，是它的 apply gate（`add-r2-cloud-sync-migration` 必須先
   archive）早就滿足了，然後沒有人動它。

## 刪掉的東西裡，哪些判斷值得留

如果哪天真的要重做（**應該是重新 propose，不是撿回這份**），以下幾條是它自己推導出來、與三個 app
的前提無關、重做時不必再想一次的：

- **D3 選 ES256（P-256 ECDSA + SHA-256）而非 HS256** —— 因為公鑰可以放進 Worker secret 做本地驗
  證，不需要把簽章金鑰散佈到每個驗證點。
- **D4 access JWT 15 分鐘 + opaque refresh token（32 bytes，SHA-256 後存 D1，30 天滾動、每次
  refresh 輪換）** —— refresh token 不做成 JWT，因為要能撤銷。
- **D7 身分保存靠 Google `sub` claim 對回既有 UUID**，而不是 email（email 會變、`sub` 不會）。
- **D12 bake 期間 Worker 雙模驗證，用 `iss` claim 分流**（`'study-rpg'` → 本地 ES256，其餘 →
  舊的 Supabase JWKS），bake 完才砍掉 Supabase 分支。
- **D16 在 T+0 用 Supabase Auth 後台的「Sign out all users」關掉雙模重放窗口** —— 這條是後來補的，
  它注意到雙模期間舊 token 仍然有效這件事本身是個洞。
- **D9 `delete.ts` 要擴成跨 store 的完整 account lifecycle**（R2 + D1 + account_metadata +
  bug_reports），而不是只清 R2。這條與 auth 無關，**今天仍然是真的**：`export_my_data()` 覆蓋
  範圍比 `delete_my_data()` 窄這個問題到現在還在（見同日
  `study-rpg-2nd/openspec/decisions/2026-08-02-the-only-option-that-turned-out-to-be-two.md`
  的「明確不在本次範圍」）。
- **D11 明確把 apply 卡在另一個 change archive 之後**，寫成 tasks §0 的 HARD gate。這個做法本身
  值得抄。

反過來，重做時**必須重新推導**的：三個 app → 一個；D5 的 D1 編號從 `0011` 起；以及最大的一項——
**在 Supabase 已經承載 community notes 全套的今天，「搬離 Supabase」到底還要不要做、範圍是什麼。**
那已經不是同一個問題了。

## 為什麼是刪掉而不是 commit 進去

commit 它等於在 repo 裡正式化一份**前提與編號都已知錯誤**的 active change，而 `openspec list` 會
一直把它列成待辦。留著不追蹤則是第五次重複「先別碰」——過去四份文件都這樣寫，然後兩個半月過去了。
刪除加上這篇，是唯一讓它停止消耗注意力、同時不丟掉推理的作法。

⚠️ 它是未追蹤檔案，`rm` 之後沒有 git 歷史可回。本文是全部。
