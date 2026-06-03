# study-rpg — Project Context

> 由 `/spec init` 產生（2026-05-14），預填內容來自 `~/.claude/plans/sharded-baking-lightning.md` 的 grill-me Quick (8 題) + Plan agent 結論。手動維護；OpenSpec config.yaml 會把此檔內容注入每個 artifact 生成的 prompt。

## Purpose

開源「養成型 RPG engine for exam prep」，預設 content pack 為**台灣一階醫師國考**（一階醫師國考，~3505 題 / 10 科 / 9 年）。Engine 與 content / theme 解耦，其他開發者可只 fork content pack 接 TOEFL / 律師考 / 學測等其他考試。

核心 loop：**閱讀累積經驗 → 升等 → 寫考古題 = 打 boss → 抽卡（純行為觸發 gacha，無付費）→ 解鎖**。閉環 spaced-repetition feedback loop 包成 GBA-era 像素 RPG 視覺。

**M_2nd track**（與 M2 並行）：第二份 content/theme dogfood — 二階醫師國考 + 經營型 tycoon idle game mode（招募各科醫師 / 醫院從診所升級到醫學中心）。同一 owner、不同 game mode、共用 core engine。完整 capability spec 見 `openspec/specs/hospital-management-mode/spec.md`。

**M_3rd track**（與 M2 / M_2nd 並行；2026-05-25 起步）：第三份 dogfood — 神經元主題（Long-term potentiation / Hebbian）reskin of 一階國考。複用全部 ~3505 題題庫 / 答案 / 詳解，但把主題敘事換成「neurons that fire together, wire together」收集養成。主視覺 = Linnean phylogenetic taxonomy tree（4 NT 分支 × N family × P1–P5 variant），跨 family 共同 firing 在連線層長出 synapse。配合此 track 開始，**`apps/medexam-tw` 進入 maintenance mode**（不接新 feature；critical bug fix 仍照 L1 hotfix workflow 收）。完整 capability spec 見 `openspec/specs/neurons-mode/spec.md`（lands after `add-neurons-mode-scaffold` archives）。

## Target Users

- **主要**：台灣一階醫師國考考生（醫五 / 醫六 / RA / 重考生），數千級潛在受眾
- **次要**：fork engine 做其他考試（學測 / 律師考 / TOEFL / 護理師 ...）的開發者
- **第三**：作者本人（dogfood — 自己是醫五，2026 下半年用此 app 準備一階）

## Stack & Constraints

- **Bundler / Framework**: Vite 5 + React 18 + TypeScript（純 CSR SPA）
- **Routing**: react-router v6
- **Storage**: IndexedDB via Dexie.js（client-side only，零後端）
- **Styling**: vanilla CSS + CSS variables（沿用 KlaudeHealthEducation 風格），**不**用 Tailwind / shadcn
- **動畫**: Framer Motion
- **題庫 ingestion**: build-time `scripts/build.ts` 把 .md → `questions.json`
- **Deploy**: GitHub Pages + Actions（單 URL share，零配額焦慮）
- **Monorepo**: pnpm workspaces — `packages/core/`、`packages/theme-pixel-medical/`、`packages/theme-pixel-hospital/`（二階 scaffold）、`packages/content-medexam-tw/`、`packages/content-medexam2-tw/`（二階 scaffold）、`apps/medexam-tw/`、`apps/medexam2-hospital-tw/`（二階 scaffold）
- **License**: engine + theme = AGPL-3.0；default content pack = CC-BY-NC-4.0（詳解 © 陽明國考考古題小組）
- **作者背景約束**: 非 CS 背景醫學生，Claude Code vibe-coding；新 dependency 要 vibe-coding-friendly（避免 Next.js SSR/RSC 過度抽象、避免學新 Tailwind utility）

## Non-Functional Requirements

- **效能**: 首屏 < 3s（GitHub Pages CDN + 1–2 MB gzipped questions.json）；抽卡動畫 60fps；reading timer 不可漏 tick
- **離線**: 完全 client-side，首次 load 後 IndexedDB 持久化；不需要網路也能玩
- **跨平台**: 桌機（≥ 1024px viewport）+ 平板（768–1023px 等比例縮放）+ 手機（< 768px 單欄重排）；不上 native iOS / Android（規避 App Store gacha 規範）
- **資料規模**: MVP 藥理 418 題；全科開放後 ~3505 題（單檔 ~750 KB gzip 後 ~250 KB）
- **維護期限**: 至少 1+ 年（作者畢業後接手者 = 學弟妹 + 開源社群 contributor）
- **可訪問**: CJK 像素字 fallback 到 Noto Sans TC（長題幹 pixel 字累人）；font-display: swap 不卡白屏

