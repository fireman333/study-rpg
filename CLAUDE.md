# study-rpg — Project Instructions

> Project-level Claude Code memory. Loaded by every session in this repo (and overrides global `~/.claude/CLAUDE.md` where they conflict).

<!-- BEGIN: spec skill (OpenSpec wrapper) — managed block, edit between markers OK -->
## OpenSpec Workflow（本專案）

@openspec/project.md

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for spec-driven development. Lifecycle gates are wrapped by the global `spec` skill (`~/.claude/skills/spec/`). Above `@openspec/project.md` import pulls the project-level context（tech stack、roadmap、out-of-scope）automatically into every session — avoids re-loading via `/spec resume`.

### Retreat rules

If any of the following are detected, **stop OpenSpec workflow immediately** and route to the correct skill:

- `research_plan.json` present in this dir → use `research-plan` skill instead
- `01_protocol/` + `09_qa/` present → use `ma-end-to-end` skill instead

These exist because OpenSpec is wrong tool for statistical analyses and meta-analyses (those have their own structured workflows).

### Recommended pipeline

For non-trivial changes, prefer this order over ad-hoc edits:

```
/opsx:propose <change>      # write proposal.md / design.md / tasks.md
/opsx:apply                 # implement per tasks.md
/simplify                   # code-quality review (global skill)
/opsx:verify                # OpenSpec 3-dim check (completeness / correctness / coherence)
/verify                     # end-to-end check (global skill, e.g. Chrome MCP for web apps)
/opsx:archive               # merge delta into main specs (slash workflow has sync gate)
auto-git commit             # only after archive — see auto-git skill rules
```

**Skip steps only when**:
- Trivial typo / one-line fix → just edit, no propose
- User explicitly says "skip verify" / "just commit"

### Dual-worktree development (M_2nd parallel track)

M2（一階）+ M_2nd（二階 hospital mode）並行用 git worktree 隔離。完整 workflow / naming convention / sync protocol / git ops policy 詳見 `openspec/project.md` § Development Workflow。

- **一階 session**: `cd ~/coding-scratch/study-rpg` (main branch)
- **二階 session**: `cd ~/coding-scratch/study-rpg-m2` (track-m2 branch)
- **Merge 二階 → main**: `cd ~/coding-scratch/study-rpg && git merge track-m2` (post-archive; needs explicit confirm)

### Curator rules (hard)

