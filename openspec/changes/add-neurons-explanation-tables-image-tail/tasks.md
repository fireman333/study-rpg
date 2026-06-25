# Tasks — add-neurons-explanation-tables-image-tail

> Batch 2 of the image-crop tier (27 done in `add-neurons-explanation-table-images`). Mechanism is
> already shipped — this is content/asset work + owner hand-cropping. Reuses
> `packages/content-neurons-tw/scripts/table-images/`. The 29 ids = archived
> `2026-06-25-add-neurons-explanation-tables/quarantine-severe.json` minus the 27 already in
> `table-images/manifest.json`.

## 1. Resolve the 29 → source PDF + page

- [ ] 1.1 Load the 29 tail ids (quarantine-severe.json ∖ manifest.json keys) — assert count == 29
- [ ] 1.2 Reuse the batch-1 `{year,session,book}` → source-PDF map (`scripts/table-images/locate.py`)
  to resolve each id → (PDF file, candidate page window) over the 陽明 PDFs
- [ ] 1.3 Render each candidate page (`fitz.get_pixmap` ~150 dpi) for owner/triage review

## 2. Triage (crop candidate vs stays-flat)

- [ ] 2.1 For each of the 29, decide on the rendered page: **has a real 詳解 table** (crop candidate)
  vs **no actual table / prose list** (stays flat). Record the disposition per id (no silent drop)
- [ ] 2.2 Confirm the candidate count + flag any crop that depicts a neighbouring question's table

## 3. Owner crop + encode (reliable path)

- [ ] 3.1 Owner hand-crops each candidate's precise 詳解 table region → screenshots into `from-owner/`
  (filenames carry each table's title → caption); a question may yield multiple images
- [ ] 3.2 `process_owner_crops.py` → committed `table-images/<qid>__N.webp` (WebP q≈82, tens of KB
  each) + appended `table-images/manifest.json`; write provenance to `table-image-overrides.json`

## 4. Clean prose for each cropped question

- [ ] 4.1 For every cropped id, add a prose-only entry to `table-images/prose.json` — narrative prose
  of the original explanation with the garbled flattened-table runs removed
- [ ] 4.2 Gate prose against the existing exact NFKC+PUA-tolerant substring check (verbatim substrings
  only; OCR-garble corrections must be sourced from the PDF pixels). Prefer PDF-reread over agent
  fan-out for any disputed passage (see design Decision 4 — cost discipline)

## 5. Build + integrity test

- [ ] 5.1 `pnpm run build:neurons-content` — expect 4600/0, the new images wired + copied to
  `dist/table-images/` → `apps/neurons-tw/public/content/neurons-tw/table-images/`
- [ ] 5.2 Extend `explanation-table-images.test.ts` expected counts (qids + assets resolve; additive
  invariant: `id`/`answer`/source corpus json unchanged) → `pnpm --filter @study-rpg/neurons-tw test` green
- [ ] 5.3 `pnpm -r typecheck` clean (no code change expected, sanity)

## 6. Verify + ship

- [ ] 6.1 `/verify` — Chrome MCP `/bank` smoke on 2–3 cropped tail questions: clean prose + table
  image(s), garbled text gone, 0 page-level horizontal overflow on a 390px viewport
- [ ] 6.2 Deploy neurons (Cloudflare Pages); prod-verify a sample webp loads (HTTP 200) + renders
- [ ] 6.3 `/opsx:archive` (sync the MODIFIED `neurons-explanation-table-images` delta) + commit
  (explicit per-file `git add` of content/asset + openspec paths only)
