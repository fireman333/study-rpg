## Context

The 陽明 PDF → `questions.json` pipeline (`extract_exam.py` → `reconcile_all.py`) is lossy for images: `extract_exam.py` calls `page.get_images()` only to set a page-level boolean and **never persists image bytes**; the final `hasImage` field is a regex over stem text (`reconcile_all.py:136`), decoupled from real images. A deterministic Phase-1 inventory this session (scratch `full_inventory.py`, PyMuPDF 1.27) attributed every >100k-px raster on each question's card pages to its stem / option / explanation band and found **~2,566 net-new explanation-figure questions** (71% of 3,624 scanned; ~7,271 crops; 1,749 multi-figure). Ground-truthing confirmed these are real hand-drawn diagrams and Netter crops, not artifacts.

Two precedents exist and bound this design:
- **`neurons-question-figures`** — stem figures as `figures/<id>.png` co-located in the content pack; the build treats file existence as truth, wires `imagePath`+`hasImage`, copies to `public/`, `QuizModal` renders `<img>` with `[圖]` fallback. (The 7 stem-image questions belong here, not in this change.)
- **`neurons-explanation-table-images`** — 詳解 table crops in `table-images/manifest.json`, **bundled** into `public/`, rendered after the explanation, additive (`id`/`answer` immutable), explicitly "extensible across batches." This is the closest precedent; the only thing that breaks at scale is **bundling** (~108 MB at full scale).

## Goals / Non-Goals

**Goals:**
- Recover 詳解 figures for the pilot booklets **112-1/2, 113-1/2, 114-1/2** (~985 figure-questions) faithfully (rasterized PDF region, never transcribed).
- Prove a **lazy-loaded static-asset** delivery path (assets fetched on 詳解 expand, not bundled / not in `questions.json`).
- Land a **deterministic, repeatable inventory detector** in the repo as the audit source-of-truth for the follow-up full-scale change.
- Keep `id`/`answer`/`stem`/`options` text byte-identical; figure work is additive to explanation render only.

**Non-Goals:**
- Stem images (7) / option images (9) — reuse `neurons-question-figures`; tiny separate cleanup.
- OCR of the 104-2 text-layer-less pair — deferred.
- Vector inner-table reconstruction — most "tables" are raster figures (covered here as images); the residual vector tables stay on `neurons-explanation-tables`.
- Full-scale rollout to all 2,566 — a follow-up change gated on this pilot.
- Any change to sync engine / Dexie / R2 / leaderboard / economy.

## Decisions

**D1 — Extraction is deterministic, not agent-driven.** Per the codex-reviewed decision tree: a single-xref figure with `card_overlap≥0.80`, `text_chars<10`, image-cover ≥80% → `doc.extract_image(xref)` (original bytes, png/jpeg → webp); a composite / text-over-image / inner-table region → `page.get_pixmap(clip=rect, matrix=Matrix(s,s))` render-crop (s=2.0, 3.0 for small/table). LLM agents are used **only** for multi-figure attribution QA (D3). *Alternative rejected:* fan-out agents to "extract" — wasteful and non-deterministic for what is a geometry problem.

**D2 — Lazy-loaded static asset files; refs build-injected onto the question (mirror table-images); content-addressed filenames.** Pilot assets live at `packages/content-neurons-tw/explanation-figures/<qid>__N.<contenthash>.webp` → build → `apps/neurons-tw/public/content/neurons-tw/explanation-figures/`, with a `manifest.json` mapping `qid → [{src, provenance{sourcePdf,page,bbox,booklet,category}, attributionConfidence}]`. The build **injects the `src` list onto the question as `explanationFigures` in the BUILT `questions.json`** (exactly like the shipped `explanationTableImages` tier — convergence, D4) while the **source `questions.json` is never edited** (the real immutable invariant); provenance stays in the manifest (for CREDITS), not the rendered payload. Image **bytes** are never in `questions.json`/JS — only `src` refs; the `<img loading="lazy">` fetches the webp on scroll-into-view. Filenames are **content-addressed** (hash) so a re-crop changes the path and no cache serves a stale image (the likeliest pilot *false-success*). *Why build-injection over a separate manifest fetch:* refs are tiny (~200 KB at full scale), the table-images tier already injects image refs onto the (built) question, and reusing that exact path means zero new fetch/context plumbing and one renderer pattern. *Alternatives rejected:* (a) bundle the bytes like the 49-webp precedent — impossible at 108 MB full scale; (b) R2-presigned — Worker/auth complexity for public static content CF Pages serves free; (c) editing the **source** corpus — would break the immutable invariant (the build-time injection does not).