## Failure Modes & Constraints

- **誠信防護**: reading timer 必須抓 `visibilitychange` + idle > 90s 自動 pause；timer 不可手動編輯；每分鐘最多 +1 屬性（防刷）
- **No Silent Errors**: build script 必印 imported / skipped / total 三個數字（避免 71736 silent skip 案例）
- **題庫 schema 變化**: 加 normalization helper，未知 enum 值 `raise` 不 fall through
- **Loot 不平衡**: telemetry 紀錄每次 roll，dogfood 一週後依分佈微調權重；保底機制必做（30 rolls 必 SR、100 rolls 必 SSR）
- **版權投訴**: 24h takedown SLA — `CREDITS.md` + 每題卡底 inline source 連結；陽明小組可開 Issue 觸發
- **題目附圖缺失**: YAML 有 `hasImage` 但圖不在 .md（196/418 題受影響）；MVP 顯示「[圖]」placeholder，M2 解
- **跨裝置存檔**: MVP 不解；提供 export/import JSON；M4 才接 Supabase
- **神經學 fact 嚴謹度（M_3rd / neurons-tw）**: 設計過程涉及神經解剖學 / 神經生理學的決定（neuron family → NT branch / 解剖位置 / 機制描述 / spec scenario 中的 mechanism 文字 / UI 文案中的神經學 metaphor）一律先走 `/oe`（OpenEvidence）查 PubMed-anchored 證據再 lock，**不憑記憶或泛用 LLM 知識決定**。Persona 視覺 / 故事 hook 可自由創作；neuron 本身的科學 fact 必須嚴謹（per `wire-neurons-content-and-theme` design.md Decision 1 既有原則）。Game-loop 數值平衡（N、decay 天數、AP threshold ladder）不適用本規則 — 那是 game design 直覺 + dogfood telemetry。詳細 rationale 見 project root `CLAUDE.md` 同名 section

## Out of Scope

- ❌ Native iOS / Android app（規避 App Store 機率公開規範）
- ❌ 內購 / 真實貨幣 gacha（純行為觸發）
- ❌ 多人連線 / PVP / 即時對戰（純單人養成）
- ❌ 後端 LLM 評分 / dynamic AI 出題（題庫純靜態歷年考古）
- ❌ 醫學以外的 hard-coded 內容（醫學是 content pack 之一，不是 engine 寫死）
- ❌ 學分認證 / 學校系統整合（個人 side project，不是教學工具）

## Roadmap

