## Context

上一個 change `add-doctor-rename` 已 ship rename / restore-default service。本 change 接著做 tier-aware default title，把醫院職階對映到 rarity tier。

當前 default name template 寫死在三處：
- [packages/content-medexam2-tw/src/recruitment.ts](packages/content-medexam2-tw/src/recruitment.ts) — `RARITY_LABELS` 跟 `RARITY_POWER_MULTIPLIER` 已分 tier，但 title 沒分
- [apps/medexam2-hospital-tw/src/services/recruitment.ts:75](apps/medexam2-hospital-tw/src/services/recruitment.ts:75) — `${subject.displayName} 醫師 #${seq}`
- [apps/medexam2-hospital-tw/src/services/starter-pull.ts:43](apps/medexam2-hospital-tw/src/services/starter-pull.ts:43) — same
- [apps/medexam2-hospital-tw/src/services/rename-doctor.ts](apps/medexam2-hospital-tw/src/services/rename-doctor.ts) `restoreDefaultDoctorName` — 重組樣板

`DoctorRow.rarity` 在所有醫師 row 都存在（schema v1 起），所以 rarity-based lookup 純為 read，無 schema 變動。

## Goals / Non-Goals

**Goals:**

- 招募 / starter pull 時，doctor.name 預設依 rarity 套階梯 title：P1=大P / P2=主任 / P3=Young V / P4=R / P5=爛Clerk
- Roster `還原預設名` 行為跟著對齊（讀 doctor.rarity → 查 mapping）
- Mapping 集中在 `@study-rpg/content-medexam2-tw` 為單一 source of truth，避免兩個 service 散落
- 既有玩家資料不被靜默改名

**Non-Goals:**

- ❌ Migrate 既有玩家醫師 row（自動覆寫已存在的 `name`）
- ❌ 對既有醫師顯示「升級到新 title」UI 提示 — 玩家想換就自己按還原預設名
- ❌ 動 rarity 名次本身（夯/頂級/人上人/NPC/拉完了 不變，那是 RARITY_LABELS 的工作）
- ❌ 動 sprite key、powerMultiplier、招募賠率（純文字 title 改動）
- ❌ 動 fork-friendly 性（content pack 仍可被其他 exam 改寫，title mapping 改自己內容包就好）

## Decisions

### D1：title mapping 放在 content pack 還是 app 層？

**選項**:
- A）放 `@study-rpg/content-medexam2-tw/recruitment.ts` — 跟 `RARITY_LABELS` / `RARITY_POWER_MULTIPLIER` 同檔
- B）放 `apps/medexam2-hospital-tw/src/lib/` 內部 helper
- C）放 `@study-rpg/core` 共用

**決定**: A

**理由**:
- A 跟其他 rarity-related const 同檔，新加 fork（TOEFL / 律師考）能整檔改寫；保留 fork-friendly
- B 把醫院領域邏輯偷渡到 app，違反 content/app 分層
- C 不適合 — 醫院職階是 medexam2-tw 限定領域，TOEFL 沒 R / Young V 概念

### D2：既有玩家 doctor 資料是否 migrate？

**選項**:
- A）寫一次性 Dexie migration，把所有 doctor row 的 `name` 從 `<科> 醫師 #<seq>` 改成 `<科> <new_title> #<seq>`
- B）不 migrate，保留原名；新招募 / 玩家手動 restore default 才套新 title

**決定**: B

**理由**:
- A 違反「玩家熟悉的角色名不靜默改寫」原則（doctor 是養成 RPG 核心情感對象）
- A 還要處理「玩家已自定名」的 edge case — 自定名要保留 vs 也覆寫？多餘複雜
- B 自然衰減 — 新招募會用新 title、玩家想統一風格自己按 restore default、cloud sync 不會撞 LWW race
- Trade-off: 短期內名冊會混合「醫師 / 大P / Young V」三類字樣（看 doctor 創建時間決定），可接受

### D3：mapping 用 `Record<Rarity, string>` 還是 function？

**選項**:
- A）`Record<Rarity, string>` const lookup
- B）`getDefaultDoctorTitle(rarity: Rarity): string` function

**決定**: A

