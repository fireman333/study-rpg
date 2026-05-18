# study-rpg — Project Context

> 由 `/spec init` 產生（2026-05-14），預填內容來自 `~/.claude/plans/sharded-baking-lightning.md` 的 grill-me Quick (8 題) + Plan agent 結論。手動維護；OpenSpec config.yaml 會把此檔內容注入每個 artifact 生成的 prompt。

## Purpose

開源「養成型 RPG engine for exam prep」，預設 content pack 為**台灣一階醫師國考**（一階醫師國考，~3505 題 / 10 科 / 9 年）。Engine 與 content / theme 解耦，其他開發者可只 fork content pack 接 TOEFL / 律師考 / 學測等其他考試。

核心 loop：**閱讀累積經驗 → 升等 → 寫考古題 = 打 boss → 抽卡（純行為觸發 gacha，無付費）→ 解鎖**。閉環 spaced-repetition feedback loop 包成 GBA-era 像素 RPG 視覺。

**M_2nd track**（與 M2 並行）：第二份 content/theme dogfood — 二階醫師國考 + 經營型 tycoon idle game mode（招募各科醫師 / 醫院從診所升級到醫學中心）。同一 owner、不同 game mode、共用 core engine。完整 capability spec 見 `openspec/specs/hospital-management-mode/spec.md`。

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
| **M4 — 跨裝置存檔** | Supabase Auth (Google OAuth) + 雲端 sync；IndexedDB 仍 source of truth。一階已 wire（auth module + sync engine + sign-in resolution modals + settings panel with export/delete RPC）；二階 mirror（task 4.6+5.5 in track-m2 worktree）、GH Actions secrets、tests、archive 待完成。詳見 `openspec/changes/add-cloud-sync/`. | 🚧 ~85% |
| **M4.5 — In-app bug report → Supabase** | `bug_reports` table (migration 0004) + RLS + per-app `BugReportModal` (一階 SettingsPanel 新 section / 二階 HelpMenu 9th accordion) + auto-context snapshot (game_state JSONB / route / commit_sha / recent_console_errors ring buffer) + force sign-in gate + per-field opt-out. Owner reads via dashboard SQL today; future `/bug-reports` skill follows. 詳見 `openspec/changes/archive/2026-05-18-add-bug-report-pipeline/` + `docs/BUG_REPORTING.md`. | ✓ shipped (2026-05-18) |
| **M5 — 養成元素加深** | ✓ **模擬考全套**（36 papers / stopwatch / auto-pause / 全展開詳解 / 進步曲線 / boss-tier reward / SRS enqueue）+ ✓ **導師 NPC 每日一題**（Hybrid SRS/weak picker / MentorDialog / 1.5× reward / 跨天 backlog / skip semantics）+ ✓ **宿舍 + cosmetic**（20 cosmetic 5 categories milestone unlock / DormRoute sprite layer overlay / 「?」剪影 locked preview / CosmeticPicker 裝扮間） | ✓ shipped (2026-05-15) |
| M6 — Social light | 朋友 leaderboard（純 read-time / mastery%）+ 公開分享角色卡 OG image | ⏳ |
| M7 (stretch) | 社群 content/theme PR + maintain awesome-study-rpg list + `content-toefl-mini` 50Q demo（external-facing forkability example — 從 M3 降級至此，等真有外部 contributor 才啟動） | ⏳ |

## Development Workflow

### Dual-worktree pattern (2026-05-15 onwards)

M2（一階 medexam-tw）跟 M_2nd（二階 medexam2-hospital-tw）並行開發，用 git worktree 隔離：

| Worktree path | Branch | 用途 |
|---|---|---|
| `~/coding-scratch/study-rpg/` | `main` | 一階 M2 開發；core / theme-pixel-medical / content-medexam-tw / apps/medexam-tw；所有 track 的 merge target |
| `~/coding-scratch/study-rpg-m2/` | `track-m2` | 二階 M_2nd 開發；theme-pixel-hospital / content-medexam2-tw / apps/medexam2-hospital-tw；所有 `add-hospital-*` / `wire-hospital-*` / `*-medexam2-*` / `*-doctor-*` changes 在這跑 |

`.claude/worktrees/<random>/` 是 Claude Code agent 自動建的暫用 worktree（M1 dev 期間用過），ephemeral，merge 完可移除。

### Naming convention（避免 OpenSpec change folder 撞）

- 二階 changes：含 `hospital` / `medexam2` / `doctor` 字眼（例 `add-hospital-mode-scaffold`、`ingest-medexam2-tw-corpus`、`wire-recruitment-gacha`、`add-doctor-sprite-roster`）
- 一階 changes：含 `medexam-tw` 或 generic feature name（例 `expand-content-build-to-all-subjects`、`wire-srs-queue`、`add-gh-pages-deploy`）
- Generic cross-track changes（core engine / deps）允許但 commit message 要標明影響範圍

### Sync protocol

```bash
# 二階 ship 進度回 main (post-archive, 每 1–3 個 changes 同步一次)
cd ~/coding-scratch/study-rpg && git merge track-m2

# 二階 catch up main 變動 (main 有 一階 commit 時)
cd ~/coding-scratch/study-rpg-m2 && git merge main
```

Merge 衝突最常見點：`openspec/project.md` Roadmap row（M2 vs M_2nd 同檔不同行）+ root `package.json` scripts。Merge 完兩 worktree 各自 `pnpm install` 對齊 lockfile。

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