| Milestone | 範圍 | 狀態 |
|---|---|---|
| **M1（MVP）** | ✓ 藥理學 vertical slice + ✓ 1 boss + ✓ 4 屬性 + ✓ loot + ✓ IndexedDB 存檔 + ✓ GH Pages workflow（首次 push 後 live） | ✓ shipped (2026-05-15) |
| M2 — 全科開放 | ✓ 10 科全解（3291/3600 imported, 309 上游 OCR 缺欄位 skip）+ ✓ skill tree UI + ✓ 4 屬性全部 wired（公式 fine-tune 仍待 dogfood telemetry）+ ✓ daily streak（🔥 chip + 1+0.05·min(s,10) multiplier + break-day soft toast）+ ✓ SRS due queue + ✓ 附圖題 placeholder banner | ✓ shipped (2026-05-15) |
| **M_2nd — 二階國考經營 RPG**（與 M2 並行 dogfood-the-fork track） | ✓ scaffold（3 packages + 1 app）+ ✓ 二階題庫 ingest（6066 Q / 14 科）+ ✓ recruitment gacha + ✓ tycoon engine + ✓ reputation formula + ✓ 三階段升級 + ✓ doctor sprite roster + ✓ subpath co-location deploy（live at `/study-rpg/hospital/`）。詳見 `openspec/specs/hospital-management-mode/spec.md` + 8 個 archived changes。M3 npm publish 是兩 track 合流點。 | ✓ shipped (2026-05-15) |
| M3 — 公開 API + dogfood fork validation | ✓ `@study-rpg/core@0.1.0` + `@0.2.0` 發 npm (2026-05-16) + ✓ `docs/CONTENT_SCHEMA.md` / `THEME_API.md` 完整 + ✓ migrate-m2nd-to-published-core（二階 fork `workspace:*` → `^0.2.0` 真實 consume published pkg） | ✓ shipped (2026-05-16) |
| **M4 — 跨裝置存檔** | Supabase Auth (Google OAuth) + 雲端 sync；IndexedDB 仍 source of truth。一階 + 二階皆已 wire（auth module + sync engine + sign-in resolution modals + settings panel with export/delete RPC + 二階 collection-table adapters: hospital_state / hospital_doctors / hospital_mastery / hospital_question_history）。詳見 `openspec/changes/archive/2026-05-17-add-cloud-sync/`. **Backend migration in-flight** (2026-05-19+, `add-r2-cloud-sync-migration`): data plane moving from Supabase Postgres (500 MB DB cap + 5 GB egress/月) to Cloudflare R2 object storage (10 GB + zero egress) via auth-bridging Worker. Sync unit: per-row LWW → per-bundle blob LWW (3 bundles: m1 / m2 / bookmarks). Supabase Auth + `bug_reports` table stay (latter needs server-side SQL for owner dashboard). Currently dual-write (Supabase + R2), reads still Supabase; full cutover after 14-day bake. | ✓ shipped (2026-05-17); 🔄 backend migrating to R2 |
| **M4.5 — In-app bug report → Supabase** | `bug_reports` table (migration 0004) + RLS + per-app `BugReportModal` (一階 SettingsPanel 新 section / 二階 HelpMenu 9th accordion) + auto-context snapshot (game_state JSONB / route / commit_sha / recent_console_errors ring buffer) + force sign-in gate + per-field opt-out. **+ inline quiz 🐞 entry** (add-quiz-inline-bug-report 2026-05-19) — `QuizBugReportSheet` 在 `QuizModal` 內 4-radio target picker + 單行說明 + `question_id` column (migration 0007) + 3 個新 category enum。Owner reads via dashboard SQL today; future `/bug-reports` skill follows. 詳見 `openspec/changes/archive/2026-05-18-add-bug-report-pipeline/` + `openspec/changes/add-quiz-inline-bug-report/` + `docs/BUG_REPORTING.md`. | ✓ shipped (2026-05-18) + inline 🐞 (2026-05-19) |
| **Domain migration — `med-study-rpg.com`** | Move both apps off `fireman333.github.io/study-rpg/` to the owner's custom Cloudflare domain. 一階 → `https://med-study-rpg.com/1st/`; 二階 → `https://med-study-rpg.com/2nd/`. New Cloudflare Pages deploy alongside existing GH Pages deploy (parallel bake 2–4 週); Worker bound to `api.med-study-rpg.com`; OAuth + Supabase Auth allowlist supports both origins during bake; `DomainMigrationBanner` surfaces on GH Pages with Export-JSON CTA for anonymous users. Bake-end follow-up change flips GH Pages to client-side 301 redirect-only. 詳見 `openspec/changes/add-med-study-rpg-domain-migration/` + `docs/AUTH_REDIRECT_URIS.md`. | 🔄 in-progress (code edits 2026-05-22; CF Pages + Supabase dashboard tasks pending owner) |
| **M_2nd ext — 排名 leaderboard** | Opt-in 全二階對位榜：5 公開欄位（hospital tier / reputation / doctor count / total study min / 2–12 codepoint nickname）。Backend = Cloudflare D1 `study-rpg-leaderboard` + KV `LEADERBOARD_KV` via existing sync Worker（**不**走 Supabase — 避開 R2 cutover + 零 egress 成本），新 module `cloudflare/sync-worker/src/leaderboard.ts` + 5 endpoints + hourly cron `0 * * * *` 預先排序 Top 100 寫 KV。Client 側：Dexie v14 `leaderboardProfile` table + `LeaderboardOptInModal` + `NicknameField`（NFKC + lowercase 撞名檢查） + `LeaderboardPage`（4 filter tabs + my-rank chip）+ HelpMenu 雙 section（doc + settings controls）+ `safeResetAccountData` 接 `deleteLeaderboardMe()`。Push hook 在 sync engine `onPushComplete` 成功 callback（`firstError === null && !anyOffline`）順手 POST upsert。詳見 `openspec/changes/add-hospital-leaderboard/` + `docs/LEADERBOARD.md`. | 🔄 in-progress (Phase 8 smoke + Phase 9 docs + Phase 10 verify 剩 ~15 task) |
| **M5 — 養成元素加深** | ✓ **模擬考全套**（36 papers / stopwatch / auto-pause / 全展開詳解 / 進步曲線 / boss-tier reward / SRS enqueue）+ ✓ **導師 NPC 每日一題**（Hybrid SRS/weak picker / MentorDialog / 1.5× reward / 跨天 backlog / skip semantics）+ ✓ **宿舍 + cosmetic**（20 cosmetic 5 categories milestone unlock / DormRoute sprite layer overlay / 「?」剪影 locked preview / CosmeticPicker 裝扮間） | ✓ shipped (2026-05-15) |
| **M_2nd ext — 成就系統 (achievement-system)** | 7 大類別 (學習 / 答題 / 招募 / 經營 / 時運 / 隱藏 / 科別精通) × 4 tier (P1 鑽石 / P2 金 / P3 銀 / P4 銅) = ~42 條 catalog。Engine = `packages/core/src/lib/achievement.ts` (mirror cosmetic milestone pattern)；catalog = `packages/content-medexam2-tw/src/achievements.ts` (build-time validator rejects pure-grind P1)；Dexie v15 新 `achievements` table，R2-only adapter (mirror `LEADERBOARD_PROFILE` precedent, 不寫 Supabase)；5 處 trigger hook (quiz-rewards / tick / recruitment / fate-card / retire + training)；2 張 atlas asset (badge-atlas 6×4 + subject-atlas 7×2) 走 codex CLI 一次生成；UI = AchievementsPage + AchievementCard + BadgeSprite + AchievementUnlockToast (P2-P4) + AchievementUnlockModal (P1 全屏)；獎勵走 3 channel (leaderboard 勳章 / cosmetic / 稱號)，**不發**裝備 / 抽卡券 / 新 currency；D1 migration 0002 加 `badges_csv` + `subject_mastery_count` 兩 column；LeaderboardPage 在 nickname 旁顯示 inline badges + `🩺 X/14` chip。詳見 `openspec/changes/add-achievement-system/`. | 🔄 code-complete (2026-05-24)；剩 owner manual D1 apply + dual-prod smoke + archive |
| **M_2nd ext — 醫院設備 (hospital-equipment)** | 10 件命名設備 (CT / MRI / 內視鏡 / 達文西 / 心導管室 / PET-CT / LINAC / ECMO / 複合式手術房 / NGS) × 3 級升級階梯，總 L1 buy-all ~24M / 全 L3 ~244M (~6 週 dedicated grind at 國家級 default)。Catalog = `packages/content-medexam2-tw/src/equipment-catalog.ts`；types in `@study-rpg/core`；Dexie v16 新 `hospitalEquipment` table；UI = `EquipmentPanel/Card/Modal` 掛在 Hospital page (responsive grid + collapsible)；sprite 走 `theme-pixel-hospital/sprites/equipment/` (10 個 384×384 16-color PNG via codex CLI)。雙倍率: reputation +1/3/7%、throughput +2/5/12% per level, additive across owned (5 L3 + 5 L1 → 1.40 rep / 1.70 throughput)。Multiplier 接 4 處 (tick throughput / quiz-rewards rep / er-consultation rep / event emergency-shift rep)；不影響 idle AFK reputation (per design D3 — 保留 fate-card cost gate). T4 升級條件加第 3 gate（≥ 3 unique equipment）+ reputation threshold 150k → 300k bump（pair 改 `TIER_UPGRADE_THRESHOLDS.醫學中心`）；既有 T4 玩家 grandfathered (tier monotonicity)。**§1–§8 + §10–§11 已 ship 進 dirty tree (2026-05-24)、§9 R2 sync 等 R2 migration Phase 3 cutover (~2026-05-29) 才動**。詳見 `openspec/changes/add-hospital-equipment-medexam2/`. | 🔄 §1-§8+§10-§11 shipped (2026-05-24)；§9 R2 sync blocks on R2 cutover；剩 owner commit + archive |
| **M_3rd — 神經元主題 reskin (neurons-mode)** | LTP / Hebbian-themed reskin of 一階。Worktree `~/coding-scratch/study-rpg-neurons/` + branch `track-neurons`。`packages/content-neurons-tw/` + `packages/theme-pixel-neurons/` + `apps/neurons-tw/` + umbrella capability `neurons-mode`。資料 100% 獨立於 medexam-tw / medexam2-hospital-tw（各自 Dexie / R2 bundle / streak / leaderboard）。借鏡 二階 4 個 capability 設計 pattern（`recruitment-gacha` / `hospital-mastery` / `hospital-leaderboard` / `achievement-system`）但建立獨立 `neuron-variant-gacha` / `neuron-family-mastery` / `neurons-leaderboard` / `neurons-achievements` capability spec。**Deploy live**：`https://med-study-rpg.com/neurons/`（Cloudflare Pages direct-upload via `pnpm deploy:cf`；Worker presign whitelist 加 `'neurons'` bundle；Supabase Auth allowlist 加 `/neurons/**`）。Capabilities (all shipped 2026-05-25): scaffold / motion-library / wire-neurons-content-and-theme / connectome-collection / wire-neuron-variant-gacha / wire-neuron-family-mastery / generate-neurons-sprites / add-neurons-leaderboard / add-neurons-achievements / generate-neurons-achievement-atlases / add-neurons-deploy. 配合此 track，**medexam-tw 進入 maintenance mode**（no new feature；critical bug fix 仍由 L1 hotfix workflow 接）。 | ✓ shipped (2026-05-25) — 11/11 |
| **M_3rd ext — DMN fate cards (add-neurons-dmn-fate-card)** | 第 12 個 neurons capability：混合觸發 (時間軸 reading-timer + 行為軸 connectome events) 的 fate-card 抽卡系統。Catalog = 20 cards × 4-tier rarity (P1 鑽石 × 2 / P2 金 × 4 / P3 銀 × 6 / P4 銅 × 8) × 5 一次性事件 (family-buff / variant-rate-up / quick-review-batch / streak-shield / hidden-reveal)。Closed-cap Pokédex 蒐集於 `/dmn` route。**R2 bundle schema bump v1 → v2 + reader tolerance**（v1 clients silently drop unknown adapter keys），3 個新 TableAdapter（`dmnCards` LWW / `dmnEventLog` **monotonic-union** mirror everWrong 紀律 / `dmnActiveBuffs` LWW + expired filter）+ 8 個新 meta keys 入 SYNCED_META_KEYS。Dexie v5 → v6 純加 3 table。UI 走獨立 modal + collection page，**不動 connectome SVG**。Sprite ship placeholder；real art 走 follow-up `generate-dmn-card-artworks`。Time-axis 暫時 inactive (waits for `polish-neurons-pre-ship` 接 reading-timer)；behavior axis 完整 wired listening to `connectome.variantSlotUnlocked` / `synapseFormed` / `synapseStrengthened`。27 Vitest tests + Chrome MCP end-to-end smoke 過。詳見 `openspec/changes/add-neurons-dmn-fate-card/`. | 🔄 code-complete + verify green (2026-05-27)；剩 archive + commit + push |
| M6 — Social light | 朋友 leaderboard（純 read-time / mastery%）+ 公開分享角色卡 OG image | ⏳ |
| M7 (stretch) | 社群 content/theme PR + maintain awesome-study-rpg list + `content-toefl-mini` 50Q demo（external-facing forkability example — 從 M3 降級至此，等真有外部 contributor 才啟動） | ⏳ |

