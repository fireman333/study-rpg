## Context

study-rpg M1 已 ship（19 commits / 13 specs locked）。M3 roadmap 預期 dogfood fork flow 用 minimal TOEFL demo。Owner 的真實 fork target 不是 TOEFL — 是台灣**二階醫師國考**（醫學三–六 14 科 ~12,160 題，2026 下半年要考），且想換 game mode：從一階的「學生養成 RPG」改成「**院長經營型 tycoon idle + 招募各科醫師抽卡**」。

2026-05-15 在 `~/claude_domain/vibe-coding/2nd-study-rpg/` cwd 跑 `grill quick software-project pack` 6 題，釐清了 game mode 的 5 個 facet（progression / 答題耦合 / 醫師卡功能 / rarity 軸 / 視覺）+ 一個追問（親密度形態）。本 change 把 grill 結論 lock 成 `hospital-management-mode` capability 的高層 contract（不 lock 具體 numbers / formula — 那是 wire-* changes 的事）。

題庫資料現成可用：`~/Desktop/國考/二階國考/二階國考_拆分/` 14 科 12,160 題（醫學三–六），YAML frontmatter + Markdown 結構，LLM 詳解生成中（部分完成）。Ingestion 拆獨立 change `ingest-medexam2-tw-corpus`，本 change 不碰資料。

## Goals / Non-Goals

**Goals:**

- 證明 content pack contract 可承載第二份 content pack（schema-level dogfood）
- 證明 theme pack contract 可承載第二份 theme（fork from `theme-pixel-medical`、改色 + 換 sprite roster）
- 建立 `hospital-management-mode` capability — 經營型 game mode 的**高層** contract（game loop shape、progression 軸、rarity 軸性質、視覺風格）
- 把 grill quick 6 題 + Q5 追問 的設計決策 lock 成 Decision 1–7，防止下次設計討論時遺忘 / 漂移
- Monorepo 兩 app 同時 typecheck-clean、互不打架

**Non-Goals:**

- 不實作 tycoon tick engine — 拆 `wire-hospital-tycoon-engine`
- 不 ingest 12,160 二階題 — 拆 `ingest-medexam2-tw-corpus`
- 不畫 doctor sprite — 拆 `add-doctor-sprite-roster`
- 不做抽卡 UI / 機率公式 — 拆 `wire-recruitment-gacha`
- 不定 reputation formula / 升級門檻 — 拆 `wire-hospital-reputation` / `wire-clinic-level-up`
- 不上 GH Pages — 拆 `add-medexam2-gh-pages-deploy`
- 不取代一階 `apps/medexam-tw/` — 一階繼續 dogfood、二階是 parallel app
- 不 lock 二階 content pack license — 在 ingest change 階段 lock

## Decisions

### Decision 1: 同 monorepo 加 packages、不 fork 獨立 repo

**選擇**：在 `~/coding-scratch/study-rpg/` 內加 `packages/{content-medexam2-tw, theme-pixel-hospital}` + `apps/medexam2-hospital-tw/`。
**理由**：M1 已 lock content/theme pack contract、core engine 鎖死，second pack + theme + app 是**契約 dogfood**最自然的 setup。Fork 獨立 repo 會分裂 engine 升級同步成本（pre-npm publish 階段沒有 versioning 機制）。Workspace dep `@study-rpg/core@workspace:*` 直接吃同 commit 的 core，零 sync 成本。
**Alternative**：Fork 出獨立 `2nd-study-rpg` repo，引入 `@study-rpg/core` 為 npm dep。被否決 — M3 npm publish 尚未做，且 dogfood 兩個 app 在同一個 PR 環境讀 diff 更直觀。M3 後再考慮拆出。

### Decision 2: Progression 軸 = 醫院規模 + 評鑑分數（tycoon style）

