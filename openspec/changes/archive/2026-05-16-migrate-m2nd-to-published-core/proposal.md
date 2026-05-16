## Why

`@study-rpg/core@0.2.0` 已 publish 到 npm（owner-driven，2026-05-16）。M3 forkability prove-out 的最後一項 = 證明二階 hospital fork 真實 consume published package（不再靠 monorepo workspace symlink）。本 change 把 m2 三個 package 的 `@study-rpg/core` dep 從 `workspace:*` 改 `^0.2.0`，並透過 pnpm-lock.yaml 留下「實際從 npm registry 拉 tarball」的證據。

完成本 change 後 M3 ✓ 3/3 shipped — engine 真的 forkable，未來第三方寫自己的 content / theme pack 接 `@study-rpg/core` 不再是文件 claim，是 m2 已驗證的 working pattern。

## What Changes

- **3 package.json deps update**:
  - `apps/medexam2-hospital-tw/package.json`：`"@study-rpg/core": "workspace:*"` → `"^0.2.0"`
  - `packages/content-medexam2-tw/package.json`：同上
  - `packages/theme-pixel-hospital/package.json`：同上
- **pnpm-lock.yaml 自動重生**：`pnpm install` 後 lockfile 對 `@study-rpg/core` 條目從 `link:../packages/core` 改成 npm tarball reference (`registry.npmjs.org/@study-rpg/core/-/core-0.2.0.tgz`)
- **Verification**: `pnpm -r typecheck` 全綠（new SRS exports `reviewCardBinary` / `SRS_DAILY_CAP` 從 npm 拉的 0.2.0 dist/index.d.ts 解析）+ Chrome MCP smoke 二階 SPA 三件套

## Capabilities

### New Capabilities

無。

### Modified Capabilities

無。本 change 是 dependency-resolution-only refactor，不改任何 normative behavior。`core-npm-package` 的 contract 不變（0.2.0 sumvers contract 同 0.1.0 + additive exports，已 covered in main worktree commit 96d2cea）。

## Impact

**Code**: 3 package.json one-line deps key change。Zero source code edits。Zero behavior change in app runtime。

**Build / dev experience**:
- `pnpm install` 後二階 worktree 的 `node_modules/@study-rpg/core` 從 symlink 變成 unpacked tarball
- Hot reload：二階 dev 時改 `packages/core/src/` 不再自動傳到二階 app（要重 publish 0.2.x 才會）— 這正是 forkability 的證據（外部 consumer 沒有 monorepo source reach）
- 一階（main worktree apps/medexam-tw）不受影響，仍用 workspace 連結 0.2.0 source

**Schema**: 無變動。

**Dependencies / APIs**: 無新 npm package；只是換 resolution path（workspace → registry）。

**Track-m2 sync caveat**: 本 change 不 merge main 進 track-m2（m2 workspace core 仍 0.1.0）。**deliberate version drift**：m2 workspace 0.1.0 不滿足 `^0.2.0`，pnpm 被迫從 registry 拉 0.2.0 — 這比 merge 後同版本（pnpm 預設 link workspace）更強力證明 forkability。未來 track-m2 → main sync 是 separate operation。

**Out-of-scope**:
- `link-workspace-packages=false` 配置 — 不需要（版本 drift 已強制 registry resolution）
- Migrate 一階（apps/medexam-tw / packages/content-medexam-tw / packages/theme-pixel-medical）— 一階是 engine source-of-truth fork，沒理由 detach
- Track-m2 sync main — separate session
