# study-rpg — Project Context

> 由 `/spec init` 產生（2026-05-14），預填內容來自 `~/.claude/plans/sharded-baking-lightning.md` 的 grill-me Quick (8 題) + Plan agent 結論。手動維護；OpenSpec config.yaml 會把此檔內容注入每個 artifact 生成的 prompt。

## Purpose

開源「養成型 RPG engine for exam prep」，預設 content pack 為**台灣一階醫師國考**（一階醫師國考，~3505 題 / 10 科 / 9 年）。Engine 與 content / theme 解耦，其他開發者可只 fork content pack 接 TOEFL / 律師考 / 學測等其他考試。

核心 loop：**閱讀累積經驗 → 升等 → 寫考古題 = 打 boss → 抽卡（純行為觸發 gacha，無付費）→ 解鎖**。閉環 spaced-repetition feedback loop 包成 GBA-era 像素 RPG 視覺。

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
- **Monorepo**: pnpm workspaces — `packages/core/`、`packages/theme-pixel-medical/`、`packages/content-medexam-tw/`、`apps/medexam-tw/`
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
| **M1（MVP）** | ✓ 藥理學 vertical slice + ✓ 1 boss + ✓ 4 屬性 + ✓ loot + ✓ IndexedDB 存檔 + ✓ GH Pages workflow（首次 push 後 live） | ✓ 待 first deploy |
| M2 — 全科開放 | ✓ 10 科全解（3291/3600 imported, 309 上游 OCR 缺欄位 skip）+ skill tree UI + ✓ 4 屬性全部 wired（公式 fine-tune 待 dogfood）+ daily streak + ✓ SRS due queue + 附圖題處理（placeholder banner 已上） | 🚧 進行中 |
| M3 — 公開 API + 範例 fork | `@study-rpg/core` 發 npm（0.1.x）+ `docs/CONTENT_SCHEMA.md` / `THEME_API.md` 完整 + minimal `content-toefl-mini` 50Q demo | ⏳ |
| M4 — 跨裝置存檔 | Supabase Auth (Google OAuth) + 雲端 sync；IndexedDB 仍 source of truth | ⏳ |
| M5 — 養成元素加深 | 宿舍場景 + cosmetic unlock + 導師 NPC 每日一題 + 模擬考全套（80Q / 計時 / 出歷年百分位） | ⏳ |
| M6 — Social light | 朋友 leaderboard（純 read-time / mastery%）+ 公開分享角色卡 OG image | ⏳ |
| M7 (stretch) | 社群 content/theme PR + maintain awesome-study-rpg list | ⏳ |

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
