## Why

The shipped `/cram` (考前猜題) view renders all 11 subjects as always-open, single-open accordions with a sticky quick-jump chip row, hides the 速看重點 tables behind a per-subject toggle, and puts the download-PDF row at the very bottom. On a 390px phone that means a long scroll of nested toggles before the reader reaches any high-yield content, and the most-wanted actions (download the PDF, read the 速看) are the least reachable. This is exam-eve tactical reference — the reader wants one subject's high-yield content fast, not to expand-collapse 11 accordions.

## What Changes

- Replace the single-open subject **accordion** with a single-select subject **filter-chip row** (grouped 醫學一 / 醫學二). Tapping a chip shows only that subject's panel; there is no expand/collapse. Default state auto-selects the first subject so the page has content on entry.
- Within the selected subject, render 速看重點 blocks **first and directly** (no "展開速看重點" collapse toggle — content is already scoped to one subject), followed by the 考古清單.
- Move the section-level 「用本章高頻概念練幾題」 practice CTA to the **top of the 考古清單** (currently between the list and the 速看 toggle).
- Rename all **user-facing** 「押題」 → 「考古」 (押題清單 → 考古清單, count chip label, disclaimer methodology text, evidence-drawer lead). The internal `push` field in `cram.json` / `build-cram.ts` is unchanged — display-string only.
- Move the download-PDF row to the **top**, directly under the subtab bar (above the disclaimer). On 390px the two PDF buttons wrap to two lines with no horizontal page scroll.
- Remove the now-obsolete sticky quick-jump chip row (superseded by the filter chips) and the `openSubject` / per-subject `showBlocks` accordion state.

No data, schema, sync, or build-pipeline change. Honesty constraints (raw counts + tier only, no hit-rate / guarantee), the evidence-first drawer, the practice on-ramp semantics, PDF single-source-of-truth, and the fully-open no-gate policy are all preserved.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-cram-tab`: the per-subject navigation + progressive-disclosure requirement changes from single-open accordions with nested 速看 toggle + sticky quick-jump to a single-select subject filter with 速看-first, no-toggle layout; the user-facing 押題 label becomes 考古; the section practice CTA moves above the 考古 list.

## Impact

- **Code**: `apps/neurons-tw/src/routes/CramPage.tsx` only (single file — CramPage + CramEvidenceDrawer + CramBlockView + styles).
- **Data / schema / sync**: none. `cram.json` shape and internal `push` field unchanged; no Dexie/R2 touch.
- **Build / deploy**: none (no new asset; existing PDFs reused).
- **Tests**: `pnpm --filter @study-rpg/neurons-tw typecheck` + `vitest` (826 baseline) must stay green; Chrome MCP preview smoke (chip select, 速看-first, CTA-on-top, rename, download-on-top) + 390px no-horizontal-scroll probe.