## Development Workflow

### Triple-worktree pattern (2026-05-15 dual; 2026-05-25 triple)

M2（一階 medexam-tw）/ M_2nd（二階 medexam2-hospital-tw）/ M_3rd（神經元 neurons-tw）三條 track 並行開發，用 git worktree 隔離：

| Worktree path | Branch | 用途 |
|---|---|---|
| `~/coding-scratch/study-rpg/` | `main` | 一階 M2（maintenance mode；critical bug fix 走 L1 hotfix）；core / theme-pixel-medical / content-medexam-tw / apps/medexam-tw；所有 track 的 merge target |
| `~/coding-scratch/study-rpg-m2/` | `track-m2` | 二階 M_2nd 開發；theme-pixel-hospital / content-medexam2-tw / apps/medexam2-hospital-tw；所有 `add-hospital-*` / `wire-hospital-*` / `*-medexam2-*` / `*-doctor-*` changes 在這跑 |
| `~/coding-scratch/study-rpg-neurons/` | `track-neurons` | 神經元 M_3rd 開發；theme-pixel-neurons / content-neurons-tw / apps/neurons-tw；所有 `*-neurons-*` / `*-connectome-*` changes 在這跑 |

`.claude/worktrees/<random>/` 是 Claude Code agent 自動建的暫用 worktree（M1 dev 期間用過），ephemeral，merge 完可移除。

