## Why

study-rpg engine 從 M1 起就設計成 content / theme pack 解耦（已 `lock-content-pack-contract` + `lock-theme-pack-contract`），M3 roadmap 預期「minimal content-toefl-mini 50Q demo」dogfood fork flow。Owner 自己最在意的 fork target 不是 TOEFL — 是台灣**二階醫師國考**（醫學三–六、14 科、~12,160 題；2026 下半年考完一階後接著要考二階），且想換 game mode（一階 = 學生養成 RPG；二階 = 院長經營型 tycoon）。本 change 用「比 TOEFL 更有 personal stake 的 fork demo」證明 content/theme contract 可承載 multiple packs + multiple game modes。

本 change 範圍只到 **scaffold** — 建 3 個新 packages 的空骨架、定義 `hospital-management-mode` capability spec、更新 roadmap。資料 ingestion / tycoon 引擎 / 抽卡 UI / 美術 / GH Pages deploy 各拆獨立 changes。

設計細節來自 2026-05-15 在 `~/claude_domain/vibe-coding/2nd-study-rpg/` 跑的 grill quick 6 題（progression / 答題耦合 / 醫師卡功能 / rarity 軸 / 親密度形態 / 視覺）—— 結論 lock 進 `design.md` Decision 1–7。

## What Changes

- 新增三個 package + 一個 app（**scaffold-only，無 game logic**）：
  - `packages/content-medexam2-tw/` — 二階國考 content pack target（empty placeholder ContentPack）
  - `packages/theme-pixel-hospital/` — 醫院主題 theme pack（fork minimal scaffold from `theme-pixel-medical`）
  - `apps/medexam2-hospital-tw/` — 經營型 RPG app shell（Vite + React + 一行 placeholder title）
- 新增 capability `hospital-management-mode`，定義 4-step game loop + 4 個子系統高層 contract（tycoon-engine / recruitment-gacha / subject-affinity / hospital-reputation）
- 更新 `openspec/project.md` Roadmap：新增 M_2nd 平行 milestone（dogfood-the-fork track；標記 🚧 起步）
- Root `package.json` 加 `dev:m2` / `build:m2` alias（一階 `dev` 仍指 medexam-tw，二階 5174 port）
- `pnpm install` + `pnpm -r typecheck` 兩個新 packages + app 跑通（empty exports 即可）

**Out of scope**（明確留給後續 changes，不在此 change 完成）：

- 二階國考資料 ingestion（解 ~12,160 .md + LLM 詳解 → questions.json） → 拆 `ingest-medexam2-tw-corpus`
- Tycoon tick engine 實作（doctor → room → revenue 公式） → 拆 `wire-hospital-tycoon-engine`
- 抽卡 UI + P1–P5 weight + 親密度 binary gate → 拆 `wire-recruitment-gacha`
- 醫院升級視覺（診所 → 區域 → 醫學中心三階段建築） → 拆 `wire-clinic-level-up`
- 醫師 sprite 美術（14 科 × P1–P5 roster） → 拆 `add-doctor-sprite-roster`
- 二階國考 content pack license 決定（user own LLM 詳解，跟一階 CC-BY-NC 不同） → 在 `ingest-medexam2-tw-corpus` 階段 lock
- GH Pages deploy workflow（二階 app） → 拆 `add-medexam2-gh-pages-deploy`
- Boss mode、multi-mode toggle、multiplayer — 永久 out of scope（per `project.md` Out of Scope）

## Capabilities

### New Capabilities

- `hospital-management-mode`: 經營型 game mode 的 4-step game loop + 4 個子系統高層 contract

### Modified Capabilities

（無 — 既有 `content-pack-contract` / `theme-pack-contract` / `engine-rewards` / `loot-mechanics` etc. 都保留不動；本 change 是 contract 的 dogfood，不是 contract 變更）

## Impact

- **Files**: 純 scaffold + spec — 3 新 packages 的 `package.json` / `tsconfig.json` / `src/index.ts` / `README.md` + 1 新 app 的 Vite shell（`vite.config.ts` / `index.html` / `src/main.tsx` / `src/App.tsx`） + 1 新 capability spec + roadmap row。預估 < 20 個新檔案、< 500 行新 code（多數是 boilerplate）。
- **APIs**: 無破壞性變更；新 packages 各自 export `getContentPack()` / `theme` 等符合既有 contract 的 placeholder。`@study-rpg/core` 介面零變更。
- **Dependencies**: 無新 third-party。新 packages 依賴 `@study-rpg/core@workspace:*` + `react ^18` + `vite ^5` + `typescript ^5.4`，全部既有。
- **Tests / verify**:
  - `openspec validate add-hospital-mode-scaffold` passes
  - `pnpm install` workspace 認到 7 個 workspace（既有 4 + 新 3）
  - `pnpm -r typecheck` 全綠（包含 empty exports）
  - `pnpm --filter @study-rpg/medexam2-hospital-tw dev` Vite boot 成功在 port 5174，瀏覽器看到 placeholder title
  - `pnpm --filter @study-rpg/medexam-tw dev` 一階 app regression check 通過
- **Risk**:
  - **低** — scaffold-only，沒動 core engine、theme-pixel-medical、content-medexam-tw、medexam-tw app
  - License 風險：二階 content pack 授權在 `ingest-medexam2-tw-corpus` 階段才 lock，本 change 用 placeholder LICENSE.md（TBD-after-ingest）
  - Monorepo 兩 app 並行可能 build time 變長 → M_2nd 後期再決定要不要拆 repo（M3 npm publish 是合流點）
