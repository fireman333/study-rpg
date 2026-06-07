## Context

`apps/neurons-tw` has **no pixel typography today**. Three components hardcode `font-family: 'Cubic 11', 'Noto Sans TC', sans-serif` (`MazeExpedition.tsx:351,361`, `HelpMenu.tsx:279`) or `'VT323', 'Courier New', monospace` (`QuizHotkeysAnnouncementBanner.tsx:90`, `HelpMenu.tsx:368,382`), but there is **no `@font-face` and no `apps/neurons-tw/public/fonts/` directory**, so the browser falls back to Noto Sans TC for all of them. `styles.css` defines no root/body font token; the default Noto Sans TC comes from elsewhere (index.html / root).

The sibling 二階 app (`study-rpg-2nd/apps/medexam2-hospital-tw/src/styles.css`) is the reference implementation: it ships `Cubic_11.woff2` (391 KB) + `.woff` (643 KB), declares one `@font-face`, and exposes a 3-token system (`--font-pixel-cjk` / `--font-pixel-num` / `--font-pixel-en`). neurons should match that "RPG chrome" feel for cross-app consistency.

The owner's hard constraint (locked in `~/.claude/scratch/grilled-neurons-pixel-font-2026-06-07.md`): pixel font is for the **warm RPG chrome only**; all **exam content + long-form prose stays legible** (Noto Sans TC). This mirrors the project NFR warning that long CJK medical stems in a pixel font are exhausting to read. So this is fundamentally a **font-scoping change, not a global swap**.

## Goals / Non-Goals

**Goals:**
- Actually ship Cubic 11 (OFL-1.1) as a loaded webfont in neurons-tw, with proper attribution.
- Give the warm RPG chrome (nav / title / headers / buttons / chips / counters / flavor text) a uniform pixel look via `--font-pixel-*` tokens.
- Guarantee exam content + long-form prose render in the legible default font, verifiable at runtime.
- Fold the stray `VT323` references into the single Cubic 11 pixel family.

**Non-Goals:**
- **Emoji pixelization** — the ~119 inline emoji stay native system color emoji. A pixel-emoji pass is a separate future follow-up.
- **The cold-signal clinical aesthetic** (`neurons-clinical-aesthetic`) — its monospace data-readout treatment on data surfaces (connectome / EEG instrument stats) is unchanged. Pixel-typography governs warm-chrome font-family only; the two coexist.
- **No subsetting** — the woff2 is already 391 KB; ship whole, no build-time subset step.
- **No schema / sync / Worker change** — pure presentation.

## Decisions

### D1 — New capability `neurons-pixel-typography`, not a delta on `neurons-clinical-aesthetic`
`neurons-clinical-aesthetic` is explicitly the *cold EEG signal COLOR layer* (cyan/amber data surfaces) plus a "stats/counters render as **monospace** clinical data readouts" requirement. Pixel font-family scoping for warm chrome is an orthogonal concern; folding it in would muddy that capability's clear single purpose. **Alternative considered**: extend `neurons-clinical-aesthetic` or `neurons-responsive-layout` — rejected (former is color/signal, latter is breakpoints). A new capability keeps each spec coherent. The new spec explicitly notes coexistence: pixel-typography does NOT override the clinical monospace data-readouts.

### D2 — Token system mirrors 二階 (`--font-pixel-cjk` / `--font-pixel-num` / `--font-pixel-en`)
Define the same three tokens in `apps/neurons-tw/src/styles.css` `:root` so chrome surfaces reference `var(--font-pixel-cjk)` etc. instead of hardcoding `'Cubic 11'`. Rationale: cross-app consistency with 二階, single source of truth, easy future re-tune. The 3 existing hardcoded refs switch to tokens; VT323 refs become `var(--font-pixel-num)` (Cubic 11 first in the stack → VT323 only a fallback, effectively unifying on Cubic 11). **Default body font-family stays Noto Sans TC** (unchanged) — pixel is opt-in per chrome surface.

### D3 — `@font-face` URL must match the neurons Vite `base`
二階 hardcodes `url('/study-rpg/hospital/fonts/Cubic_11.woff2')` to match its base. neurons is served at `/neurons/`, so the src is `url('/neurons/fonts/Cubic_11.woff2')`. **Apply MUST verify the neurons Vite `base`** (`apps/neurons-tw/vite.config.*`) and match it exactly — a wrong base path → font 404 → silent fallback (the exact failure mode this change exists to fix). `font-display: swap` so it never blocks first paint.

### D4 — Legible surfaces get an explicit override, not just "absence of pixel"
Because pixel is applied via chrome classes/tokens and some legible surfaces are nested inside pixel-chrome containers, the legible allow-list (quiz stem/options/詳解/badge, /bank body cells, HelpMenu paragraphs, bug-report body) gets an **explicit `font-family: var(--font-legible)` (= Noto Sans TC) override** so inheritance can't leak pixel into exam text. A `--font-legible` token makes the legible intent greppable + testable. **Boundary rule = "is it exam content or long-form prose?"** → legible; surrounding operate/label chrome → pixel.

### D5 — Counters/numbers in chrome ARE pixel (owner-confirmed), but clinical data-readouts are not
Per grill, the owner accepts pixel numbers in chrome (energy values, `X/220`, accuracy %, timers, family labels). These use `var(--font-pixel-num)`. This is distinct from the `neurons-clinical-aesthetic` data-surface stat readouts (connectome/EEG instrument), which keep their monospace clinical treatment — no overlap because those live on data surfaces governed by the other capability.

### D6 — Diverge from 二階 on the quiz reading area
二階's `styles.css:86` puts Cubic 11 in its quiz reading area. neurons **intentionally does the opposite** — quiz stem/options/詳解 stay legible (D4). This is a deliberate divergence driven by the owner + the long-CJK-stem NFR; not a port bug.

## Risks / Trade-offs

- **Wrong `@font-face` base path → font 404 → silent fallback** → Mitigation: D3 verify Vite base; verification step (a) asserts the font file returns 200 in the network panel and that a chrome element's computed `font-family` actually resolves to Cubic 11 (not the fallback).
- **Pixel leaking into exam text via inheritance** → Mitigation: D4 explicit `--font-legible` overrides on the allow-list; verification step (b) asserts quiz/bank body computed font-family is the legible stack.
- **FOIT (invisible text while font loads)** → Mitigation: `font-display: swap`; verification step (d).
- **Pixel numbers ambiguous at small sizes** → Accepted (owner-confirmed D5); Cubic 11 digits are legible at chrome sizes; RWD probe can spot-check small screens.
- **OFL attribution** → Mitigation: ship `OFL.txt` + attribution alongside the font (apply task); 二階 omitted it — neurons does it right.

## Migration Plan

- Additive, presentation-only. No data migration, no Dexie/R2 bump. Existing saves unaffected.
- **Rollback**: revert the change commit — removes `@font-face` + tokens + chrome rules; app returns to all-Noto-Sans-TC (its current de-facto state). No state to undo.
- Deploy via `deploy-cf-pages.yml` (rebuild neurons + CF Pages). `deploy-worker.yml` / `dexie-fixture-lint.yml` unaffected.

## Open Questions

- Exact final chrome-surface file allow-list — enumerated during apply by grepping all `*Page` / chip / button / nav components (grill locked the *principle*; apply locks the *list*). Captured in tasks.md.