### Naming convention（避免 OpenSpec change folder 撞）

- 二階 changes：含 `hospital` / `medexam2` / `doctor` 字眼（例 `add-hospital-mode-scaffold`、`ingest-medexam2-tw-corpus`、`wire-recruitment-gacha`、`add-doctor-sprite-roster`）
- 神經元 changes：含 `neurons` / `connectome` 字眼（例 `add-neurons-mode-scaffold`、`wire-neurons-content-and-theme`、`add-connectome-collection`、`wire-neuron-variant-gacha`、`generate-neurons-sprites`）
- 一階 changes：含 `medexam-tw` 或 generic feature name（例 `expand-content-build-to-all-subjects`、`wire-srs-queue`、`add-gh-pages-deploy`）
- Generic cross-track changes（core engine / deps）允許但 commit message 要標明影響範圍

### Sync protocol

```bash
# 二階 ship 進度回 main (post-archive, 每 1–3 個 changes 同步一次)
cd ~/coding-scratch/study-rpg && git merge track-m2

# 神經元 ship 進度回 main (post-archive, 每 1–3 個 changes 同步一次)
cd ~/coding-scratch/study-rpg && git merge track-neurons

# 二階 catch up main 變動 (main 有 一階 / 神經元 commit 時)
cd ~/coding-scratch/study-rpg-m2 && git merge main

# 神經元 catch up main 變動 (main 有 一階 / 二階 commit 時)
cd ~/coding-scratch/study-rpg-neurons && git merge main
```

