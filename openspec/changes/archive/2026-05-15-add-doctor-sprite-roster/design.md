## Context

`wire-recruitment-gacha`（archived 2026-05-15）ships with 🩺 emoji as sprite placeholder for every doctor card; the `recruitment-gacha` capability spec specifies `doctor.spriteKey = "doctor-<subjectId>-<rarity>"` with fallback chain `→ doctor-default-<rarity> → doctor-default`. Theme `theme-pixel-hospital` shipped with `sprites: {}` + explicit comment marking this change as the populating step.

This change is also the **first cdx `gpt-image-2` real-world trial** under Codex Plus subscription (2026-05-07 → 2026-06-07). 19 sprites × $0.04 ≈ $0.76 is a small, decisive test of: (a) can codex produce a usable GBA-pixel medical doctor at 384×384, (b) is the prompt template reproducible across rarities + subjects, (c) does the manual review loop scale to 19 assets, (d) is the result quality enough to defer the remaining 56 per-subject × per-rarity variants to a follow-up change.

`theme-pixel-medical` already established the sprite convention: 384×384 PNG with transparent background, `?url` Vite imports in `src/sprites.ts`, `image-rendering: pixelated` on render. This change forks that convention faithfully.

## Goals / Non-Goals

**Goals:**

- 19 generated sprites (5 default-rarity + 14 per-subject P3 baseline) committed to `packages/theme-pixel-hospital/sprites/`
- Theme registry `sprites` map populated with all 19 keys following the `doctor-<id>-<rarity>` naming spec
- Fallback chain implemented in m2 app's modal + roster (3-tier lookup helper)
- Reproducible cdx prompt templates documented in `SPRITE_GENERATION.md` for future per-rarity variants
- Cost tracked against trial log per `/cdx` skill convention
- Manual review loop catches obvious failures (off-style, wrong subject prop, bad rarity vibe) before commit

**Non-Goals:**

- Per-subject sprites at P1/P2/P4/P5 rarities → `add-doctor-sprite-rarity-variants`（56 sprites，after P3 baseline dogfood）
- Hospital scene sprites（building exteriors / room interiors）→ `wire-clinic-level-up`、`wire-hospital-tycoon-engine`
- Animation / idle frames / sprite sheets → out of scope per project.md（純靜態 sprite）
- Post-processing pipeline（dithering / palette quantize / outline detection）→ accept gpt-image-2 raw output；QC fail → regenerate
- Custom prompt fine-tuning across many iterations → cap at 3 regeneration attempts per sprite before flagging for human override
- Programmatic batch script in CI → 19 sprites runs interactively, batch infra unjustified

## Decisions

### Decision 1: Sprite scope = 5 default-rarity + 14 per-subject P3 (19 total)

**選擇**：

| Sprite | Count | Rationale |
|---|---|---|
| `doctor-default-{P5,P4,P3,P2,P1}.png` | 5 | Fallback chain terminus — covers every roll that lacks per-subject sprite |
| `doctor-{14 科}-P3.png` | 14 | Per-subject identity at P3「人上人」(weight 10%, the "competent average doctor" tier) |
| **Total** | **19** | Cost: 19 × $0.04 ≈ $0.76 |

**理由**：
- Minimum to make every roll produce a visible image (fallback chain bottoms out at `doctor-default-P3`)
- P3 chosen as per-subject baseline because: (a) it's the visual "neutral" tier (人上人 = average competent, not the extreme dazzle of P1 or wreckage of P5), so a single sprite per 科 reads naturally without forcing per-rarity variant on every subject; (b) 10% drop rate means roughly 1 in 10 rolls shows per-subject identity — frequent enough to feel rewarded, not so frequent it loses charm
- Skips per-subject × 4 other rarities (56 sprites) — defer to `add-doctor-sprite-rarity-variants` after dogfooding P3 baseline visuals

**Alternative**：
- 70 sprites (14 × 5 full matrix): $2.80, blowsup trial budget, hard to QC in one session — rejected
- 5 sprites only (default-rarity, zero per-subject): too generic, defeats the "each 科 has its own doctor" recruitment fantasy — rejected
- 14 per-subject only (no default-rarity): fallback chain broken for non-P3 rarities — rejected

### Decision 2: Sprite format = 384×384 PNG, transparent bg, GBA palette

