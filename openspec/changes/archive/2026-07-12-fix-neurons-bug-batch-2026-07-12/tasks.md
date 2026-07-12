## 1. Bug #1 — HelpMenu emoji pixelation (`df577466`)

- [x] 1.1 Generate `1f4c4` (📄) / `267b` (♻) / `1f5fa` (🗺) 64×64 pixel sprites via codex `gpt-image-2` + ImageMagick (4-corner floodfill chroma-key → trim → point resize 60 → extent 64 → 16-color); place in `apps/neurons-tw/public/icons/emoji/`
- [x] 1.2 Add the three `[emoji, '<codepoint>.png']` rows to `apps/neurons-tw/src/lib/emoji-icons.ts` (bare codepoints; `normalize()` strips FE0F)
- [x] 1.3 Wire the remaining raw body-prose emoji in `HelpMenu.tsx` (24 sites) through `<EmojiIcon size={14} decorative />` — the two raw section icons (📄 source-pdf, ♻ account-reset) auto-pixelate once registered
- [x] 1.4 Document the three new sprites in `public/icons/emoji/CREDITS.md`
- [x] 1.5 Browser smoke: all three new sprites load (`naturalWidth === 64`); body emoji (✨/🤔/📖…) render as `<img>`; no remaining renderable raw emoji

## 2. Bug #2 — Connector card drops 科目 (`c28e1541`)

- [x] 2.1 In `apps/neurons-tw/src/components/ConnectorSection.tsx`, change `labelOf` to return `科目（cell-type）` (mirror `CollectionPage.familyDisplayLabel`); falls back to `id` alone when there is no distinct cell-type
- [x] 2.2 Confirm both the visible pair label and the `aria-label` consume `labelA`/`labelB` (no extra edit needed)
- [x] 2.3 Verify against live `subjects.json`: `藥理學（VTA Dopaminergic） ⇌ 病理學（Striatal MSN）`

## 3. Bug #3 — 114-1-醫學二 PDF page drift (`9ac0d676`)

- [x] 3.1 Download the served Drive booklet `114-1 醫學二 國考詳解.pdf` (referrer-locked API key); confirm 145 pp vs local build-source 148 pp (edition mismatch)
- [x] 3.2 Extract every 題號 card's served page via PyMuPDF (robust parser incl. the broken `號`-only header for Q62); cross-check Q80 病理 → served page 118 = printed label 6 (matches report)
- [x] 3.3 Pin all 100 mapped `114-1-醫學二-*` questions in `packages/content-neurons-tw/provenance/verified-overrides.json` (0-based page, `file = "114-1 醫學二 國考詳解.pdf"`)
- [x] 3.4 Rebuild the provenance map; assert Q80 → page 118, booklet + driveFileId resolved, `driveId 4381/4381 resolved` (built `public/provenance/*.json` stays gitignored)

## 4. Bug #4 — Bug-report modal keeps old success screen (`03156d3b`)

- [x] 4.1 Import `useEffect` in `apps/neurons-tw/src/components/BugReportModal.tsx`
- [x] 4.2 Add `useEffect(() => { if (open) reset all fields incl. result }, [open])` so each open starts fresh (root cause: always-mounted component returns null when closed → `result` persists)
- [x] 4.3 Confirm the inline `QuizBugReportSheet` / `QuestionBugReportSheet` are conditionally mounted (`{cond && <Sheet/>}`) and therefore already reset on close — no change needed
- [x] 4.4 Browser smoke: report modal opens cleanly (fresh state, no crash)

## 5. Verify & record

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw typecheck` green
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test -- --run` green (1149/1149)
- [x] 5.3 Mark all four `bug_reports` ids `fixed` in the local bug-queue ledger
- [ ] 5.4 Archive change → merge `track-neurons` → `main` → push → CF Pages prod deploy → verify run green
