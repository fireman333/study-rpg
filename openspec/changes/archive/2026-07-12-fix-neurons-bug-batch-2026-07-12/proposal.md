# fix-neurons-bug-batch-2026-07-12

L2 batch fix for four dogfood bug reports (Supabase `bug_reports`, all `app = neurons-tw`,
reported 2026-07-11). Each is an isolated, low-risk fix in this repo (`track-neurons`);
none share code so they are batched into one change per the Bug Triage Workflow.

## Why

| # | Supabase id | Severity | Symptom |
|---|---|---|---|
| 1 | `df577466` | annoying (P2) | HelpMenu 說明選單: some emoji render as native system glyphs, not pixel-art |
| 2 | `c28e1541` | annoying (P2) | 連結神經元 card shows only the family/cell-type persona, dropping 科目 — player can't tell which subject linked |
| 3 | `9ac0d676` | minor (P3) | 114-1-醫學二-病理學-Q80 詳解 PDF jumps to printed page 9, actual page is 6 |
| 4 | `03156d3b` | minor (P3) | Repeated 回報 lands on the previous submission's success screen; must reload to file another |

### Root causes

1. **Emoji coverage gap.** `HelpMenu.tsx` routes only its section/category `icon` fields through
   `<EmojiIcon>`. The `📄` 原始詳解 PDF and `♻` 重置帳號 section icons had no sprite in
   `emoji-icons.ts`, so they fell back to native glyphs sitting next to 18 pixelated siblings;
   additionally most inline body-prose emoji were raw literals bypassing `<EmojiIcon>` entirely.
2. **Dropped 科目.** `ConnectorSection.labelOf` mapped `subject.id → shortFamilyLabel(displayName)`,
   returning only the English cell-type persona. The 科目 (which IS the `id`) never surfaced.
3. **Whole-booklet page drift.** The provenance map for booklet `114-1-醫學二` was built from the
   owner's local `114-1_醫學二總檔案（修訂版）.pdf` (148 pp), but the app serves a **different
   edition** via Drive autofetch — `114-1 醫學二 國考詳解.pdf` (145 pp). Editions paginate
   page-by-page differently → cumulative drift (0 at the front → −3 by the end; a +1 zigzag in the
   免疫 section). PyMuPDF confirmed Q80's 病理 詳解 card is on served page 118 (printed label **6**),
   while the map sent 118→121 (printed label 9) — exactly matching the report. Same class as the
   already-fixed `114-1-醫學一` drift.
4. **Persisted success state.** `BugReportModal` (HelpMenu 🩺) is always mounted and returns `null`
   when `open` is false, so its `result` state survives a close/reopen — `result.ok` still true →
   reopening lands on 「已送出」. (The inline `QuizBugReportSheet` / `QuestionBugReportSheet` are
   conditionally mounted and unmount on close, so they are unaffected.)

## What Changes

1. **Emoji.** Generate `📄 1f4c4` / `♻ 267b` / `🗺 1f5fa` pixel sprites via the pack's codex
   `gpt-image-2` + ImageMagick formula; register them in `emoji-icons.ts` (fixes the two raw
   section icons automatically since they already flow through `<EmojiIcon>`). Wire the remaining
   raw body-prose emoji in `HelpMenu.tsx` through `<EmojiIcon>` (all already in the pack).
2. **Connector label.** `labelOf` now returns `科目（cell-type）`, e.g. `藥理學（VTA Dopaminergic）`,
   mirroring `CollectionPage.familyDisplayLabel`. Fixes both the visible pair label and the
   aria-label.
3. **PDF provenance.** Pin all 100 mapped questions of booklet `114-1-醫學二` to their served-Drive
   pages in `verified-overrides.json` (0-based; `file` = the served Drive name), verified card-by-card
   against the served PDF with PyMuPDF. The build re-emits the map (Q80 → page 118 = printed page 6).
4. **Bug-report reset.** Add a `useEffect` in `BugReportModal` that resets the whole form (category /
   severity / fields / opt-outs / `result`) whenever `open` transitions to true, so each open starts
   fresh.

## Impact

- **Affected specs (ADDED requirements only — no existing wording changed):** `ui-emoji-icons`
  (HelpMenu full emoji coverage), `neurons-connector-family` (connector label surfaces 科目),
  `neurons-bug-report` (submission modal resets on reopen). **Bug #3 needs no delta** — pinning
  pages in `verified-overrides.json` is exactly the existing `neurons-explanation-pdf-provenance`
  「Human-verified override bypasses the automated gates」 requirement working as specced.
- **Affected code:** `apps/neurons-tw/src/components/HelpMenu.tsx`, `.../BugReportModal.tsx`,
  `.../ConnectorSection.tsx`, `apps/neurons-tw/src/lib/emoji-icons.ts`,
  `apps/neurons-tw/public/icons/emoji/{1f4c4,267b,1f5fa}.png` + `CREDITS.md`,
  `packages/content-neurons-tw/provenance/verified-overrides.json`.
- **No schema / sync / migration.** No Dexie bump, no R2 SCHEMA_VERSION bump, no SYNCED_META_KEYS
  change. `verified-overrides.json` feeds the build-time provenance map only (the built
  `public/provenance/question-pdf-map.v1.json` is gitignored, regenerated on deploy).
- **Scope of fix #3:** only the reported booklet `114-1-醫學二` is re-paginated, per the owner's
  standing policy (fix the reported booklet, do not audit all 44). Other booklets may share the class
  and can be fixed the same way when reported.
- **Verification:** typecheck clean; `1149/1149` vitest pass (incl. 28 provenance/booklet tests);
  browser smoke confirmed the 3 new sprites load (naturalWidth 64) + body emoji pixelated, the
  connector label renders `科目（cell-type）`, and the report modal opens fresh.
- 二階 / medexam2 unaffected (separate repo `study-rpg-2nd`).
