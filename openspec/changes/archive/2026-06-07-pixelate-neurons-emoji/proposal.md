## Why

The `polish-neurons-pixel-font` change shipped Cubic 11 pixel chrome (nav / titles / buttons / chips / counters / flavor) but deliberately left inline emoji as **native system color emoji** — leaving the most-used chrome glyphs (the 🧬 collection-count chip, ✨/🤔 quiz-quality buttons, ⚔ 出征 button, ⚡ energy, 🏆 leaderboard) rendering as smooth cartoon vector emoji that clash with the surrounding GBA pixel aesthetic. The sibling 二階 app already solved this with a pixel-art emoji icon mechanism (`EmojiIcon` + a 64×64 pixel-PNG pack); this change ports that mechanism to neurons, the explicitly-deferred follow-up named in `neurons-pixel-typography`.

## What Changes

- Add a neurons-owned **pixel emoji icon pack** at `apps/neurons-tw/public/icons/emoji/<codepoint>.png` — the 64×64 GBA-style pixel PNGs for the emoji neurons actually uses, named by lowercase-hex Twemoji codepoint. The 15 emoji already covered by 二階's pack are **copied verbatim**; the high-visibility **neurons-only** icons (🧬 🧠 🔗 ⚔ 🔭) are **generated** to match the same style.
- Add `apps/neurons-tw/src/lib/emoji-icons.ts` (`ICON_MAP` lookup + `emojiIconUrl` using base-correct `import.meta.env.BASE_URL` + `hasEmojiIcon` + U+FE0F `normalize()`) and `apps/neurons-tw/src/components/EmojiIcon.tsx` (`<EmojiIcon char size title/>` → pixel `<img imageRendering:pixelated draggable={false}>` with a **graceful native `<span>{char}` fallback** when no PNG exists), ported from 二階.
- Swap inline emoji to `<EmojiIcon>` at **chrome JSX render sites only** (top-nav, section headers, buttons, chips, counters, flavor labels, and the quiz answer-quality buttons that `neurons-pixel-typography` already classes as pixel-OK chrome). Exam content and long-form prose surfaces are **not** touched.
- Ship a `CREDITS.md` alongside the PNGs (mirror 二階's provenance / OFL-equivalent attribution: engine AGPL-3.0, content CC-BY-NC-4.0).
- The minor long-tail neurons-only emoji (🔢 🚫 😣 🔬 🔥 🐜, each ≤2 occurrences) ride the **graceful native fallback** for now — backfillable later by dropping a PNG + map row with zero code change.
- **Out of scope / deferred**: adopting 二階's global `body { image-rendering: pixelated; -webkit-font-smoothing: none }` (that is about Cubic-11 *text* crispness and risks regressing the legible surfaces — `EmojiIcon` already sets `imageRendering:pixelated` per-`<img>`, so pixel emoji are crisp without it). Emoji embedded in plain TS string literals (toast text, dynamic label-data arrays) that are not a clean JSX swap may stay native.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-pixel-typography`: the requirement "Emoji SHALL remain native system emoji (out of scope for pixelization)" is replaced by "Chrome emoji SHALL render as pixel icons via an EmojiIcon component with graceful native fallback" — mapped chrome emoji → pixel `<img>`; unmapped emoji and any emoji inside legible exam/long-form surfaces → native. (The historical `ui-emoji-icons` capability, which governs the removed 二階 app, is **not** touched.)

## Impact

- **New files**: `apps/neurons-tw/public/icons/emoji/*.png` (+ `CREDITS.md`), `apps/neurons-tw/src/lib/emoji-icons.ts`, `apps/neurons-tw/src/components/EmojiIcon.tsx`.
- **Edited files**: chrome JSX components in `apps/neurons-tw/src/` (nav / header / buttons / chips / counters / flavor labels) — emoji literal → `<EmojiIcon>`.
- **Schema / sync**: **ZERO** — no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no Worker change. `lint:dexie-fixtures` is a no-op for this change.
- **Asset generation**: 5 neurons-only PNGs via the codex/Gemini pixel-emoji formula (per `~/.claude/imports/image_gen_routing.md`) + ImageMagick post-process (chroma-key cream → 64×64 nearest-neighbor → 16-color quantize).
- **Deploy**: presentation-only; merge→main triggers `deploy-cf-pages.yml` (neurons CF Pages) as usual.
