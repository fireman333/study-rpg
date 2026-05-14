## Tasks

### Subagent: sprite generation pipeline

- [ ] **T1**: 寫 `packages/theme-pixel-medical/scripts/sprites.manifest.json` — 21 entries（1 character + 20 items + 4 slot placeholders）。styleAnchor + negativePrompt 共用、per-sprite prompt 各自
- [ ] **T2**: 寫 `packages/theme-pixel-medical/scripts/generate-sprites.ts` — 讀 manifest、batch invoke `cdx image`，輸出 `packages/theme-pixel-medical/sprites/*.png`
- [ ] **T3**: **Smoke gate** — 生前 3 張 (`character-base` + `alpha1-adrenergic` (N) + `cytochrome-p450` (UR))，halt + SendMessage 給主 thread 附 preview path
- [ ] **T3.5**: 主 thread review smoke → 回 subagent `continue` 或 `abort`
- [ ] **T4**: Subagent 收 `continue` → 生剩 18 張（17 item + 4 slot placeholder = 21 - 3 已生 - 但 wait 4 placeholder 也算 batch，total 25 sprites; revise count: 1 character + 20 items + 4 placeholders = 25。Smoke 3 後剩 22）
- [ ] **T5**: Subagent 把生成完的 manifest 寫進 `manifest.results.json`（含 file checksum、generation timestamp）以便日後 audit

### Main thread: wire into UI

- [ ] **T6**: 更新 `packages/theme-pixel-medical/src/index.ts` — 填 `THEME_PIXEL_MEDICAL.sprites` map（25 entries），用 Vite ?url import
- [ ] **T7**: 更新 `apps/medexam-tw/src/App.tsx`：
  - 加入 character sprite + name input area
  - 加入 2×2 equip slots grid
  - 加入 inventory modal/panel（filtered by slot）
  - reveal 加 item sprite
  - equip/unequip click handlers
- [ ] **T8**: 新增 `components/character/CharSprite.tsx`、`components/character/EquipSlots.tsx`、`components/loot/InventoryGrid.tsx`（拆出可重用 component）
- [ ] **T9**: 更新 `apps/medexam-tw/src/styles.css` 加 sprite-related 樣式（pixelated rendering、rarity outline、slot tile grid）
- [ ] **T10**: 跑 `pnpm -r typecheck` 全綠

### Smoke test

- [ ] **T11**: Dev server 手動 verify (Chrome MCP)：
  - Character sprite 顯示
  - 4 個 empty slot 顯示 placeholder
  - 抽 10 張卡 → 確認 reveal 顯示 item sprite + inventory tile 累積
  - 點 inventory 一個 head 道具 → 確認裝備上 head slot
  - 點裝備的 slot → 確認 unequip 回 inventory
  - 點 inventory 另一個 head 道具 → 確認替換（舊的回 inventory）
  - Name input 改名 → confirm 存進 state
- [ ] **T12**: 跑 10k loot smoke（`scripts/loot-smoke.mjs`）確認 distribution 不變

### Archive prep

- [ ] **T13**: `openspec validate --changes`
- [ ] **T14**: `/opsx:verify`（需重啟 Claude Code）
- [ ] **T15**: `/opsx:archive add-character-and-sprites`
- [ ] **T16**: auto-git commit
