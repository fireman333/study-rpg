## Context

M3 milestone 從原本「公開 API + 範例 fork」（三 item）瘦身為「公開 API + dogfood fork validation」（兩 item）— 詳見 `openspec/project.md` Roadmap 跟 main worktree commit `83d095a`。三 item 中 toefl-mini-demo 被降級到 M7 stretch（沒外部 contributor 之前 utility 低）。剩兩 item：

1. ✅ `@study-rpg/core@0.1.0` published（main worktree commit chain 結尾 `077f9e5` decision log）
2. ✅ `@study-rpg/core@0.2.0` published（main worktree commit `96d2cea` + owner npm publish step） — 起因為 track-m2 在 0.1.0 publish 後又 archive 了 `wire-hospital-srs-queue` 擴 core 8 個 SRS exports，0.1.0 不夠用
3. ⏳ **本 change**: 二階 hospital fork 改用 published 版本（M3 forkability 收尾）

**Stakeholders**: 作者 dogfood（M3 forkability 自驗）+ 未來潛在 contributor（看到 `apps/medexam2-hospital-tw/package.json` 寫 `^0.2.0` 而非 `workspace:*` 知道真實 consume pattern 是這樣）。

## Goals / Non-Goals

**Goals:**
- 3 m2 packages 的 `@study-rpg/core` dep 改 `^0.2.0`
- pnpm install 後 lockfile 證明 registry resolution（npm tarball URL，不是 workspace link）
- `pnpm -r typecheck` 全綠 — 確認 0.2.0 dist/index.d.ts 涵蓋 m2 用到的所有 exports（含 SRS）
- Chrome MCP smoke 二階 SPA 三件套保持 prod 行為

**Non-Goals:**
- 不 merge main 進 track-m2（deliberate keep version drift）
- 不 migrate 一階 packages（engine 開發者本身用 workspace 才方便）
- 不改 `link-workspace-packages` 配置
- 不調整 hot reload 流程（forkability 的代價就是 fork 端要等 publish）

## Decisions

### Decision 1: Deliberate version drift (workspace 0.1.0 vs deps `^0.2.0`)

**選**：保留 m2 workspace `packages/core/package.json` 在 0.1.0，3 packages deps 直接 `^0.2.0`，不 merge main。

**Why**:
- pnpm 預設 `link-workspace-packages=true` — 若 workspace 滿足 dep range 就 link，不 fetch from registry
- 若 merge main 進 track-m2，workspace core 升到 0.2.0 → 滿足 `^0.2.0` → pnpm link workspace → forkability 證據變弱（lockfile 看不到 npm tarball）
- 留 workspace 0.1.0 + deps `^0.2.0` → workspace 不滿足 → 強制 registry resolution → lockfile 留下 `https://registry.npmjs.org/@study-rpg/core/-/core-0.2.0.tgz` 證據

**Trade-off**: track-m2 跟 main 在 packages/core 段持續 divergent（main 0.2.0 / m2 0.1.0），未來 sync 時要小心。但對 M3 forkability prove-out 收益遠 > 維護成本。

**Alternative considered**: merge main + 在 `.npmrc` 設 `link-workspace-packages=false` only for `@study-rpg/core` — pnpm 不支援 per-package 配置，要嘛 all 要嘛 nothing，會破壞一階 dev experience。

### Decision 2: 用 `^0.2.0` 而非 `~0.2.0` 或 pinned `0.2.0`

**選**：`^0.2.0`（接受 0.2.x 任何版本，不接受 0.3.x）。

**Why**:
- 0.x semver 階段 pre-publish spec 已寫「additive 才 minor bump、breaking 也 minor bump（沒 patch level）」
- `^0.2.0` 等同 `>=0.2.0 <0.3.0` — 接受 0.2.x patch（理論上不存在）但拒絕 0.3.0 minor bump
- 真實場景下作者控制 publish cadence，dep 用 `^` 對保守 fork 友善（接受 同 minor 內 fix）
- 跟一階 engine 開發者 workflow 對齊（未來一階改用 npm version 也會用 `^` semver）

### Decision 3: No spec delta

**選**：本 change `specs/` 留空（no MODIFIED / ADDED requirements）。

**Why**:
- migration 是 dependency resolution refactor，沒改任何 capability normative behavior
- `core-npm-package` capability 的 contract 不變（0.2.0 已 covered in main worktree 的 release commit + decision log）
- 把 dependency choice 寫進 spec 是 over-spec — pin 死了未來改 npm aliasing / per-folder .npmrc 等實作選擇

**Risk**: 未來 reviewer 可能會問「為什麼 migration change 沒 spec delta」— 由 proposal.md「Modified Capabilities：無」 + 本 design.md Decision 3 處理。

### Decision 4: track-m2 → main sync 延後

**選**：本 change 純 m2 worktree 內動作，不 commit main 任何東西，不 push track-m2 → main 整合。

**Why**:
- 平行 session 在 m2 worktree 留下 specialty-bonus 未 commit work（4 modified + 4 untracked），不該綁進 migration commit
- M3 收尾 priority > track-m2 整合
- Sync 是 separate operation：未來 owner 看時機把 track-m2 整段 merge 回 main（含 specialty-bonus + migration + 其他）

**How to apply later**: owner cd main worktree → `git merge track-m2` → resolve `packages/core/package.json` version field conflict（main 0.2.0 vs m2 0.1.0，選 main 0.2.0）→ resolve `openspec/decisions/2026-05-16.md` 衝突（merge 兩邊 entries 即可、按 timestamp 排序）→ commit。

## Risks / Trade-offs

**Risk 1: pnpm install 後 still link workspace despite version mismatch**
- Severity: P3
- Mitigation: install 完跑 `cat pnpm-lock.yaml | grep -A 3 "@study-rpg/core"` 確認看到 `https://registry.npmjs.org` URL 而非 `link:` resolution。若仍 link：debug pnpm version + check `pnpm-workspace.yaml` excludes 設定
- Detection: tasks §3.2 明確驗證

**Risk 2: 0.2.0 dist/index.d.ts 漏 m2 用到的 export**
- Severity: P2（若漏即整 typecheck fail）
- Mitigation: 已驗證（main worktree pnpm pack 後 grep `reviewCardBinary` / `SRS_DAILY_CAP` 都在 dist/index.d.ts）
- Detection: tasks §4.1 `pnpm -r typecheck`

**Risk 3: 二階 dev hot reload 改 packages/core/src/ 不再傳染**
- Severity: P3（這是 forkability 的設計後果，不是 bug）
- Mitigation: 沒有 — 這正是 fork 端的真實體驗。若 owner 仍想 dev 共享 core，請走一階 worktree
- Documentation: 已在 proposal.md「Build / dev experience」section 註明

**Risk 4: pnpm-lock.yaml 大幅變動（包括其他 transitive deps）**
- Severity: P4
- Mitigation: 預期影響範圍是 `@study-rpg/core` + 其 transitive deps 的 resolution。其他 unrelated lockfile 變動 → git diff review 時 flag
- Detection: tasks §3.3 review pnpm-lock.yaml diff

## Migration Plan

無 data migration（沒 schema 變動、沒 user-facing flow 變動）。

## Open Questions

無。本 change scope 鎖死、所有 design 決策都 lock 完。