**理由**:
- A 跟既有 `RARITY_LABELS` / `RARITY_POWER_MULTIPLIER` 形式一致，pattern parity
- A 容易在 spec 範例直接列 mapping table，可讀性高
- B 沒帶來抽象價值（沒 fallback / 沒 lazy 計算）

### D4：`restoreDefaultDoctorName` service signature 是否要改？

**選項**:
- A）讀 doctor row 內 `rarity`（已存在），lookup mapping 直接組樣板，不改 public signature
- B）新增 `rarityTitleOverride?` 參數讓 fork 可覆寫

**決定**: A（不擴 signature；fork 想改 mapping 改 content pack）

**理由**:
- doctor row 已有 rarity，service 自己 lookup 無 plumbing 成本
- fork 友善已透過 D1 解決（換 content pack 即覆蓋 mapping）
- 跟既有 `displayNameOverride?` 同列入 service 變更 docstring，避免擴張 surface

### D5：mapping 字串的英文 / 中文混用是否要規範？

**選項**:
- A）保留使用者指定的字面值：`大P` / `主任` / `Senior V` / `Young V` / `R` — 中英混用
- B）統一全中文：`大P / 主任 / 高年主治 / 年輕主治 / 住院醫師`
- C）統一全英文：`Big-P / Director / Senior-V / Young-V / R`

**決定**: A（保留使用者原版）

**理由**:
- 台灣醫院內部口語就是中英混用（`R3` 比「三年住院」常見、`Young V` 比「高年主治」流行）
- 使用者明示指定這 5 個字串，是 dogfood 玩家自己的偏好
- Fork 可覆寫，無 universal correctness 包袱

## Risks / Trade-offs

- **[名冊 visual 混亂期]**：玩家有「醫師」+「大P」+「Young V」三種風格的醫師共存。Mitigation: 接受短期混雜；玩家在意可手動 restore；未來如要解決可加「全部 restore default」批次按鈕（不在本 change 範圍）
- **[seq 計算不變但 title 改變]**：玩家點 restore default 時，seq 算法仍走「同 subject 內 obtainedAt 排序」，title 變了但編號不變。沒問題，但 user 可能困惑「為什麼 #2 變 #1」？實際上 seq 只跟現有 same-subject 醫師排序有關，跟 title 無關。Mitigation: design.md 紀錄、tasks.md verify 階段確認行為
- **[長度超 20]**：手動算最長例 `耳鼻喉科 Senior V #99` = 16 字元，OK；最短 `內科 R #1` = 7 字元，OK。所有 14 科 × 5 tier 都在 20 字元 max length 內
- **[Test data 上次留下三張 doctor 是「醫師」字樣]**：本 change 不 migrate，所以那三張會保留「外科 醫師 #1」「內科 醫師 #1」字樣直到玩家手動 restore；新招募才會看到「大P / Senior V / R」
- **[Fork 影響]**：未來其他 content pack（TOEFL）必須自己 export `DEFAULT_DOCTOR_TITLE_BY_RARITY`；如果只 import 部分 const 漏了 title mapping，TypeScript 會在 app 內 lookup 時 type error。Mitigation: app 內 import 時加 fallback `?? '醫師'` 並 emit warning，或 spec 強制 content pack 必 export。本 change 採前者，content-pack-contract 不動

## Migration Plan

- 無 Dexie migration
- 無 cloud sync schema 變動
- Rollback：把 `DEFAULT_DOCTOR_TITLE_BY_RARITY` 改回單一 `醫師` 值（或刪除 export、service 改回 hardcode `醫師`）即可
- 既有玩家：被動 — 新招募套新 title，舊 row 保留原名
- 一階 medexam-tw：完全不受影響（沒醫師 entity）

## Open Questions

- **是否同時更新 `RARITY_LABELS` 字樣？** 不。RARITY_LABELS（夯/頂級/人上人/NPC/拉完了）是「程度分級語氣」，跟階梯職稱是兩個正交軸。卡片同時顯示「P1 夯 · 大P」是想要的效果
- **要不要加「全部還原預設名」批次按鈕？** 不在本 change；如果 dogfood 後玩家想要可開 follow-up