Merge 衝突最常見點：`openspec/project.md` Roadmap row（三 track 同檔不同行）+ root `package.json` scripts（dev / build / dev:m2 / dev:neurons alias）。Merge 完三 worktree 各自 `pnpm install` 對齊 lockfile。

### Planning home (non-git)

`~/claude_domain/vibe-coding/2nd-study-rpg/` 是 二階 設計筆記資料夾：

- **不在 git repo**、不接 `/spec resume`、不放 code
- 只放 CLAUDE.md（pointer）+ README.md（design overview）
- 任何實際開發一定要 cd 進 worktree

### Git ops policy

- `git commit`：依「Curator rules (hard)」需 explicit user confirmation；template = `spec(archive): merge <change> — <headline>`
- `git merge track-m2`（二階 → main）：destructive caliber、需 confirm、建議 working tree 乾淨時跑
- `git push` / `git reset --hard` / `git push --force`：永遠 confirm；後兩者實質禁用（即使 confirm 也不做，除非顯式 emergency）
- `git worktree remove`：confirm（worktree 內可能有 uncommitted work）

## Bug Triage Workflow（post-launch incoming bug reports）

上線後 bug report 透過 M4.5 in-app pipeline 進到 Supabase `public.bug_reports`。處理紀律：**不要每個 bug 開一條 worktree**。單人 vibe-coding 開太多 parallel worktree 會死在 merge conflict（`openspec/project.md` roadmap / `package.json` / Dexie schema 幾乎每個 fix 都會碰）跟 context switch 上 — parallel worktree 對單人是「假平行真排隊」。

### 三層策略

| Layer | 範圍 | 處理方式 |
|---|---|---|
| **L1 — `hotfix` 常駐 worktree** | P1 夯 / P2 頂級 bug（crash / data loss / 阻擋核心 loop） | 從 main 拉一條 `~/coding-scratch/study-rpg-hotfix/` worktree，sequential 處理：一 bug 一 OpenSpec change → archive → merge 回 main → push → 視情況 cherry-pick 到 `track-m2` |
| **L2 — Batch change** | P3 人上人 / P4 NPC bug（UI 錯字 / 顯示偏移 / 邊角 case） | 同 subsystem 合一個 change（例 `fix-quiz-ui-batch-2026-05-19`），在現有 main / track-m2 worktree 直接做、不另開 worktree |
| **L3 — 新開第三條 worktree** | 真正獨立的長修：預估 ≥ 3 天、要 block 其他 hotfix、subsystem 大改寫（例「重寫 SRS scheduler」「重構 sync engine」） | 才值得多開一條 — default 是不開 |

