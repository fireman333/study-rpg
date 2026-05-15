## Why

`wire-recruitment-gacha` shipped 2026-05-15 with 🩺 emoji placeholders for every doctor card (modal + roster). The recruitment loop now works end-to-end but visually flat — no per-subject identity, no rarity-tier "wow" moment when a P1 drops. `theme-pixel-hospital` scaffold already declared `sprites: {}` with comment「Real roster populated by add-doctor-sprite-roster change」+ `--rarity-p1..p5` CSS frame colors. This change fills the registry.

This change is also the M_2nd track's first **cdx codex `gpt-image-2`** trial point (per Codex Plus trial 2026-05-07 → 2026-06-07). 19 sprites at $0.04 each ≈ $0.76 — small, decisive test of "can cdx produce usable GBA pixel medical doctors with structured prompts" before committing to the full 70-sprite per-subject × per-rarity matrix.

## What Changes

- **Generate 5 default-rarity fallback sprites** in `packages/theme-pixel-hospital/sprites/`:
  - `doctor-default-P5.png`、`doctor-default-P4.png`、`doctor-default-P3.png`、`doctor-default-P2.png`、`doctor-default-P1.png`
  - Each is a generic GBA-pixel doctor (white coat, stethoscope, 384×384 PNG transparent bg)
  - P5 = 「拉完了」 visual cue（neutral / tired pose）; P1 = 「夯」（confident / heroic pose with rarity-1 aura）; intermediate tiers monotonic in visual swagger
  - Frame color encoded via CSS `--rarity-p<n>` var, NOT baked into PNG（separation of concerns）

- **Generate 14 per-subject P3 baseline sprites** — one for each of the 14 二階 subjects at P3「人上人」rarity (the "average competent doctor" tier):
  - `doctor-內科-P3.png`、`doctor-外科-P3.png` ... 14 total
  - Each carries 1–2 subject-relevant props (內科 = stethoscope + chart, 外科 = surgical mask + scalpel, 婦產科 = ultrasound, 精神科 = clipboard, 麻醉科 = anesthesia mask, etc.)
  - GBA palette consistent with `theme-pixel-medical` (cream / wood-frame / muted accent)

- **Sprite registry wiring** in `packages/theme-pixel-hospital/src/index.ts`:
  - Add `sprites.ts` (new file) mirroring `theme-pixel-medical/src/sprites.ts` pattern (Vite `?url` imports for cache-busting)
  - Populate `THEME_PIXEL_HOSPITAL.sprites` map with all 19 keys
  - Naming follows spec: `doctor-<subjectId>-<rarity>` and `doctor-default-<rarity>`

- **App components consume registry** with fallback chain:
  - `RecruitmentResultModal.tsx`、`DoctorRoster.tsx` swap 🩺 emoji for `<img src={lookupSprite(doctor.spriteKey)} />`
  - `lookupSprite(key)` helper implements 3-tier fallback per `recruitment-gacha` spec:
    `doctor-<subjectId>-<rarity>` → `doctor-default-<rarity>` → `doctor-default-P3`（P3 used as ultimate visual fallback since it's the "neutral" tier）

- **Generation workflow doc** in `packages/theme-pixel-hospital/SPRITE_GENERATION.md`:
  - cdx `gpt-image-2` prompt template per sprite type
  - Manual curator review checklist (P1 hard-rule from CLAUDE.md: 「Image Preview = `open`」 — review via macOS `open` not Read tool)
  - Re-generation procedure if a sprite fails QC

**Out of scope**（明確留給後續 changes）：

- Per-subject sprites at P1/P2/P4/P5 rarity tiers（14 科 × 4 rarities = 56 sprites）→ 拆 `add-doctor-sprite-rarity-variants`，等 P3 baseline dogfood 視感 OK 再做
- Hospital scene sprites（診所 / 區域 / 醫學中心 三階段建築）→ 拆 `wire-clinic-level-up`
- Room interior diagrams（outpatient / surgery / ward grid）→ 拆 `wire-hospital-tycoon-engine`
- Animation / idle frames（醫師動作 sprite sheet）→ Out of scope 整個 M_2nd（per project.md，純靜態 sprite）
- 對 sprites 套後處理濾鏡 / dithering / color quantize → 接受 gpt-image-2 raw output，QC 不過再重生

## Capabilities

### New Capabilities

無 — 本 change 是 fulfill `recruitment-gacha` spec 已 declare 的 sprite contract（`doctor.spriteKey` field + fallback chain），不 introduce 新的 capability。

### Modified Capabilities

- `theme-pack-contract`: 不改 contract，只示範 fork（hospital theme 從空 sprites map → 19 entries）。Contract itself 不變。

實際上本 change 只是把已 lock 的契約落地，沒有 spec-level requirement 變動，所以 specs/ delta 空。Tasks.md 是主要 deliverable。

## Impact

- **新檔**:
  - `packages/theme-pixel-hospital/sprites/{doctor-default-P1..P5,doctor-{14 科}-P3}.png` × 19
  - `packages/theme-pixel-hospital/src/sprites.ts`
  - `packages/theme-pixel-hospital/SPRITE_GENERATION.md`
  - `apps/medexam2-hospital-tw/src/lib/sprite-lookup.ts`（fallback chain helper）
- **改 file**:
  - `packages/theme-pixel-hospital/src/index.ts`（populate `THEME_PIXEL_HOSPITAL.sprites`）
  - `apps/medexam2-hospital-tw/src/App.tsx`（import theme registers sprite vars — currently the dep is "unused" per knip; this change re-wires it）
  - `apps/medexam2-hospital-tw/src/components/RecruitmentResultModal.tsx`（emoji → `<img>` + fallback）
  - `apps/medexam2-hospital-tw/src/pages/DoctorRoster.tsx`（同上）
- **Bundle size**: 19 PNGs × ~50 KB avg = ~950 KB added to `theme-pixel-hospital` package. App lazy-loads on demand via Vite chunking; init load impact ≤ 100 KB（only sprites visible on first paint）
- **Cost**: ~$0.76 against Codex Plus trial budget。記錄進 `~/coding-scratch/codex-trial-2026-05-07/trial_log.md` per `/cdx` skill convention
- **No breaking**: 一階 app、core engine、content packs 全不動
- **Telemetry**: 每生成一張 sprite 在 SPRITE_GENERATION.md 記 `<filename> | <prompt seed> | <date> | <accepted/regenerated>` for reproducibility
