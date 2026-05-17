## Why

二階 hospital mode 目前的 doctor sprite roster 全部是男醫師（14 個 subject × P3 baseline + 5 個 rarity defaults，均 male-presenting），缺乏性別代表性。同時 `redesign-hospital-economy` 引入第 4 階「國家級教學醫院」但只有 tier1/2/3 scene asset，第 4 階沒對應視覺。本 change 兩件事打包處理：(1) 增加 female 醫師 sprite variants 平衡性別比；(2) 加 tier4 hospital scene asset。

## What Changes

### Doctor sprite gender balance

- **新增 14 張 P3 female variants** — 每個 subject 一張 `doctor-{subject}-P3-female.png`，prompt stem 跟現有 P3 一致但加「female, shoulder-length hair」描述符
- **修改 recruitment gacha sprite resolution** — `doctor.spriteKey` 從固定 `doctor-{subject}-{rarity}` 改為 50/50 隨機選 `doctor-{subject}-{rarity}` 或 `doctor-{subject}-{rarity}-female`（後者只在 theme pack 提供時生效；不存在則 fallback to male）
- **fallback chain 維持**：`doctor-{subject}-{rarity}-female`（if exists） → `doctor-{subject}-{rarity}` → `doctor-default-{rarity}` → `doctor-default-P3`

### Tier 4 hospital scene

- **新增 1 張 `hospital-tier4-national.png`** — 768×384，prompt 描述 prestigious national academic medical center (helipad / research wings / national flags)
- **修改 theme-pixel-hospital `scenes.ts`** — `HOSPITAL_SCENES` type 從 `{ tier1, tier2, tier3 }` 擴成 `{ tier1, tier2, tier3, tier4 }`；glob 自動拾起新檔
- **修改 `HospitalScene.tsx`** — `TIER_TO_KEY` 把 `國家級教學醫院` 從目前 reuse `tier3` 改成獨立 `tier4` key

## Capabilities

### Modified Capabilities

- `recruitment-gacha`: spriteKey resolution 加 gender variant 50/50 random pick + female fallback chain
- `hospital-scene`: HOSPITAL_SCENES 加 tier4，TIER_TO_KEY 映射 `國家級教學醫院` 到 `tier4`

## Impact

- **Code**:
  - `packages/theme-pixel-hospital/src/scenes.ts` — `HOSPITAL_SCENES` 型別 + glob 結果加 tier4
  - `apps/medexam2-hospital-tw/src/services/recruitment.ts` — roll path 改 random sprite picker
  - `apps/medexam2-hospital-tw/src/components/HospitalScene.tsx` — TIER_TO_KEY 加 `國家級教學醫院 → tier4`
- **Assets**:
  - `packages/theme-pixel-hospital/sprites/doctor-{14 subjects}-P3-female.png` — 14 新檔
  - `packages/theme-pixel-hospital/sprites/scenes/hospital-tier4-national.png` — 1 新檔
- **Spec dependencies**:
  - `redesign-hospital-economy` 已加 `國家級教學醫院` 到 `HospitalTier` union；本 change 補上對應 scene asset
  - Existing P3 male sprites 保留不動；fallback chain 確保未生 female variant 的 rarity (P1/P2/P4/P5) 仍工作
- **Backwards compat**:
  - 既有玩家存檔的 `doctor.spriteKey` 維持原值，下次抽卡才走新 random picker。手動 regen 醫師 sprite (將來 spec) 可用 dev tool。
- **DEI 考量**:
  - 14 個 female P3 variants 對齊 14 個 male P3 baseline，50/50 random pick 確保長期 expected gender ratio 達 0.5
  - Female sprite prompt 用 "shoulder-length hair, alert competent posture" — 避免 stereotypical / sexualized depictions
  - 只生 P3 baseline（gacha 主要 distribution tier），P1/P2/P4/P5 fallback to default-{rarity}（其中 default 也是 male-coded）— follow-up change 可擴
- **Cost estimate**: 15 codex `$imagegen` calls (14 sprites + 1 scene) ≈ 45 min wallclock 一次性
