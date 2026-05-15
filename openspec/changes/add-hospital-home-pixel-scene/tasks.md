## 1. Asset generation (codex `$imagegen`, parallel batch)

- [x] 1.1 Read `~/.claude/imports/codex_image_gen.md` 配方 + verify codex CLI 可用 (`codex --version`)
- [x] 1.2 Verify Codex Plus quota 仍在 trial entry (2026-05-07 → 2026-06-07)
- [x] 1.3 Codex gen tier 1 scene: `/tmp/hospital-tier1-clinic.png` (single-story clinic, 1 tree, sign)
- [x] 1.4 Codex gen tier 2 scene: `/tmp/hospital-tier2-regional.png` (2-3 buildings, ambulance entrance, trees)
- [x] 1.5 Codex gen tier 3 scene: `/tmp/hospital-tier3-medical-center.png` (4-5 buildings, helipad, campus)
- [x] 1.6 Visual review: 並置 3 scene + doctor sprite 看風格一致性；不通過 → re-gen 該 tier
- [x] 1.7 Move final 3 PNG 到 `packages/theme-pixel-hospital/sprites/scenes/`
- [x] 1.8 Verify each PNG: 768×384、transparent bg、< 120 KB；不通過 → 16-color quantize 重壓

## 2. Theme config (theme-pack-contract delta)

- [x] 2.1 Update `packages/theme-pixel-hospital/src/index.ts`：加 `scenes: { tier1, tier2, tier3 }` 指向新 PNG paths
- [x] 2.2 加 `doctorSlotPositions: { tier1: [2 slots], tier2: [5 slots], tier3: [8 slots] }`；tier 3 座標先佔位 (e.g. 100, 200, 300, 400, 500, 600, 200, 400)
- [x] 2.3 Update `packages/core/src/types.ts` `ThemePack` interface：加 optional `scenes?: { tier1, tier2, tier3 }` + `doctorSlotPositions?: Record<HospitalTier, SlotPosition[]>`
- [x] 2.4 Update `SlotPosition` type：`{ room: 'ward' | 'outpatient' | 'surgery'; x: number; y: number }`
- [x] 2.5 `pnpm --filter @study-rpg/core build` (cold checkout / theme 重建必要)
- [x] 2.6 `pnpm -r typecheck` 確認 type drift 0

## 3. Components

- [x] 3.1 Build `apps/medexam2-hospital-tw/src/components/HospitalScene.tsx`
  - Reads `useGameStore` for `hospital.tier`, assigned doctors
  - Reads `THEME_PIXEL_HOSPITAL.scenes[tier]` for asset path
  - Reads `THEME_PIXEL_HOSPITAL.doctorSlotPositions[tier]` for slot coords
  - Filters doctors by subject → maps to room → renders sprites at slots
  - Container has fixed height 240–320 px
  - Click handler → opens `<UpgradeModal>`
  - URL query `scene=off` → return null
  - `<img onError>` graceful failure handler
- [x] 3.2 Build `apps/medexam2-hospital-tw/src/components/UpgradeModal.tsx`（若 component 不存在）
  - Props: `isOpen`, `onClose`, current tier
  - Shows current tier name + next tier + threshold + progress bar
  - "升級" button (enabled / disabled based on reputation threshold)
  - "關閉" button or backdrop click 關
  - Tier 3 max → 顯示「已達最高 tier」instead of upgrade button
- [x] 3.3 Add SUBJECT_TO_ROOM mapping (14 科 → ward/outpatient/surgery)，建議放 `packages/content-medexam2-tw/src/subjectToRoom.ts` 或 reuse `wire-hospital-reputation` 既有 mapping (檢查現有 source code)
- [x] 3.4 Add CSS：HospitalScene container styles（mobile / desktop responsive、max-width 700px、max-height 320px、置中）
- [x] 3.5 Add CSS：UpgradeModal styles（如 design.md spec），sync with既有 pixel-hospital theme colors

## 4. Integration

- [x] 4.1 Update `apps/medexam2-hospital-tw/src/routes/HomePage.tsx`：在 top bar 之下、status text 之上插入 `<HospitalScene />`
- [x] 4.2 確認 HomePage 既有 layout 不破：top bar / status text / stats / nav buttons 全部保留
- [x] 4.3 確認 `<HospitalScene>` 不影響 `<UpgradeModal>` 之外的 click handlers
- [x] 4.4 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` 本機跑起來，瀏覽 `http://localhost:5173/study-rpg-m2/`

## 5. Local verify (dev server)

- [x] 5.1 Chrome MCP preflight: `list_connected_browsers`
- [x] 5.2 Navigate to `http://localhost:5173/study-rpg-m2/` — 確認 scene 顯示 tier 1（診所）+ 0 doctors（roster 空）
- [x] 5.3 Roster 招募 1 個內科 doctor → 確認 scene 上 ward slot 顯示該 doctor sprite
- [x] 5.4 Roster 招募 1 個家醫科 doctor → 確認 scene 上 outpatient slot 顯示
- [x] 5.5 點 scene → 確認 UpgradeModal 開啟、進度 bar 正確、button 狀態正確
- [x] 5.6 Hack state 把 `hospital.tier` 改 `'區域醫院'` → 確認 scene 切換 tier 2、slot 數量變 5
- [x] 5.7 Mobile viewport (DevTools 375px) → 確認 scene 等比縮放、max-height 320
- [x] 5.8 加 `?scene=off` → 確認 scene 消失、status text 仍正常
- [x] 5.9 Console errors 掃 0 (尤其 asset 載入)

## 6. Build verify

- [x] 6.1 `pnpm --filter @study-rpg/medexam2-hospital-tw build` — bundle size 增量 < 0.5 MB
- [x] 6.2 `pnpm -r typecheck` — 0 errors
- [x] 6.3 Preview build：`pnpm --filter @study-rpg/medexam2-hospital-tw preview`，再跑一次 5.x verify subset

## 7. Prod deploy + verify

- [ ] 7.1 commit + push origin track-m2（auto-git template：`feat(hospital-scene): tier-based pixel scene + subject-bound doctor slots + upgrade modal`）
- [ ] 7.2 確認 GH Actions deploy.yml build 出來的 hospital subpath 含新 assets
- [ ] 7.3 merge track-m2 → main、push、watch deploy run
- [ ] 7.4 Chrome MCP prod verify on `https://fireman333.github.io/study-rpg/hospital/`：
  - Scene 顯示 tier 1
  - 點 scene → modal
  - Hash route `#/roster` 還是正常（regression）
  - F5 on hash route + back to home → scene 仍 render
- [ ] 7.5 加 `?scene=off` prod verify → fallback path 正常

## 8. Spec archive

- [ ] 8.1 跑 `openspec validate add-hospital-home-pixel-scene` — 0 errors
- [ ] 8.2 跑 `/opsx:archive add-hospital-home-pixel-scene` — sync delta 進 main specs
- [ ] 8.3 auto-git commit archive merge：`spec(archive): merge add-hospital-home-pixel-scene — hospital-scene capability + theme-pack-contract scenes/slots fields`
- [ ] 8.4 Update `openspec/decisions/2026-05-15.md` (或當日新 file) 紀錄 dogfood telemetry 觀察點：scene asset 風格 / slot 座標微調空間 / mobile 表現