**選擇**：玩家「變強」的主感是醫院從**診所 → 區域醫院 → 醫學中心**三階段視覺升級 + 評鑑分數累積。
**理由**：grill Q1 confirm「醫院規模 / 聲望」。Tycoon 視覺升級 + 評鑑分數是 management 遊戲類型最直觀的 progression、跟一階「玩家等級 + 4 屬性」軸明確區隔，避免兩 app 玩起來「一樣只是換皮」。
**Alternative**：科別齊全度（圖鑑式 collection-driven）、boss 通關制、純月收益。三者皆否決 — 對「經營」主題太薄 / 跟 collection 機制易混淆 / 缺視覺成長感。
**Open**：每階段升級的 reputation 門檻 / room slot 增量 — 留給 `wire-clinic-level-up`。

### Decision 3: 答題耦合 = 親密度（解鎖門檻型，binary gate）

**選擇**：每科累積答對 N 題後**解鎖該科招募 banner**（binary gate）。未達標 = 該科抽不到（UI block + 提示「再答對 X 題解鎖」）。達標後該科 banner 開放，後續答題不再額外加成抽卡機率。
**理由**：grill Q5 confirm「解鎖門檻型」。Binary gate 設計最單純、玩家心智清晰（一條進度條 + 一個明確 milestone）、實作成本低。連續值 weight 加成型（親密度高 → P1 機率高）較複雜，玩家難以感知遞增邊際效益。
**Open**：N 值（每科答對幾題解鎖）— 在 `ingest-medexam2-tw-corpus` 拿到各科題數後決定（先用「該科題數 5%」做基線、跑 dogfood 再 fine-tune）。

### Decision 4: 醫師卡 = active tycoon idle 單位

**選擇**：每位招募到的醫師佔一個 hospital room（outpatient / surgery / ward），自動接病人賺月收益 + 貢獻評鑑分。玩家**不**需要操作戰鬥；idle 機制讓玩家離線 / 答題期間仍持續產出。
**理由**：grill Q3 confirm「active 處理病人 (tycoon idle)」。Theme Hospital / Two Point Hospital 經典玩法，理論深度足、idle 機制讓「不玩也賺」舒服。Battle 系統會跟一階 boss 機制 overlap、純收藏 / 純加成型動機薄弱。
**Open**：room throughput 公式（base × power × facility）、上限、不同 room type 的特殊規則 — 留給 `wire-hospital-tycoon-engine`。

### Decision 5: P1–P5 rarity = 純能力軸（power only）

**選擇**：醫師 rarity 用「夯到拉」5 階（P1 夯 / P2 頂級 / P3 人上人 / P4 NPC / P5 拉完了，per `~/.claude/imports/priority_levels.md`），純對應 `powerMultiplier`（P1 = 5.0、P5 = 0.5、monotonic）。不在 rarity 上疊 flavor / story / 抽中率分佈軸 — 那些都是**獨立的、orthogonal 設計層**。
**理由**：grill Q4 confirm「能力軸（純 power）」。簡單、玩家對 stat 差異感受直接（FGO / Honkai 主流），實作為單一 float 即可。Flavor / lore 是 P1 / P2 高階卡的「額外設計層」（可選擇性給 P1 卡 named character + lore），但 rarity 本身只 reflect 能力。
**Open**：抽中率分佈（每階 weight）、保底機制 — 留給 `wire-recruitment-gacha` 改 reuse `core/lib/loot.ts` 既有 30/100 保底（rename N/R/SR/SSR/UR → P5/P4/P3/P2/P1）。

### Decision 6: 視覺 = GBA pixel（fork theme-pixel-medical）

