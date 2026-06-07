## Context

`polish-neurons-pixel-font` (shipped 2026-06-07) put Cubic 11 pixel font on the warm RPG chrome but kept inline emoji native, leaving the most-used chrome glyphs (🧬 collection chip, ✨/🤔 quiz-quality buttons, ⚡ energy, ⚔ 出征, 🏆 leaderboard) as smooth color emoji that clash with the pixel look. The `neurons-pixel-typography` spec named this pixelization as an explicit follow-up.

The sibling 二階 app (`~/coding-scratch/study-rpg-2nd/apps/medexam2-hospital-tw/`) already solved this and was fully reconned for this change:
- `public/icons/emoji/<codepoint>.png` — a 73-file pack of 64×64 GBA pixel-art PNGs (codex `gpt-image-2`-generated; cream `#fef5ce` BG → chroma-key → 64×64 nearest-neighbor → 16-color quantize), named by lowercase-hex Twemoji codepoint, with a `CREDITS.md` documenting the prompt formula + license.
- `src/lib/emoji-icons.ts` — `ICON_FILES` → `ICON_MAP`; `emojiIconUrl()` (uses `import.meta.env.BASE_URL`, so base-correct for `/neurons/`); `hasEmojiIcon()`; `normalize()` stripping U+FE0F.
- `src/components/EmojiIcon.tsx` — `<EmojiIcon char size title/>` → pixel `<img imageRendering:pixelated draggable={false} userSelect:none>` with a `<span>{char}` native fallback when no asset exists.

This change is a near-verbatim port. The font's prod-base trap (it used an absolute `/fonts/` literal → needed Vite src-bundling) does **not** recur here: `emojiIconUrl` interpolates `import.meta.env.BASE_URL`, which Vite rewrites to `/neurons/` in prod, so a plain `public/icons/emoji/` directory is correct.

neurons emoji inventory (grep of `apps/neurons-tw/src`, occurrence counts): shared-with-二階 (15): ✨35 🤔29 📖13 🐞10 ⭐10 ⚡7 🏆6 🩺5 🎲5 📚4 💡2 🎯2 🎨2 👋1 ☁1. neurons-only (no 二階 PNG, 11): 🧬17 🧠8 🔗7 ⚔2 🔭2 🔢2 🚫1 😣1 🔬1 🔥1 🐜1.

## Goals / Non-Goals

**Goals:**
- Chrome emoji render as pixel-art `<img>` consistent with Cubic 11 chrome, via a ported `EmojiIcon` + manifest + PNG pack.
- Graceful native fallback for any unmapped emoji (no tofu, no broken images) — incremental, safe to ship partial coverage.
- Base-correct asset URLs in dev (`/`) and prod (`/neurons/`).
- Zero schema/sync footprint.

**Non-Goals:**
- Adopting 二階's global `body { image-rendering: pixelated; -webkit-font-smoothing: none }` (D3 — deferred).
- Exhaustively de-emoji-ing every string literal (toast text, dynamic label arrays) — chrome JSX render sites only (D2).
- Pixelizing emoji inside legible exam/long-form surfaces — those stay native by spec.
- Generating art for the minor long-tail neurons-only emoji (🔢 🚫 😣 🔬 🔥 🐜) — they ride the native fallback (D1).
- Touching the historical `ui-emoji-icons` capability (it governs the removed 二階 app).

## Decisions

### D1 — Asset sourcing: copy the shared 15, generate the 5 high-visibility neurons-only, defer the long tail

The 15 shared emoji PNGs are **copied verbatim** from 二階's pack (identical style, zero risk). The 5 high-visibility neurons-only icons — **🧬 (1f9ec, collection-count chip = most prominent), 🧠 (1f9e0, brain), 🔗 (1f517, synapse), ⚔ (2694, 出征 button), 🔭 (1f52d, maze 全覽 recenter)** — are **generated** with 二階's documented prompt formula (Japanese-RPG/GBA pixel art, single centered object on cream `#fef5ce`, 1–2px dark outlines, hard-edged cell shading, 8–12 colors) + the same ImageMagick post-process (chroma-key cream → resize 64×64 nearest-neighbor → 16-color quantize). The minor long-tail (🔢 🚫 😣 🔬 🔥 🐜, each ≤2 occ, transient/non-central) is **left on the native fallback** — backfillable later by dropping a PNG + a map row, no code change.