- **Never** `git commit` without explicit user confirmation
- **Never** auto-write spec content — every requirement / scenario needs user-confirmed wording
- **Never** run `openspec archive --yes` raw CLI — always use `/opsx:archive` slash. (Rationale, corrected 2026-07-07: NOT because the raw CLI skips the sync — it does sync — but because its `MODIFIED` is a **wholesale block replacement**, so a partial-restatement delta silently drops un-restated scenarios and `validate` won't catch it; the slash's agent-driven sync handles partial deltas + adds a human review gate. If raw CLI is ever used, it's safe only for a confirmed full-restatement delta plus a scenario-level `git diff` check.)
- Engine API surface (`packages/core/src/types.ts`) is the third-party fork contract; breaking changes need a CHANGELOG entry
- `packages/core/` stays content-agnostic — medical terms belong in theme / content packs, never in core

### 互動語言（繁體中文預設）

執行任何 OpenSpec workflow（`/opsx:*` 或 `openspec-*` skill：propose / apply / explore / onboard / continue / verify / archive）時，**所有對使用者的 clarifying question、AskUserQuestion 選項與說明、確認提示一律用繁體中文**。OpenSpec command template 是英文，模型容易被帶著用英文問 — 本專案明確覆寫為繁中互動（對齊使用者全域偏好）。

保留英文：醫學名詞（首次附中文對照）、統計 / 程式 / 數學術語（regression、p-value、TypeScript…）、spec artifact 的 RFC 2119 normative 文字（SHALL / MUST、WHEN/THEN BDD scenario）、commit message、code comment。
<!-- END: spec skill -->

## Deploy targets

GitHub Pages is **retired** and 一階 (`medexam-tw`) is **removed** (`remove-medexam-tw-and-promote-neurons`, 2026-06-03). `https://fireman333.github.io/study-rpg/` + `/study-rpg/hospital/` → GitHub 404; `med-study-rpg.com/1st/` → 404. The app shell is served only from Cloudflare Pages on `med-study-rpg.com`:

| Target | URL — 神經元 (canonical) | URL — 二階 | Pipeline |
|---|---|---|---|
| **Cloudflare Pages** (`med-study-rpg.com`) | `https://med-study-rpg.com/neurons/` | `https://med-study-rpg.com/2nd/` — served by the **standalone** repo + its own CF project `med-study-rpg-2nd`, fronted by the edge-router Worker on `med-study-rpg.com/2nd/*` (NOT the combined project; `split-medexam2-standalone`) | Combined CF Pages **direct-upload** project `med-study-rpg` (no GitHub integration). `.github/workflows/deploy-cf-pages.yml` on main push builds **neurons only** + `node scripts/build-cf-pages-dist.mjs` (assembles `dist-cf/neurons/` + root hub landing) + `wrangler pages deploy`. Owner can also run `pnpm deploy:cf` locally (Vite env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_SYNC_WORKER_URL` from local shell env). Root `med-study-rpg.com/` serves the hub landing (`scripts/cf-landing-template.html`, 2 cards: 二階 + neurons). |

### 二階 standalone deploy (`split-medexam2-standalone`, 2026-06-03)

二階 was extracted to a standalone repo (`~/coding-scratch/study-rpg-2nd`, GitHub `fireman333/study-rpg-2nd`) that consumes `@study-rpg/core` from **npm** (`^0.6.0`) instead of the workspace symlink. It deploys to its own CF Pages project `med-study-rpg-2nd` via `pnpm run deploy` in that repo (`scripts/build-cf-2nd.mjs` → `wrangler pages deploy`; must be `pnpm run deploy`, not bare `pnpm deploy` which hits pnpm's built-in subcommand); the `med-study-rpg.com/2nd/*` apex route is bound to an **edge-router Worker** (`edge-router/` in the new repo) that reverse-proxies to `med-study-rpg-2nd.pages.dev/2nd/*`, so the player-facing URL never changes. Backend is untouched (same sync Worker `api.med-study-rpg.com` / R2 / D1 / Supabase Auth / `user_id`) — existing cloud saves carry over with zero re-login. **Core fixes propagate to 二階 via npm publish → version bump**, not fork edits. Future 二階 feature work goes in the new repo, not this monorepo. Rollback (per design Migration Plan): **before** §5 redeploys the combined project, drop the apex route → the combined project still serves `/2nd/` unchanged; **after** §5 has redeployed without 二階, rollback = restore the `ROUTES` + workflow 二階 entries (revert §5) and redeploy the combined project.

Both deploys hit the same Cloudflare Worker `study-rpg-sync-worker` via two URLs (same backend, no traffic split):

- Legacy: `https://study-rpg-sync-worker.tony85314.workers.dev` (GH Pages clients)
- New: `https://api.med-study-rpg.com` (CF Pages clients; Custom Domain binding)

OAuth redirect URI allowlist + Supabase Site URL inventory is in [docs/AUTH_REDIRECT_URIS.md](docs/AUTH_REDIRECT_URIS.md). Bake-end follow-up change will flip GH Pages to redirect-only and remove the legacy entries.

## Repo-specific build / dev quick reference

```bash
# Re-build 題庫 (neurons content pack；複用一階 corpus ~4600 Q / 11 families)
pnpm run build:neurons-content           # = pnpm --filter @study-rpg/content-neurons-tw build
# 神經元 app build 有 copy-content prehook，會把 dist JSON 複製到
# apps/neurons-tw/public/content/neurons-tw/（手動改 subjects.json 時注意 meta.json builtAt churn）

# Cold checkout 第一次跑前先 build core (main/exports 指向 dist/，不走 src/.ts on-the-fly)。
# core src/index.ts 改動後也要再跑。`pnpm -r build` topo-sort 自動處理，只跑 `pnpm dev` 不會：
pnpm --filter @study-rpg/core build      # 必要 cold checkout 或 core 改動後

# Dev server (http://localhost:5173/)
pnpm dev                                 # = dev:neurons = pnpm --filter @study-rpg/neurons-tw dev

# Typecheck + unit tests
pnpm -r typecheck
pnpm --filter @study-rpg/neurons-tw test # vitest

# Build + deploy → Cloudflare Pages (med-study-rpg.com/neurons/)
pnpm run deploy:cf                       # build:cf (VITE_DEPLOY_BASE=/neurons/) → wrangler pages deploy
```


## Backend & shared infra（共用後端 — pointers）

> 一階/二階 app code 已從本 repo 移除（`remove-medexam-tw-and-promote-neurons`, 2026-06-03），但**後端是共用的**。完整內容在 `docs/` + openspec archive，這裡只留 operative 指標。

- **Cloud sync**：neurons = R2-only、固定 `'neurons'` bundle（`apps/neurons-tw/src/lib/sync/r2/`）。共用 sync Worker `https://api.med-study-rpg.com`（legacy `study-rpg-sync-worker.tony85314.workers.dev`），source 在本 repo `cloudflare/sync-worker/`。Supabase Auth (Google OAuth)、project ref `jakdyjxojokyqxeiuukx`。env vars 走 per-app `.env.local`（gitignored；per-app + per-worktree 陷阱見 § Known sharp edges）。**完整：`docs/CLOUD_SYNC.md`。**
- **⚠️ 共用 Worker = 二階依賴點（勿破壞）**：`cloudflare/sync-worker/` 同時服務 neurons + **二階 (`m2`)** + `bookmarks` bundle presign，以及 leaderboard（D1 `study-rpg-leaderboard`：`leaderboard_neurons` + `leaderboard_m2`、KV `LEADERBOARD_KV`、hourly cron）。二階 已抽成 standalone repo `study-rpg-2nd` 但**仍打這個 Worker** → 改 presign whitelist / `leaderboard_m2` / D1 schema 前先確認不會斷二階。**完整：`docs/LEADERBOARD.md`。**
- **Bug reporting**：neurons in-app（HelpMenu「🩺 回報問題」+ QuizModal inline 🐞）→ Supabase `bug_reports`；neurons categories 走 migration `0017_neurons_bug_reports.sql`。**完整：`docs/BUG_REPORTING.md`。**
- **二階 app features**（achievement / hospital-equipment / bookmarks-filters）已隨 split 移到 standalone repo `study-rpg-2nd`；本 repo 只留歷史 spec：`openspec/changes/archive/2026-05-24-add-achievement-system/`、`.../2026-06-03-abandoned-add-hospital-equipment-medexam2/`、`.../2026-05-25-add-bookmarks-filters-and-wrong-history-medexam2/`。
- **OAuth redirect / Supabase Site URL inventory**：`docs/AUTH_REDIRECT_URIS.md`。Dexie upgrade-fixture rule：`docs/DEXIE_UPGRADE_FIXTURE_RULE.md`。

## Neurons feature notes（搬到 docs/ — pointer）

> 6 段 `apps/neurons-tw` feature 實作摘要 / key handles 已移到 **`docs/NEURONS_FEATURE_NOTES.md`**（精簡 always-on；仍 in-repo）。下面每條附該 feature 的 load-bearing sync carve-out（**動 sync 前必讀**）+ 正確的 openspec archive 連結：

- **Neurons achievement system** — 30 catalog；types 宣告在 content pack 本地（非 `@study-rpg/core`）。`openspec/changes/archive/2026-05-25-add-neurons-achievements/`。
- **DMN fate cards** — `dmnEventLog` 用 **monotonic-UNION** merge（**不可改 LWW**，Vitest 鎖）；R2 bundle 有 reader-tolerance（forward-compat）。`openspec/changes/archive/2026-05-28-add-neurons-dmn-fate-card/`。
- **Neurons wrong-answer list** — `questionHistory.everWrong` 用 **monotonic-OR**（**不可改 LWW**，Vitest 鎖）；唯一答題入口 QuizModal 必呼 `recordQuestionResult`。`openspec/changes/archive/2026-06-01-add-neurons-wrong-questions-subtab/`。
- **Context-driven variant art** — 零 schema、純 derived（decor field + δ/θ/α/β brain-wave band）。`openspec/changes/archive/2026-06-02-context-driven-variant-art/`。
- **Neurons acceleration system** — Dexie v16、R2 bundle 16；`equipmentAdapter` UNION-monotonic、`inventoryAdapter` per-kind LWW。`openspec/changes/archive/2026-06-04-add-neurons-acceleration-system/`。
- **Neurons living companions** — 零 schema、純 derived（`equipment` table `companion:true` 子集）。`openspec/changes/archive/2026-06-04-add-neurons-living-companion-render/`。

## Source data path

題庫原始 .md 在使用者本機（**不在 repo 內**）：

```
$HOME/Desktop/國考/一階國考/陽明國考考古/_extracted/
└── 醫學一/ + 醫學二/  (10 subjects × 18 files each = 180 files, ~3505 Q)
```

Build script 預設讀此路徑；其他環境設 `MEDEXAM_SOURCE_ROOT` env var 覆寫。


## Neuroscience design verification (M_3rd track / neurons-tw)

設計 / 編寫 neurons-tw 相關內容（content pack 對映、design.md 的科學 anchor、spec 描述機制的文字、UI 文案中的神經學 metaphor）時，**任何對神經解剖學 / 神經生理學的疑問都應先走 OpenEvidence 查實證，不要憑記憶或泛用 LLM 知識 lock 決定**。

具體流程：
- 直接 `/oe <臨床問題>` 或 `/oe-triangulate` 查文獻；需要正反面證據時走 triangulate
- 設計級的「這個 family 屬於哪 NT branch / 解剖位置 / 功能機制」由 PubMed-anchored 證據支持；persona 視覺 / 故事 hook 可以較自由，但**神經學 fact 必須嚴謹**（per `wire-neurons-content-and-theme` design.md Decision 1 「neuron 本身的 NT 識別 / 解剖位置 / 功能必須科學嚴謹」原則）
- 把找到的 PubMed citation 附進 design.md 對應 decision 的 anchor 表格（mirror `wire-neurons-content-and-theme` 11-subject mapping 的 PMID anchor cadence）
- 不適用：純 UI / 程式架構決策、game-loop 數值平衡（如 N=5 / 7 天 decay / AP threshold ladder — 這些是 game design 直覺 + dogfood telemetry，非神經科學 fact）

為什麼這條規則重要：
- Owner 是醫學生 + 即將 RA，產品定位是「教科書級臨床戲劇」，使用者群是同儕醫學生，神經學細節錯了立刻被看穿
- 2026-05-25 `wire-neurons-content-and-theme` persona design 過程已示範：4 個 persona（寄生蟲 Toxoplasma / 免疫 anti-NMDAR / 倫理 DRN / 微生物 olfactory）就是透過 OpenEvidence 從「生物背景」升級為「臨床戲劇」，每個附 2-3 篇 PMID anchor
- LLM generic 神經知識常見錯誤模式：把 receptor 跟 ion channel 搞混、解剖位置半對半錯、機制方向反掉 — OE 查證能擋掉這些

## Known sharp edges

- TypeScript `tsconfig.base.json` 不要再加 `paths` — leaf packages 透過 pnpm workspace symlink 解析 `@study-rpg/core`，加 paths 反而觸發 rootDir 衝突（2026-05-14 踩過）
- esbuild 解析 TS comment 時對 `**/` 敏感 — 任何 block comment 不要寫 `/**/*.md` 之類 glob，會提前終止註解（content build script 踩過）
- `font-family: 'Cubic 11'` 必須來自 host app `public/fonts/`（透過 `@font-face`），theme package 不能直接 ship webfont 給 npm consumer，因 npm 不會自動 publish 字型檔
- **Hospital tier display / canonical separation**（2026-05-23 via `add-abbreviated-tier-labels-medexam2`）— UI 顯示走 `apps/medexam2-hospital-tw/src/lib/tier-labels.ts` 的 `tierLabel()` 短稱（診所 / 區域 / 醫中 / 大廟）；canonical type strings 仍為 `'診所' | '區域醫院' | '醫學中心' | '國家級教學醫院'`（HospitalTier union），這些 canonical 值散落於 Dexie、R2 bundle、D1 leaderboard、`HOSPITAL_TIER_TO_NUM` mapping、scene key mapping、所有 spec scenarios。**規則**：任何**用戶可見**的 tier 字串渲染都應該走 `tierLabel()`；任何**程式邏輯**比較或儲存值都用 canonical。HelpMenu 是例外，第一次提到每個 tier 時用「短稱（canonical）」雙寫格式以幫舊玩家對應。Tutorial / 簡短提示用短稱即可（無 disambiguation）。aria-label / accessibility 文字可用 canonical 給 screen readers
- **SRS first-interval lengthening + opt-in modifiers**（2026-05-25 via `tune-srs-binary-modifiers-and-intervals`）— `STANDARD_INITIAL_INTERVALS` changed `[1, 6]` → `[3, 7]` in `packages/core/src/lib/srs.ts`. 一階 + 二階 QuizModal 答對狀態多 2 顆 opt-in 按鈕：✨ 「太簡單」(`reviewCardEasy/Binary` — `ease ×1.5`、`interval ×3`、二階順手 `everWrong = false`) 和 🤔 「我亂猜的」(`reviewCardGuessed/Binary` — `interval = 1`、ease 不扣). 二階 `everWrong` 同步 merge 從 monotonic-OR 改 row-level LWW via `lastAnsweredAt`，所以 「太簡單」 的 explicit clear 可跨裝置 propagate；舊 client 沒寫 `everWrong` 欄位的 payload 仍保 local true（preserve-on-omission fallback）。DEV-only `globalThis.__srs.getStats()` 暴露 ease distribution / button click count / due queue size（prod build 已驗 strip 乾淨，0 hits）
- **Vite `.env.local` 是 per-app 不是 monorepo root**（2026-05-25 踩過，付出代價：兩次 prod 部署 regression 把 一階+二階 cloud sync 整個關掉 40 分鐘）— Vite build 時讀的是 **CWD 的 `.env.local`**。`pnpm --filter @study-rpg/<app> build` 切換到 `apps/<app>/`，所以 Vite 讀的是 `apps/<app>/.env.local`，**不是 repo root 的 `.env.local`**。**規則**：每個 app（`apps/medexam-tw/`、`apps/medexam2-hospital-tw/`、`apps/neurons-tw/`）各放一份 `.env.local`（已都 gitignored），即使內容一模一樣。Root `.env.local` 可以留給 backend admin scripts（`scripts/bulk-migrate.ts` / `reconcile.ts` 等用 dotenv 從 cwd 讀）。**症狀**：build 完的 JS bundle 沒含 `jakdyjxojokyqxeiuukx` 字串、`getSupabase()` 回 `null`、console 噴 `[auth] Supabase env vars missing → cloud sync disabled`、UI 不顯示 sign-in CTA / 已同步 chip。**驗證指令**：`curl -s https://med-study-rpg.com/<subpath>/assets/index-<hash>.js | grep -c jakdyjxojokyqxeiuukx`，0 = env 沒 baked、>=1 = OK。**Cross-worktree 維度**（2026-05-30 neurons 踩過）：`.env.local` 既是 per-app 又是 per-worktree（gitignored 不跨 worktree 傳）。`pnpm deploy:cf` 永遠從 **deploy worktree `~/coding-scratch/study-rpg`** 跑，所以**每個要上 CF Pages 的 app 在 deploy worktree 都要有自己的 `.env.local`**——光在 dev worktree（`study-rpg-neurons` / `study-rpg-m2`）放不夠。加新 app（如 `neurons-tw`）時最容易漏：dev worktree 有、deploy worktree 沒有 → dev 看起來正常、prod silent 少 env。修法 = 在 `~/coding-scratch/study-rpg/apps/<app>/.env.local` 補一份。
- **`pushAllNow` 清 dirty marker 是 conditional，不要改回 unconditional**（2026-05-27 via `audit-pushallnow-dirty-marker-semantics` — AAD-v2 §13.2 root-cause follow-up）— 一階 + 二階 sync engine `pushAllNow` 結尾的 `for (const [dexieTable, set] of dirty.perTable.entries())` 迴圈，**只清 supabaseOk && r2Ok 的 table**。任何 adapter / R2 bundle push throw 時，對應 dexieTable 留在 dirty set 等下次 push retry。**舊行為 (bug)**：unconditional `for (const set of dirty.perTable.values()) set.clear()` 不論成功失敗都清掉，transient failure 就 silently 丟資料。AAD-v2 startup probe 只擋 `unknown table` partial-migration 一種失敗形狀；其他 transient（network / 503 / JWT expired / R2 hiccup）都會踩。**Reference correct pattern**：[`pushNow:271-273`](apps/medexam2-hospital-tw/src/lib/sync/engine.ts:271) 已有 `if (allBundlesOk) { clear }` gate 是對的，`pushAllNow` 過去是 outlier。**neurons-tw 不受影響**：用不同 `pending: boolean` 架構，沒 `dirty.perTable` Map。**Spec**: [`openspec/specs/cloud-sync/spec.md`](openspec/specs/cloud-sync/spec.md) `Requirement: pushAllNow clears dirty markers conditionally per adapter outcome`。**測試 coverage 是 follow-up `add-sync-engine-partial-failure-tests`**，目前靠 prod offline-mode smoke 驗（trigger 寫 → Network → Throttling → Offline → 等 debounce → 重開網路 → 看 chip 是否從 🟡 回 🟢 + 資料是否真的 propagate）。
- **Dexie schema bump 必帶 v(N-1) → v(N) upgrade fixture**（2026-05-27 via `enforce-dexie-upgrade-fixture-rule` — 推 §13.3 follow-up of AAD-v2）— CI workflow `.github/workflows/dexie-fixture-lint.yml` 與本機 `pnpm lint:dexie-fixtures` 會掃 PR / push diff，**任何**新 `.version(N)` 宣告（散落於 `apps/medexam2-hospital-tw/src/db/schema.ts` / `apps/neurons-tw/src/lib/db.ts` / `packages/core/src/lib/db.ts` 等檔）若 sibling `__tests__/` 下找不到含字面 `.version(N-1).stores(` 的測試就 fail。**Canonical pattern**：[`apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts:30`](apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts)。**完整規則**：[`docs/DEXIE_UPGRADE_FIXTURE_RULE.md`](docs/DEXIE_UPGRADE_FIXTURE_RULE.md)。**Escape hatch**（真的緊急 only，必須配 follow-up PR 補 fixture）：`SKIP_DEXIE_FIXTURE_LINT=1 pnpm lint:dexie-fixtures`。**為什麼這條重要**：v1 cut of `add-r2-cloud-sync-migration`（`dac4eae` reverted by `99eac9b`）一個 pk-change 把 prod 兩個 URL 對所有 v18 user 全打掛 40 min；fixture-first dev 在 v2 fix 抓到第二輪 `AbortError` regression（`&doctorId` unique-index activation 順序）— 沒這條 lint 下次有人改 schema 就會在 prod 重複踩。
- **CF Pages vs GH Pages deploy asymmetry**（learned 2026-05-25 via `add-neurons-deploy` chain — 兩次連續 hotfix `78a3ed0` + `e638ca8` 才修好）— 兩個 deploy workflow **走完全不同的 pipeline**：`deploy.yml` (GH Pages) 只 build 一階 + 二階、然後把 二階 dist merge 進 一階 `dist/hospital/` 子路徑；`deploy-cf-pages.yml` (CF Pages) build 一階 + 二階 + neurons-tw 各自 dist，然後 call `scripts/build-cf-pages-dist.mjs` 組裝。**踩坑模式**：加新 app 到 monorepo 時，`build-cf-pages-dist.mjs` ROUTES 更新了但 `deploy-cf-pages.yml` 沒加對應 build step → `Required input missing: apps/<name>/dist`，CF Pages 全部失敗、GH Pages 卻照常成功（因為 GH workflow 根本不 build 那個 app）— 只看 GH Pages URL 完全看不出 prod 已經死靜默幾小時，新 commit 看似 ship 但 CF Pages 服務的是上一次成功的 cached snapshot。**規則**：(1) 加新 app 必須**同時**更新 `scripts/build-cf-pages-dist.mjs` ROUTES + `.github/workflows/deploy-cf-pages.yml` build step（兩份 atomic update，否則 prod 死靜默）；(2) 任何 deploy-affecting commit 完 push 後**必跑** `gh run list --branch main --limit 5`，看「Deploy to GitHub Pages」+「Deploy Cloudflare Pages」**兩個都綠**才算 ship；(3) 任何新 content pack 的 build 一定要支援 `MEDEXAM_ALLOW_SKIPS=1` env 跳過 orphan subjects，這是 scaffold 階段唯一不卡 CI 的 escape — 加 build step 時別忘了帶這個 env。
