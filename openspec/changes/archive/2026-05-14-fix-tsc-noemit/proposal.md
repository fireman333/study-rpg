## Why

`apps/medexam-tw` 的 build script `tsc -b && vite build` 跑完會把 transpiled `.js` 灑進 `src/`（`App.js` / `main.js` / `components/*.js` / `tsconfig.tsbuildinfo`）。原因：tsconfig 沒有 `"noEmit": true`，tsc 預設會 emit；`-b` 沒被 `references` 限制，行為等同 `tsc` 全量 emit。

2026-05-14 跑完 4 個 archive 前的 `pnpm build` 第一次踩到 — 7 個 orphan `.js` 出現在 working tree、git status dirty。當輪 commit 是手動 rm + explicit `git add` 才沒污染。下次 build 還會重現。

Vite 本身用 esbuild transpile + 自己 emit 到 `dist/`，根本不需要 tsc 的 emit 產物。tsc 在 vite 專案的角色只是 typecheck gate。

## What Changes

- `apps/medexam-tw/tsconfig.json` 的 `compilerOptions` 加 `"noEmit": true`（防 tsc emit .js / .d.ts 到 src/）
- `apps/medexam-tw/package.json` build script `tsc -b` → `tsc --noEmit`（`-b` build mode 即使 noEmit 仍寫 `tsconfig.tsbuildinfo`；`--noEmit` 不會。同時 app tsconfig 沒 `references`，`-b` 本來就用錯）
- **不 BREAKING**：dev / prod build 仍會 typecheck（type error 失敗就 fail fast）；vite emit 不受影響

## Capabilities

### New / Modified Capabilities

（無 — tooling-only 修正，走 `archive --skip-specs`）

## Impact

- **Files**: `apps/medexam-tw/tsconfig.json`（加 1 行）
- **APIs**: 無
- **Dependencies**: 無
- **Tests / verify**:
  1. `rm -rf apps/medexam-tw/src/**/*.js apps/medexam-tw/tsconfig.tsbuildinfo`（清乾淨基線）
  2. `pnpm --filter @study-rpg/medexam-tw build` 跑完
  3. `find apps/medexam-tw/src -name "*.js" -not -path "*/node_modules/*"` 應 empty
  4. `find apps/medexam-tw -name "tsconfig.tsbuildinfo"` 應 empty
  5. `apps/medexam-tw/dist/` 仍有 vite 產出的 bundle
- **Risk**: 極低。Vite + TS 專案的標準 `noEmit: true` 用法，社群預設