### Hotfix change naming convention

- 一階 hotfix：`fix-<subsystem>-<symptom>`（例 `fix-srs-due-queue-empty`、`fix-quiz-timer-pause-on-blur`）
- 二階 hotfix：含 `hospital` / `medexam2` / `doctor` 字眼（例 `fix-hospital-gacha-pity-counter`、`fix-doctor-sprite-missing-frame`）
- Batch fix：`fix-<subsystem>-batch-<YYYY-MM-DD>`（例 `fix-quiz-ui-batch-2026-05-19`）
- Cross-track（一階 + 二階都受影響）：先在 main 跑 → merge 回 `track-m2`；commit message 標 `affects: both`

### Triage SOP

1. **每日（或每觸發推播）掃 Supabase `bug_reports`**：依 `severity` + `category` + 重複度排序
2. **P1 / P2 → 立刻進 L1 hotfix worktree**，1–2 hr SLA target；archive 後 merge + push
3. **P3 / P4 → 累積到 batch change**，每週收一次（或累計 ≥ 5 個同 subsystem bug 觸發）
4. **重複回報合一處理**：Supabase 內 mark `status: triaged → in_progress → fixed`（schema 已支援）；不要每個 user submission 都開 change
5. **修完通知**：M5+ 才考慮自動 email / in-app banner，現在手動沒關係

### Hotfix worktree 起手式

```bash
# 第一次設定
git worktree add ~/coding-scratch/study-rpg-hotfix main
cd ~/coding-scratch/study-rpg-hotfix && pnpm install

# 之後每次 hotfix
cd ~/coding-scratch/study-rpg-hotfix
git pull origin main                    # 對齊最新
git checkout -b hotfix/<change-id>      # 可選；OpenSpec change 自己會 isolate
# ... 跑 /opsx:propose → /opsx:apply → /verify → /opsx:archive → commit
git checkout main && git merge hotfix/<change-id>
git push origin main
# 視情況把 commit cherry-pick 到 track-m2
```

### Anti-patterns（已知地雷）

- ❌ **一 bug 一 worktree** — merge conflict 災難（見上方解釋）
- ❌ **在 `track-m2` 改一階 bug** — 二階 worktree 不該碰 `apps/medexam-tw/`，會讓 sync protocol 變混亂
- ❌ **`git merge --squash` 把多個 hotfix 壓成一個 commit** — OpenSpec change history 會失真，archive metadata 對不上
- ❌ **跳過 OpenSpec change，直接 `git commit -m "fix typo"` 推上去** — 即使 typo 也走 batch change；唯一例外是 README / 純 doc typo

## Deploy & Distribution

- **取得方式**: 直接打開 https://fireman333.github.io/study-rpg/（暫定 URL；待 repo 上 GitHub）
- **更新機制**: GitHub Actions 自動 build → push gh-pages branch；無需玩家操作
- **安裝門檻**: 零（瀏覽器即可，無下載、無註冊、無 email）
- **存檔遷移**: IndexedDB 本機保存 + Export/Import JSON button（手動跨裝置）；M4 引入 Supabase cloud sync
- **Fork 友善**: monorepo 設計讓第三方 fork 後可只改 `packages/content-*` 接自己的題庫，不碰 engine

## Key People & Sources

- **Owner / Dogfood user**: 康瑋麟（WLK / @fireman333）— 大六醫學生，2026 下半年要考一階
- **題庫 source**: 中華民國考選部歷屆考題（公資源）+ 陽明國考考古題小組 詳解（https://sites.google.com/view/ymmedexam/ans, CC-BY-NC）
- **Reference repos**（按子系統 study）: skola (Dexie scaffold) / fortuna (gacha core) / react-roguelike (pixel rendering) / IdleLands (rarity tier) / genshin-wishes-ui (pity UX) / markdown-quiz-bank (schema port)
- **No-wheels score**: 82/100 🟢 build（Penpeer 醫師國考題庫 app 死 3 年；Habitica / LifeUp 沒醫學內容；GitHub 沒人融合三者）
- **Master plan**: `~/.claude/plans/sharded-baking-lightning.md`（grill-me Quick 8 題 + Plan agent + 4 輪 user 釐清結論）
