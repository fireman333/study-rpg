## Context

`/cram` shipped in `add-neurons-cram-tab` (archived 2026-07-06). All logic lives in one file, [`apps/neurons-tw/src/routes/CramPage.tsx`](../../../apps/neurons-tw/src/routes/CramPage.tsx) (CramPage + CramEvidenceDrawer + CramBlockView + inline styles), fed by lazy `cram.json` via `useCram()`. This change is a pure UI-layout refactor of that single file — no data, schema, sync, or build change. The three open layout micro-decisions were resolved via a Codex (gpt-5.5) second-opinion consult on 2026-07-06.

## Goals / Non-Goals

**Goals:**
- Get one subject's high-yield content (速看重點) in front of the reader with the fewest taps, especially at 390px.
- Surface the whole-page actions (download PDF) and the practice CTA where they are reachable.
- Align user-facing wording to 考古 without touching the internal `push` data field.

**Non-Goals:**
- No change to cram data, honesty constraints, evidence-drawer behavior, practice-mode semantics, PDF source-of-truth, or the no-gate policy.
- No 今日處方箋 × 考前猜題 integration in this change — that is a separately-owned follow-up (design captured in `openspec/decisions/2026-07-06-cram-prescription-integration.md`).

## Decisions

- **Subject navigation: single-select filter chips, not accordion.** Replace `openSubject` accordion + sticky quick-jump anchor row with a `selectedSubject` state driving a grouped filter-chip row (醫學一 / 醫學二). Tapping a chip swaps the panel; nothing expands/collapses. *Rationale:* the accordion + quick-jump were two overlapping navigation affordances for the same "pick a subject" job; a filter collapses them into one and removes 10 subjects' worth of DOM.
- **Default state: auto-select the first subject (Codex 2b).** On entry `selectedSubject` initializes to the first subject so the page always shows content + CTA. *Alternative rejected:* a "請選一科" empty prompt — unnecessary teaching step for a tool page.
- **速看重點: shown directly, no collapse toggle (Codex 2a).** Once scoped to one subject the content volume is small, so drop the `showBlocks` toggle and render blocks directly, first in the panel. *Rationale:* keeping a collapse after already filtering to one subject just re-adds the old accordion friction on 390px.
- **Panel order: 速看重點 → section practice CTA → 考古清單.** The section-level 「用本章高頻概念練幾題」 CTA moves to the top of the 考古清單 (was between the list and the 速看 toggle).
- **Download-PDF row at the very top, under the subtab bar (Codex 2c).** It is a whole-page action, not disclaimer/methodology detail; burying it at the bottom made the most-wanted action the least reachable. Two PDF buttons wrap to two lines at 390px (`flex-wrap`), no horizontal scroll.
- **Rename is display-string-only.** All user-visible 押題 → 考古 (list heading, count chip, disclaimer methodology text, drawer lead). `cram.json` / `build-cram.ts` `push` field is untouched — the spec header keeps 押題清單 as its internal identifier while the body pins the display label to 考古清單.

## Risks / Trade-offs

- **[Losing an anti-manipulation clause during the on-ramp requirement edit]** → the spec delta copies the full on-ramp requirement verbatim and changes only the CTA-placement phrase; all MUST NOT clauses preserved.
- **[Removing `openSubject` / `showBlocks` leaves orphan state or styles]** → the apply step removes `openSubject`, `showBlocks`, `quickJumpStyle`, `quickChipStyle`, `subjectHeaderStyle` (accordion header), and any now-unused imports; `/verify` dead-code audit (knip/eslint) confirms no orphans.
- **[390px horizontal scroll regression from the chip row / download row]** → both use `flex-wrap`; tables already have `overflow-x` wrappers; verified with the Chrome MCP 390px probe.
- **[Rename misses a stray 押題 string]** → grep `押題` across CramPage.tsx after edit; only the internal spec header + code comments referring to the `push` field may remain.