**選擇**：`theme-pixel-hospital` 直接 fork `theme-pixel-medical` 結構、換色 + 重新繪 14 科醫師 sprite + 醫院場景（診所 / 區域 / 醫學中心三階段建築外觀 + 診間 grid 內部 layout）。沿用 GBA-era 16-color palette + pixel sprite scale。
**理由**：grill Q6 confirm「保 GBA pixel」。跟一階 visual 連續、AI 生圖 batch 量小（fork 一階既有 25 sprites + 加新 hospital scenes，比從 0 起步 Theme Hospital sim 風省美術成本 5–10x）、玩家從一階轉到二階沒有風格斷裂感（兩 app 都可在 owner 同一台機器跑而無視覺違和）。
**Alternative**：Theme Hospital / Two Point Hospital 俯視 isometric sim 風（被否決 — 美術成本爆 + 跟一階斷裂）、anime portrait 抽卡風（被否決 — 跟一階斷裂、卡牌風跟 tycoon 經營體驗錯位）、Pixel sim + 立繪 hybrid（被否決 — 兩 art pipeline 並行成本）。
**Open**：每科醫師 sprite roster（14 科 × P1–P5 = 70 種變化）— 留給 `add-doctor-sprite-roster`。本 change scaffold 階段先放 1–2 個 placeholder sprite。

### Decision 7: 二階 content pack license — defer

**選擇**：本 change 的 `packages/content-medexam2-tw/LICENSE.md` 寫 `TBD-after-ingest`（content 是 LLM 生成詳解、user 自家素材，跟一階 CC-BY-NC-4.0 © 陽明小組不同）。在 `ingest-medexam2-tw-corpus` change 階段 lock final license（候選：CC-BY 4.0 / CC0 1.0 / proprietary）。
**理由**：scaffold 階段不影響 license 選擇；license 決定影響 ingest change 的 acceptance gate（要不要 attribution 卡底、要不要禁止商用），所以放 ingest 階段一起決。
**Open**：final license — 由 user 在 ingest change 階段決。

## Risks / Trade-offs

- **[Risk] monorepo 兩 app 並行 build time 變長** → Mitigation: 每 app 的 build 都 filter（`pnpm --filter @study-rpg/medexam-tw build`），CI 用 turbo / nx cache 由 M_2nd 後期決定。Scaffold 階段 build 量極小，無感。
- **[Risk] core engine 還沒發 npm，下游 fork 仍要 clone monorepo** → 接受。本 change 不解；M3 階段 npm publish 後 second app 可選擇換成 `^0.1.0` semver dep（or 留 workspace dep）。
- **[Risk] 設計 lock 後跑起來才發現「親密度 binary gate」無聊** → Mitigation: capability spec 第 1 版只 lock loop shape + Decision 性質（不 lock 具體 N 值 / formula）。Decision 是「方向確定」、細節留 wire-* change 期間 dogfood 調整。Binary gate 改連續值 weight 加成型 = 寫獨立 spec 變更 change，不算 breaking。
- **[Risk] 二階詳解 LLM 生成尚未完成、ingest 時部分題目缺詳解** → Mitigation: `ingest-medexam2-tw-corpus` 階段定 fallback UI（顯示「詳解生成中」），本 change 不解。
- **[Risk] 同 monorepo 開兩個 app，commit history / branch 容易混亂** → Mitigation: 每個 change 名稱明確標 `medexam-tw` 或 `medexam2` / `hospital` 字眼（per 既有命名慣例：`add-hospital-mode-scaffold`, `wire-hospital-tycoon-engine`, ...）；不同 app 的 wire-* change 互不影響。
- **[Trade-off] M3 「@study-rpg/core npm publish」延後**：dogfood 第二 app 用 same-monorepo workspace dep（`@study-rpg/core@workspace:*`），不走 npm。優勢 = 開發週期短、劣勢 = engine 升級兩 app 同步要小心 break。M3 publish 後可換成 semver dep。
- **[Trade-off] 兩個 app 的 dogfood 同時推進，owner 注意力分配 risk**：M_2nd 是「並行 track」、不是「打斷 M2」。M2 一階全科開放仍是當前主推進；M_2nd scaffold 結束後 wire-* changes 視 M2 dogfood 進度 interleave。

## Migration Plan

不適用 — 純新增、無 schema 變動、無玩家存檔影響。一階 `apps/medexam-tw/` 的 IndexedDB schema、save format、URL routing 完全不動。