- *Why not generate all 11?* Each long-tail emoji appears ≤2× in transient spots; the fallback renders them fine. Generation has friction (codex quota / Gemini cookie) — spend it only where the clash is visible.
- *Why not leave all neurons-only native?* 🧬 is the single most-used neurons glyph (the `🧬 X 隻` chip) sitting in pixel chrome — native there is the most jarring case. Generating the top 5 covers the visible clash.
- *Image-gen routing*: per `~/.claude/imports/image_gen_routing.md` — simple single-object icons favor Gemini-first (fast, parallel); codex is the fallback. Either is acceptable; the post-process normalizes both to the pack style.

### D2 — Scope = chrome JSX render sites only

Swap emoji literals to `<EmojiIcon>` only where a chrome surface renders an emoji in JSX (nav, headers, buttons, chips, counters, flavor labels, and the quiz answer-quality buttons ✨太簡單 / 🤔我亂猜 that `neurons-pixel-typography` already classes as pixel-OK chrome). Emoji inside the legible exam/long-form surfaces are left native. Emoji in plain-string contexts (toast text, dynamic label-data arrays) where a clean JSX swap isn't available may stay native — the fallback keeps them correct.

- *Why not a global string-replace?* `EmojiIcon` is a JSX component; emoji inside string literals can't host a component without rearchitecting the string into JSX, which is invasive and risks the legible surfaces. Pragmatic chrome-JSX scope matches 二階's own approach and the spec's pixel/legible boundary.

### D3 — Defer 二階's global `body` pixel-rendering/font-smoothing rule

`EmojiIcon` sets `imageRendering: 'pixelated'` per-`<img>`, so pixel emoji are crisp **without** any global rule. 二階's global `body { image-rendering: pixelated; -webkit-font-smoothing: none }` (with legible surfaces re-asserting `antialiased`/`grayscale`) is about making Cubic-11 **text** more authentically crunchy — a separate aesthetic concern that risks regressing readability on the legible surfaces. Out of scope here; revisit as a standalone polish if desired.

### D4 — Provenance / license

Ship a `CREDITS.md` in `apps/neurons-tw/public/icons/emoji/` mirroring 二階's: copied icons retain 二階's generation provenance; the 5 new icons note their generation date + tool + formula; license = engine AGPL-3.0 / content CC-BY-NC-4.0.

### D5 — Spec delta shape: REMOVED + ADDED, not MODIFIED

The old requirement's stance (emoji stay native) is the literal inverse of the new one (chrome emoji become pixel) and its name changes. A MODIFIED delta relies on exact header matching and would leave a self-contradictory name; REMOVED (with Reason + Migration) + ADDED is semantically accurate and archive-safe. Net main-spec state is identical to the decision-doc's "one modified requirement" intent.

## Risks / Trade-offs

- **[Generated icons don't match the pack style closely enough]** → use the exact documented prompt formula + identical post-process; eyeball against the copied 15 in the same grid before wiring; regenerate if off. Worst case, drop the off ones to native fallback (still correct).
- **[Prod base-path 404 like the font]** → not applicable: `emojiIconUrl` uses `import.meta.env.BASE_URL` (Vite-rewritten to `/neurons/`), and `public/` assets are emitted under base. Verify in the prod Chrome MCP pass (asset 200 + naturalWidth>0).
- **[Layout shift / sizing]** → `<img>` carries explicit `width`/`height` = `size` and `vertical-align: middle` (port 二階's `IMG_STYLE`); spot-check buttons/chips where emoji sat inline with text.
- **[Drag/swipe capture]** → `draggable={false}` + `WebkitUserDrag:none` ported verbatim (二階 added these for framer-motion swipe handlers; harmless here).
- **[Partial coverage looks inconsistent]** → acceptable and intentional; the high-visibility set is covered, the long tail is low-traffic. Documented as backfillable.

## Migration Plan

1. Copy the 15 shared PNGs + author `CREDITS.md` into `apps/neurons-tw/public/icons/emoji/`.
2. Generate + post-process the 5 neurons-only PNGs into the same dir.
3. Port `emoji-icons.ts` (trim `ICON_FILES` to neurons' covered set: the 15 + the 5 = 20 rows) + `EmojiIcon.tsx` verbatim.
4. Swap chrome-JSX emoji literals → `<EmojiIcon>` across the identified components.
5. Verify (build · typecheck · vitest · dexie-lint no-op · Chrome MCP dev + prod SPA 三件套 + asset-200 + per-img pixelated + exam/long-form unaffected + console clean).
6. Archive → merge→main (GATE 2 confirm) → `deploy-cf-pages.yml` deploys.

**Rollback**: pure presentation; revert the change commit. No data/schema implications.

## Open Questions

- None blocking. (Long-tail backfill and the deferred global font-smoothing rule are explicitly out of scope, not open questions.)
