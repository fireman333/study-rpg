## Tasks

### Sprite generation

- [ ] **T1**: Add `character-base-female` entry to `packages/theme-pixel-medical/scripts/sprites.manifest.json`（prompt 對齊 male，僅換 subject + hair description）
- [ ] **T2**: Run `pnpm --filter @study-rpg/theme-pixel-medical generate-sprites -- --keys=character-base-female`，~150s
- [ ] **T3**: Read 生成的 sprite — vibe check 跟 male 一致

### Code wire-in

- [ ] **T4**: Update `packages/core/src/types.ts` — `Player` 加 `characterSpriteKey?: string`（optional, non-breaking）
- [ ] **T5**: Update `packages/core/src/lib/xp.ts` `newPlayer()` — 不主動填 `characterSpriteKey`（讓它預設 undefined → fallback 'character-base'）
- [ ] **T6**: Update `packages/theme-pixel-medical/src/sprites.ts` — 加 female import + map entry `'character-base-female'`
- [ ] **T7**: Update `apps/medexam-tw/src/components/CharCard.tsx` — 加 ◀ ▶ toggle 按鈕 + `onCycleVariant` prop
- [ ] **T8**: Update `apps/medexam-tw/src/App.tsx` — 加 `cycleVariant(direction)` handler + `VARIANTS` const + 解析 charSprite 用 fallback
- [ ] **T9**: Update `apps/medexam-tw/src/styles.css` — 加 char-toggle button 樣式（absolute-positioned over sprite frame）

### Verify

- [ ] **T10**: `pnpm -r typecheck` 全綠
- [ ] **T11**: Chrome MCP smoke：載入 → click ▶ → 確認 sprite 切到 female + Player.characterSpriteKey 更新 → click ◀ 切回 → confirm
- [ ] **T12**: Backward compat 測試 — 用 newPlayer 預設 player (no characterSpriteKey) confirm 仍 render male sprite

### Archive prep

- [ ] **T13**: `openspec validate --changes`
- [ ] **T14**: `/opsx:verify`（需重啟 Claude Code）
- [ ] **T15**: `/opsx:archive add-female-character-option`（會 sync 進 main `specs/character-system/spec.md` — 但需先 archive `add-character-and-sprites` 才能 sync 本 change）
- [ ] **T16**: auto-git commit