**D3 — Attribution: geometry first, agents for the ambiguous subset.** qid→page via the proven `extract_exam.find_question_starts`; card bbox via `find_tables` (largest full-width table); row-label anchors (`題幹`/`(A)`/`答案`/`詳解`/`資料出處`) define y-bands; an image attributes to the band it overlaps (≥0.35) within the card (≥0.80). Continuation-page images attribute to the still-open card's explanation (overflow). The **1,749 multi-figure questions** are where attribution is risky → parallel agents verify "does crop N depict question Q's explanation?" against the question text. Single-figure questions pass on the geometry gate + spot-sample.

**D4 — New capability `neurons-explanation-figures`, leaving the bundled precedent intact — with a convergence boundary.** The bundled `neurons-explanation-table-images` 49-webp path stays as-shipped; new figures use the lazy path. To avoid two divergent 詳解-image tiers becoming a maintenance hazard, the two SHALL share renderer conventions and keep the manifest shape compatible, and the full-scale follow-up SHALL evaluate migrating the 49 bundled webp onto the lazy tier (not done now — out of pilot scope). *Alternative rejected:* retro-editing the shipped table-images capability's delivery requirement from bundled→lazy now — riskier and muddies a shipped contract mid-pilot.

**D5 — Faithful + provenance + takedown, mirroring the table-images contract.** Every shipped figure records `{sourcePdf, page, bbox}`; content is rasterized region, never re-typeset; CC-BY-NC + 24h takedown (figures include 陽明 hand-drawn + Netter crops — same copyright posture as the existing 49).

## Risks / Trade-offs

- **Multi-figure mis-attribution** (1,749 q) → D3 agent QA on exactly that subset + owner spot-sample; a crop that depicts a neighbouring question is set aside, not attached.
- **Render-crop resolution / blurry tables** → scale 2.0–3.0; owner reviews a debug-preview sheet per booklet before wiring (mirrors table-images owner-verify scenario).
- **CF Pages file-count budget** → the acceptance gate SHALL measure the **total** built-app static file count (not just new figures) against the plan limit (Free = 20,000 files; paid + Wrangler v4 = 100,000; per-file ≤ 25 MiB) and fail fast if exceeded. Pilot (~1,000–3,000 figure files) is within Free; the full-scale (~7,300 files) uses the same preflight and is an explicit Open Question for the follow-up.
- **Stale-cache false-success** → content-addressed filenames (D2): a re-cropped figure gets a new path, so a CDN/browser cache never serves the old image and the pilot's "looks fixed" reflects the actual asset.
- **104-105 under-scanned** (layout-parser miss, ~976 q) → intentionally outside the pilot (112-114 are fully scanned); the follow-up adds the 104-105 parser before scaling.
- **Asset weight per page-view** → lazy-fetch only on 詳解 expand keeps initial load unchanged; figures are already-compressed webp (~43 KB avg).

## Migration Plan

- Purely additive: new `explanation-figures/` dir + manifest + a render branch in `Explanation.tsx` + an additive `core` type. No Dexie/R2/sync/schema change → no upgrade fixture, no migration.
- **Deploy**: standard neurons CF Pages build (`build:neurons-content` → `copy-content.mjs` → `deploy:cf`); verify lazy fetch of a figure 200s on prod + renders after explanation.
- **Rollback**: remove the pilot manifest entries (and optionally the asset files); questions fall back to flat text explanation. No data loss, no user-state impact.

## Open Questions

- Full-scale (follow-up) asset hosting if file count nears CF Pages limits: keep static in `public/` vs move the figure tier to R2 public bucket / a CDN path. (Pilot stays static.)
- Exact `core` figure-ref type fields (provenance shape, whether `attributionConfidence` ships to client or stays build-side) — finalized in the specs/`core-npm-package` delta.
- Whether the inventory detector also lands the (tiny) stem/option/ocr findings as a recorded TODO list for the cleanup change, or only the explanation-figure rows.
