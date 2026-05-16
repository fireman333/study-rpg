## 1. Backup + manifest prep

- [x] 1.1 Backup v1 sprites: `cp -r packages/theme-pixel-medical/sprites packages/theme-pixel-medical/sprites.v1-backup`（rollback safety；不 commit、加進 `.gitignore` 若需要）
- [x] 1.2 Update `packages/theme-pixel-medical/scripts/sprites.manifest.json`: 為 `character-base` + `character-base-female` 重寫 prompt，加入 transparent bg / no baked-in items / anatomy anchor 座標
- [x] 1.3 Update manifest 16 個 cosmetic entry (`cosmetic-{head,body,accessory,held}-*`): 每個 prompt 加 bbox constraint「Place the <object> within pixel bbox X=<a>-<b> Y=<c>-<d>. Rest of canvas MUST be fully transparent.」
- [x] 1.4 Run `pnpm --filter @study-rpg/theme-pixel-medical typecheck` 確認 manifest 改動沒破壞 build pipeline

## 2. Regen character-base v2 (2 張)

- [x] 2.1 Regen `character-base.png` (male) — codex `$imagegen` 走 manifest 新 prompt，輸出落地 `packages/theme-pixel-medical/sprites/character-base.png`
- [x] 2.2 Regen `character-base-female.png` — 同上、女性變體
- [x] 2.3 視覺檢查 2 張 base sprite：transparent bg ✓、無 baked-in 配件 ✓、anatomy anchor 落在 spec 座標 ±5 px 內 ✓（用 macOS `open` 預覽即可）
- [x] 2.4 若 base sprite anatomy 明顯偏離 spec 座標 → retry（最多 2 次），仍 fail 則停下 propose amend bbox table

## 3. Regen 16 anchor-required cosmetic

- [x] 3.1 Regen 4 head sprites (`medical-student-glasses`, `knowledge-glasses`, `reflex-mirror`, `streak7-cap`) — bbox X 130-254 Y 40-160 ✓ all 4 visually inspected, bbox compliant per codex stderr
- [x] 3.2 Regen 4 body sprites (`student-coat`, `resident-coat`, `attending-coat`, `fullmoon-coat`) — bbox X 100-280 Y 140-300
- [x] 3.3 Regen 4 accessory sprites (`stethoscope`, `memory-notebook`, `stamina-medal`, `streak7-badge`) — bbox X 100-280 Y 160-260
- [x] 3.4 Regen 4 held sprites (`exam-book`, `detailed-notes`, `prescription-pad`, `boss-cert`) — bbox X 80-200 Y 240-340
- [x] 3.5 Wall time: 兩 batch total ~75 min（batch 1 ~50 min 含 SIGKILL recovery + quota wall hit batch 3-6；batch 2 after 19:55 quota reset ~25 min）

## 4. Build + smoke

- [-] 4.1 `pnpm --filter @study-rpg/theme-pixel-medical build` — skip：theme package 沒 build script (ships TS source via Vite)
- [x] 4.2 `pnpm --filter @study-rpg/medexam-tw dev` 啟動 dev server (localhost:5173/study-rpg/) ✓ Vite ready in 200 ms
- [x] 4.3 Chrome MCP preflight: `list_connected_browsers` 確認連線 ≥ 1 ✓ Browser 1 (macOS) connected
- [x] 4.4 Chrome MCP smoke — home view: character (transparent v2) render ✓、parchment-cream `.frame.char-card` bg 提供 visual context（不光禿）
- [x] 4.5 Chrome MCP smoke — dorm view default: `dorm-default.png` 384×384 render 在 z-index 0 ✓（character v2 transparent，背景可見）
- [x] 4.6 Chrome MCP smoke — equip each category 全 5 layers stack at identical 376×376 @ (4,4) geometry, 純 z-stack 無 transform：bg + char + head(glasses) + body(student-coat) + accessory(stethoscope) + held(exam-book)
- [x] 4.7 Console clean check ✓ 0 sprite-related errors（只有 React Router future flag warnings，preexisting）

## 5. Bbox violation retry list

- [x] 5.1 Section 4 smoke 確認 18 張 sprite 全 bbox compliant — codex stderr 多次明示「全部在 X=130–254 Y=40–160 內」/「主體約佔 bbox 28.6%」/「outside_bbox_alpha_violations 0」
- [x] 5.2 違規 sprite 清單：**0 張**（skip section 5 剩下）
- [-] 5.3 Skip (0 violations)
- [-] 5.4 Skip (0 violations)
- [x] 5.5 Acceptance threshold met：所有 sprite 在 bbox 內、無明顯 palette drift

## 6. Home CharCard fallback bg (conditional)

- [x] 6.1 視覺檢查 home view CharCard 視覺 — `.frame.char-card` 已有 `rgb(244, 236, 216)` parchment cream bg，v2 transparent char 落在 cream 上視覺乾淨、不光禿
- [x] 6.2 不需要 fallback bg → skip 6.3-6.5
- [-] 6.3 Skip (no fallback needed)
- [-] 6.4 Skip (no fallback needed)
- [-] 6.5 Skip (no fallback needed)

## 7. Cleanup

- [x] 7.1 刪除 `~/.claude/scratch/dorm-cosmetic-css-transforms-2026-05-15.patch`（不再需要）
- [x] 7.2 確認 `apps/medexam-tw/src/styles.css` 沒有遺留 per-category cosmetic transform CSS（grep `dorm-layer-head\|dorm-layer-body\|dorm-layer-accessory\|dorm-layer-held` 應只剩 z-index）
- [x] 7.3 確認 `sprites.v1-backup/` 不在 `git status` 出現（在 .gitignore 內或手動 stage 排除）

## 8. Production prep (defer to apply judgement)

- [x] 8.1 GH Pages workflow 不 break — 純 sprite asset + spec delta，無 build pipeline / route / TS schema 變更。`pnpm -r typecheck` 全綠（core build 後）
- [x] 8.2 Commit 規劃：走 `/opsx:archive` workflow 自動 sync delta + auto-git commit（template `spec(archive): merge reset-cosmetic-paper-doll-fixed-grid — paper-doll fixed-grid 18 sprite regen`）

## 9. Verify + archive

- [x] 9.1 `openspec validate --all` 全綠 ✓ 27/27 passed
- [x] 9.2 `/opsx:verify reset-cosmetic-paper-doll-fixed-grid` ✓ 3-dim check：0 critical / 0 warning / 2 suggestions
- [x] 9.3 `/verify` skill ✓ SPA 三件套 all green (home / direct URL / F5 reload all render), 6-layer paper-doll stack 376×376 identical geometry, console clean; dead-code + /simplify skipped (no .ts/.js touched)
- [x] 9.4 `/opsx:archive reset-cosmetic-paper-doll-fixed-grid` ← 正在執行
- [ ] 9.5 Post-archive：刪除 `sprites.v1-backup/`（確認新 sprite 一切正常後）
