# Decisions — 2026-06-01: neurons「皮克敏化」direction + ship status

Session handoff. Steers `apps/neurons-tw` toward a Pikmin-style collection feel. Read this + the two grill records before resuming.

## Direction (locked)

- **North star = Pikmin BLOOM**（走路種花 ＝ 讀書答題；圖鑑綁「習慣發生的情境」），NOT 本傳 RTS.
- **本傳「活軍隊」evaluated → mostly rejected for a study app**:
  - ❌ stakes / loss / permadeath — would punish missing study days (demotivating).
  - ❌ answer-reward buffs — perverse incentive (grind the meta vs. actually learn).
  - ❌ in-world RTS command — no spatial substrate; would need a "world" first.
  - ✅ **safe subset = expedition-as-study** (a fielded squad surfaces that family's SRS-due / wrong questions → the loop's only "output" is more studying, not a multiplier). DEFERRED, not built.
- **Core gap being closed**: collected neurons were inert trophies. Bloom fix in 3 moves: (a) give the collection a place to browse, (b) each neuron remembers the study context that grew it, (c) eventually that context shows in the art.

## Sequenced plan + status

1. ✅ **SHIPPED — `add-neurons-variant-collection-view`** (the 圖鑑 itself). `/collection` dex: Pokédex 全 55 槽（已收集卡 + 未收集剪影 + AP 門檻）, family-filter chips (default-all), per-family **set-representative (LWW sync)**, reserved `data-provenance-caption` row. Applied → verified (`/opsx:verify` green) → archived `archive/2026-06-01-…` → commit `07e8efe` → merged main `935253c` → CF Pages deploy → **prod-verified** (SPA three-piece + env baked + console clean) → all 3 CI green. **LIVE: `med-study-rpg.com/neurons/collection`**.
2. ⏳ **NEXT — `add-neurons-variant-provenance`** — proposed, 4/4 artifacts, **UNBLOCKED**, **0/20 tasks**. Fills the reserved caption row with birth-context: `日期 + 答對 N 題該科 + 放電 + 救贖/里程碑/元老`. Captures 3 signals at mint (觸發脈絡 / 錯題救贖 / streak 里程碑; 模擬考脈絡 excluded). Display-only, schema forward-compat for a future context-rarity cut. **Resume: `/opsx:apply add-neurons-variant-provenance`**.
3. ⏸ **DEFERRED — `context-driven-variant-art`** (Bloom「帽子=出身」: same (family,slot) gets context-varied art). This is the right time to batch-gen Gemini art — but only against a locked context→art spec, never blind.
4. ⏸ **DEFERRED — OG share / character card** ("Change B", roadmap M6 social).
5. ⏸ **DEFERRED — expedition-as-study** (the safe 活軍隊 subset above).

## Key technical decisions (this session — don't re-litigate)

- **No Dexie `.version()` bump for provenance**: fields are non-indexed → Dexie persists transparently; `lint:dexie-fixtures` rule (fires only on `.version(N)`) deliberately doesn't trigger. NOT a missed fixture.
- **救贖 signal threading**: `QuizModal` computes `wasRedemption` (triggering question's pre-answer `everWrong`) → `recordCorrectAnswer(family, { wasRedemption })` → `connectome.variantSlotUnlocked` payload. streak里程碑 read by the gacha subscriber at mint (no payload coupling).
- **meta sync is FIRST-WRITE-WINS, not LWW** (`apps/neurons-tw/src/lib/sync/tables.ts` `metaAdapter`). Representative selection therefore uses a **timestamped envelope `{ map, updatedAt }`** + `apps/neurons-tw/src/lib/sync/backfill/representatives.ts` LWW reconcile wired into `runOnPullComplete`. Do NOT assume the meta adapter gives LWW.
- **R2 `SCHEMA_VERSION` sequencing**: collection-view took **5→6**; provenance takes **6→7** (already re-pointed in its proposal/design/spec/tasks).
- **Chips reuse `YearFilterBar` pattern** — neurons-tw has NO shared `.filter-bar` CSS (that's the 二階 `BookmarkFilterBar`). New component: `apps/neurons-tw/src/components/FamilyFilterChips.tsx`.
- **RWD = `repeat(auto-fill, minmax(150px,1fr))`** (matches `DmnCollectionPage`): reflows 6→4→2 cols. Spec corrected away from over-literal "single column on mobile".

## Grill records (full rationale)

- `~/.claude/scratch/grilled-neurons-tw-variant-provenance-2026-06-01.md`
- `~/.claude/scratch/grilled-neurons-tw-variant-collection-view-2026-06-01.md`

## Resume checklist (next session)

1. `/spec resume` (warms project.md + in-progress changes).
2. `/opsx:apply add-neurons-variant-provenance` — fill the `data-provenance-caption` row in `VariantSlotCard` (`apps/neurons-tw/src/routes/CollectionPage.tsx`) + surface in `VariantUnlockModal`.
3. Provenance R2 bump is **6→7** (not 5→6).

## Not mine / untouched (multi-agent worktree)

- `apps/neurons-tw/public/content/neurons-tw/meta.json` dirty = pre-existing, not this work's; left uncommitted.
- Other active changes (`add-hospital-equipment-medexam2`, `add-r2-cloud-sync-migration`, `add-version-check-banner`) belong to other tracks/sessions — untouched. A parallel session shipped `add-neurons-quiz-year-filter` on `track-neurons` during this session (now on main `fb95f8f`).