**選擇**：Match `theme-pixel-medical/sprites/character-base.png` convention exactly:
- 384×384 px (3x scale of original 128×128 native GBA sprite resolution for crisp `image-rendering: pixelated` upscale)
- PNG with alpha channel, transparent background
- GBA-era palette: cream / muted earth tones / 16-color limit (gpt-image-2 doesn't strictly enforce — prompt asks for it, accept reasonable approximation)
- `image-rendering: pixelated` in CSS (already set on `body` in m2 styles.css)

**理由**：consistency with `theme-pixel-medical` is the lock-in from `hospital-management-mode` Decision 6 design. Departure would create visual fork between two themes, defeating the "GBA pixel連續感" between 一階 / 二階 apps.

**Alternative**：smaller 128×128 native (saves bandwidth, ~10 KB each instead of ~50 KB) — rejected, gpt-image-2 minimum useful resolution is higher; would require post-processing downscale which we deferred.

### Decision 3: Generation = cdx codex `gpt-image-2` via `/cdx image`

**選擇**：Use `/cdx image "<prompt>"` (per skill router rule) — wraps codex CLI gpt-image-2, OAuth-authenticated, auto-logs to `~/coding-scratch/codex-trial-2026-05-07/trial_log.md`.

**Workflow per sprite**：

```
1. Compose prompt from template (Decision 4)
2. /cdx image "<prompt>" → saves to /tmp/codex-image-<n>.png
3. Curator preview: `open /tmp/codex-image-<n>.png` (macOS) per CLAUDE.md「Image Preview = `open`」
4. Curator accepts → mv to packages/theme-pixel-hospital/sprites/<filename>.png
   Curator rejects → regenerate with prompt tweak (max 3 attempts before flag)
5. trial_log.md gets auto-appended entry: filename | prompt | verdict
```

**理由**：
- `/cdx image` is the canonical tool per global Skill Router rule
- OAuth auth means no API key juggling
- Trial log integration provides month-end evidence for Codex Plus continuation decision
- Manual review per sprite (vs batch-then-review) catches off-style early before propagating prompt errors across 19 generations

**Alternative**：
- Direct codex CLI without /cdx wrapper — bypasses trial log, breaks router convention
- Other image gen (Gemini imagen / Stable Diffusion) — not part of trial scope
- Hand-pixel artist commission — out of timeframe + cost-bracket

### Decision 4: Prompt template structure (rarity tier + subject prop injection)

**選擇**：Two-template approach:

**Template A — default-rarity (`doctor-default-P<n>.png`)**:

```
GBA-era pixel art doctor sprite, 384x384 pixels, transparent background, 16-color palette (cream/wood/muted accent matching Game Boy Advance medical RPG style). 
Subject: a generic doctor wearing white coat, holding a stethoscope.
Rarity expression (P<n> = <label>): <pose-descriptor>
Style: nearest-neighbor pixel rendering, no anti-aliasing, no smooth gradients. Front-facing, centered, full body visible.
```

Pose-descriptor mapping:
- P5「拉完了」: tired, slumped, wrinkled coat, exhausted expression
- P4「NPC」: neutral standing pose, blank expression, generic appearance
- P3「人上人」: alert competent posture, slight confident smile, well-kept coat
- P2「頂級」: confident pose, polished appearance, faint glow accent
- P1「夯」: heroic pose, gleaming coat, aura/sparkles, intense gaze

**Template B — per-subject P3 (`doctor-<subject>-P3.png`)**:

```
GBA-era pixel art doctor sprite, 384x384 pixels, transparent background, 16-color palette (cream/wood/muted accent matching Game Boy Advance medical RPG style).
Subject: a <subject-專科> specialist, alert competent posture, slight confident smile, well-kept white coat.
Specialty props: <subject-prop>
Style: nearest-neighbor pixel rendering, no anti-aliasing, no smooth gradients. Front-facing, centered, full body visible.
```

Subject-prop mapping (locked in `SPRITE_GENERATION.md` for reproducibility):
| Subject | Prop |
|---|---|
| 內科 | stethoscope + patient chart |
| 外科 | surgical mask + scalpel |
| 小兒科 | small teddy bear + child-friendly stethoscope |
| 婦產科 | ultrasound wand + clipboard |
| 精神科 | clipboard + thoughtful gesture |
| 復健科 | resistance band + walker icon |
| 神經內科 | reflex hammer + brain diagram chart |
| 家醫科 | doctor bag + family-friendly pose |
| 皮膚科 | magnifying glass + dermatoscope |
| 麻醉科 | anesthesia mask + IV bag |
| 骨科 | X-ray of bone + hammer |
| 耳鼻喉科 | otoscope + tongue depressor |
| 眼科 | ophthalmoscope + eye chart |
| 泌尿科 | catheter symbol + clipboard |

**理由**：
- Template-based prompting maximizes consistency across 19 generations (same style modifier line in every prompt)
- Per-subject prop is the **only varying part** in Template B — keeps every per-subject sprite recognizably "same artist same world"
- Pose-descriptor mapping makes rarity ladder visually monotonic (matches `hospital-management-mode` Decision 5 power-only rarity axis)

**Open**：
- Whether to add a `[rarity-color frame baked-in]` modifier vs leaving frame as CSS var only. Decision: **NOT bake in** — frame stays as `--rarity-p<n>` border CSS; PNG focuses purely on character art. Allows the same sprite to be reused for any rarity tier if we later want（not planned for this change）.
- Cultural sensitivity for subject-prop choices: subject-prop table reviewed for stereotyping. 麻醉科 / 精神科 are abstract enough; 婦產科 ultrasound is appropriate; 復健科 resistance band is non-stereotyped. No subject reduces to a single demographic.

### Decision 5: Storage path = `packages/theme-pixel-hospital/sprites/` (in-repo)

**選擇**：Commit 19 PNGs into the theme package's `sprites/` directory, alongside `src/sprites.ts` registry. Total binary footprint ~950 KB.

**理由**：
- Matches `theme-pixel-medical` convention exactly (its `sprites/` is ~25 files all in-repo)
- Vite `?url` import + content-hash chunking gives cache-friendly URLs at build time
- M3 npm publish path: theme package ships with sprites inlined — third-party fork can copy and overwrite per-sprite without rebuild infrastructure

**Alternative**：
- CDN / external host — premature for pre-1.0, GH Pages serves them fine
- Lazy-load from app's `public/` instead of theme package — breaks "theme owns its visual assets" boundary

### Decision 6: Fallback chain implementation in `apps/medexam2-hospital-tw/src/lib/sprite-lookup.ts`

**選擇**：Pure helper, no React state:

```typescript
export function lookupSprite(
  spriteKey: string,
  spritesMap: Record<string, string>,
  rarity: Rarity,
): string {
  if (spritesMap[spriteKey]) return spritesMap[spriteKey]
  const defaultKey = `doctor-default-${rarity}`
  if (spritesMap[defaultKey]) return spritesMap[defaultKey]
  return spritesMap['doctor-default-P3']  // ultimate fallback
}
```

Caller: `lookupSprite(doctor.spriteKey, THEME_PIXEL_HOSPITAL.sprites, doctor.rarity)`.

**理由**：
- Implements the 3-tier spec exactly: `doctor-<subjectId>-<rarity>` → `doctor-default-<rarity>` → `doctor-default-P3`
- Pure function = trivially testable (vitest later if added)
- Final fallback to `doctor-default-P3` instead of imaginary `doctor-default` simplifies; P3 = neutral tier is sensible "generic doctor"

**Alternative**：
- Build the fallback into React component as inline ternary — works but spreads logic; helper is cleaner if 2 components consume

### Decision 7: QC workflow = curator reviews each, regenerate if fail, cap 3 attempts

**選擇**：

For each sprite:
1. Generate via `/cdx image "<prompt>"`
2. Curator opens result with macOS `open` (per CLAUDE.md「Image Preview = `open`」)
3. Curator applies QC checklist:
   - [ ] Looks like a doctor (white coat or recognizable medical garb)
   - [ ] Pose/expression matches rarity tier descriptor
   - [ ] Subject prop visible and identifiable (per-subject sprites only)
   - [ ] GBA-pixel style consistent with `theme-pixel-medical/character-base.png`
   - [ ] No text artifacts / no broken faces / no off-frame cropping
   - [ ] Transparent background (no checkerboard bleed-through)
4. Pass → commit to `sprites/`; Fail → tweak prompt + regenerate
5. Cap: 3 regeneration attempts. Beyond 3 → mark sprite "TBD-deferred", proceed; create issue in tasks.md

**理由**：
- Hard cap prevents perfection-chasing on edge cases (e.g. 精神科 might be visually abstract, accept "doctor + clipboard" if 3 tries don't yield strict win)
- 3 attempts × 19 sprites × $0.04 = max $2.28 worst case (still well under trial budget)
- Manual review per generation is feasible at scale of 19 — would not be feasible at 70+

### Decision 8: Trial log telemetry

**選擇**：每張 sprite 生成後 cdx skill 自動 append 一行到 `~/coding-scratch/codex-trial-2026-05-07/trial_log.md`：

```
| 2026-05-15 | doctor-default-P3.png | <prompt hash> | accepted | $0.04 |
```

Followed by SPRITE_GENERATION.md update with the sprite filename + final accepted prompt + date + attempt count for reproducibility.

**理由**：
- `/cdx` skill convention already does the trial_log.md append
- Per-sprite SPRITE_GENERATION.md row gives future maintainers the exact prompt to regenerate if a sprite needs touch-up
- Month-end (2026-06-07) trial review references this data to decide Codex Plus continuation

## Risks / Trade-offs

- **[Risk] gpt-image-2 produces "western anime" instead of GBA pixel** → Mitigation: prompt template hard-codes "nearest-neighbor, no anti-aliasing, GBA palette". If first 2 of 19 sprites still look anime → STOP, revise prompt template, restart. Don't blow $0.76 on consistent-but-wrong style.

- **[Risk] Subject props read as stereotypes（e.g. 婦產科 = pregnant patient instead of ultrasound wand）** → Mitigation: subject-prop table in Decision 4 picks tools/instruments, not patient archetypes. Curator review explicitly checks for stereotyping.

- **[Risk] Rarity tiers (P5..P1) don't read as a visual ladder — all look similar** → Mitigation: pose-descriptor mapping is explicit in prompt; if first batch (5 default-rarity sprites) looks too similar across tiers, augment prompt with stronger differentiation cues (P1 "with golden aura, dramatic lighting"; P5 "tired, slumped"). Curator review is the gate.

- **[Risk] 384×384 file size larger than expected, bundle bloat** → Acceptance: budgeted ~1 MB. If actual >>1.5 MB → optimize via `pngquant` lossy compress post-generation (off-spec but cheap). Don't downscale resolution.

- **[Risk] Curator review takes >1 hour for 19 sprites + regenerations** → Acceptance: this IS the trial. The data on review time per sprite is itself the answer to "should we do the 56-sprite follow-up". Slow review → expensive scaling → reconsider strategy.

- **[Risk] cdx codex CLI fails / OAuth expires mid-generation** → Mitigation: cdx skill has auth check at start; failure mode = skip remaining sprites, ship with what's done + emoji fallback for the rest. m2 app keeps the emoji fallback path as belt-and-suspenders until 19/19 lands.

- **[Trade-off] Default-rarity sprites carry most of the "doctor-ness" load** → 5 sprites bear ~90% of player-visible variety (only ~10% of rolls hit a P3 per-subject). Accepted; this change is explicitly a vertical slice and the asymmetry is the trade-off vs. doing 70 sprites all at once.

- **[Trade-off] Manual review loop doesn't scale to 70+** → Accepted; this change is sized for 19. If dogfood approves the style + workflow, `add-doctor-sprite-rarity-variants` follow-up can iterate on workflow（script-driven batch + spot-check QC instead of per-sprite review）.

## Migration Plan

- **一階 app**: 零影響
- **二階 app**: m2 modal + roster swap emoji `<span>` for `<img>` element. Visual change is additive (sprites appear where emoji was). Existing IndexedDB save files unchanged — `doctor.spriteKey` field was already populated by `wire-recruitment-gacha` service layer, just wasn't displayed
- **Theme pack**: `theme-pixel-hospital` deps re-wired into App.tsx import side, fixing knip's "unused dep" flag noted at end of `wire-recruitment-gacha`
- **Rollback**: If sprite roster is critically broken, revert this change → m2 app falls back to emoji visually; data integrity untouched

## Open Questions

- **Should default-rarity sprites be gender-neutral or include both M/F variants?** Decision: gender-neutral for this change (one sprite per rarity). Gender variants future-considered in `add-doctor-sprite-rarity-variants` if dogfood feedback requests it.

- **What's the ultimate fallback if even `doctor-default-P3.png` somehow fails to load?** Decision: keep emoji 🩺 in modal/roster as ultimate-ultimate fallback (browser-level: `<img onError={...show emoji...}>`). Defensive belt-and-suspenders; should never fire in practice.

- **Do we ship sprites uncompressed or run `pngquant` / `optipng`?** Decision: ship as gpt-image-2 outputs (no post-process) for this change; revisit if total bundle >2 MB. Keeps cdx output verbatim for reproducibility.
