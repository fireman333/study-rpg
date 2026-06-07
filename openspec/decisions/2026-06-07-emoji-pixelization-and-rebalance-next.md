# Handoff — next changes: emoji-pixelization (ref 二階) → then rebalance (2026-06-07)

> Written at session end before `/clear`, at owner request. Next session: `/spec resume` surfaces this.
> **State at write**: no active OpenSpec changes; `track-neurons` worktree CLEAN + in sync with `origin/track-neurons` (0/0); `openspec validate --all` = **84/0**. `polish-neurons-pixel-font` SHIPPED this session (main merge `b1a268b`, CF Pages `27087381736`, prod-verified) — Cubic 11 pixel chrome now live, exam/long-form legible.

## Owner's plan (verbatim intent)

1. **NEXT** = emoji → pixelized icons, **referencing how 二階國考 (`study-rpg-2nd`) does it**.
2. **AFTER** = `rebalance-neurons-*` (dogfood pacing/caps).
3. (This handoff first, then `/clear`, then resume to do #1.)

---

## NEXT 1 — `pixelate-neurons-emoji` (emoji → pixel icons, port 二階's `EmojiIcon`)

**Goal**: replace the ~showing inline unicode color emoji in neurons-tw chrome with pixel-art `<img>` icons (consistent with the new Cubic 11 pixel chrome), exactly mirroring 二階's mechanism. The `polish-neurons-pixel-font` change explicitly left emoji **native** and deferred this — this is that follow-up.

### 二階's mechanism (FULLY reconned this session — copy it)

Three pieces in `~/coding-scratch/study-rpg-2nd/apps/medexam2-hospital-tw/`:

1. **`public/icons/emoji/<codepoint>.png`** — **72 pixel-art PNGs** (~1.8 KB each, 16-color pixel emoji), named by lowercase hex codepoint (`26a1.png` = ⚡, `1f3b2.png` = 🎲, `1f4d6.png` = 📖, `1f41e.png` = 🐞 …).
2. **`src/lib/emoji-icons.ts`** — `ICON_FILES: ReadonlyArray<[emojiChar, 'codepoint.png']>` → `ICON_MAP = new Map(ICON_FILES)`; `emojiIconUrl(emoji)` returns `` `${import.meta.env.BASE_URL}icons/emoji/${filename}` `` or `null`; `hasEmojiIcon(emoji)`; a `normalize()` that strips the U+FE0F variation selector (important — many emoji like ⚔️ carry a trailing `️` = U+FE0F; neurons grep showed 11 orphan FE0F selectors).
3. **`src/components/EmojiIcon.tsx`** — `<EmojiIcon char="⚡" size={20} title=.../>` → `<img src={emojiIconUrl} width height imageRendering:pixelated draggable={false} userSelect:none>`; **falls back to a raw `<span>{char}` when no sprite exists** (graceful — neurons-only emoji without a PNG still render).
4. **Global body rule** (`src/styles.css`): `body { image-rendering: pixelated; -webkit-font-smoothing: none; -moz-osx-font-smoothing: none; }` — crispens sprites + text. **The exam/long-form legible surfaces re-assert `-webkit-font-smoothing: antialiased` / `-moz-osx-font-smoothing: grayscale`** to stay smooth (二階 `styles.css:80-81`). 二階 also has an optional `body[data-font-mode='pixel']` toggle (Dexie-meta-backed) that pushes pixel even into the quiz reading area — **neurons should NOT copy that toggle** (we deliberately keep quiz/bank/long-form legible).

### Neurons emoji set to cover (this session's grep, most-used first)

✨(23) · 🤔(19) · 🧬(16) · 📖(13) · 🐞(9) · 🧠(8) · 🔗(7) · ⭐(7) · ⚡(7) · 🏆(6) · 🩺(5) · 🎲(5) · 📚(4) · 🔭(2) · 🔢(2) · 💡(2) · 🎯(2) · 🎨(2) · ⚔️(2) · singles: 🚫 😣 🔬 🔥 👋 🐜 ☁. (Plus the 11 orphan U+FE0F that `normalize()` handles.)

- **Reuse from 二階's 72**: ⚡ 📖 🐞 🎲 🏆 💡 🎯 🎨 ☁ 👋 📚 ✨ ✏ ❓ ✅ ❌ etc. already exist — copy those PNGs + map rows.
- **neurons-only (no 二階 PNG, need art OR native fallback)**: 🧬 🧠 🔬 🔭 🩺 🔗 🔢 🔥 😣 🐜 ⭐ 🤔 🚫 ⚔️. Options: (a) source from the same pixel-emoji set 二階 used (find its origin — check `study-rpg-2nd` git log / a generator script / the set looks like a known pixel-emoji pack ~16-color), (b) generate via Gemini/codex per `~/.claude/imports/image_gen_routing.md`, or (c) leave them on the native fallback (EmojiIcon already does this — emoji that lack a PNG just render as native color emoji, acceptable transient). **Recommend (a) if the source set is identifiable, else (c) for the long tail + (b) for the few high-traffic ones (✨🤔🧬🧠🩺).**

### Porting plan (sketch — confirm scope in a quick `/grill` or just propose)

1. Copy `public/icons/emoji/*.png` (the ones neurons uses) → `apps/neurons-tw/public/icons/emoji/` (NOTE: 二階's `emojiIconUrl` uses `import.meta.env.BASE_URL` which is base-correct for `/neurons/` — so `public/icons/emoji/` works here, unlike the font which needed src-bundling; the font's base issue was an absolute `/fonts/` literal, whereas `BASE_URL` interpolation is fine).
2. Port `src/lib/emoji-icons.ts` (trim `ICON_FILES` to neurons' emoji set + add neurons-only rows as art lands) + `src/components/EmojiIcon.tsx` verbatim.
3. Replace inline emoji in neurons chrome JSX with `<EmojiIcon char="…"/>` — **chrome only**; do NOT touch emoji inside the legible exam/long-form surfaces (there mostly aren't any, but e.g. the 📖 詳解 summary label is chrome → pixel OK).
4. **Companion decision** (raise in grill): also add `-webkit-font-smoothing: none` + global `image-rendering: pixelated` to the neurons `body` (二階 does — makes Cubic 11 crisper / more authentically pixel) with the legible surfaces re-asserting `antialiased`/`grayscale`. This is arguably part of "match 二階's pixel look." Currently neurons only has `image-rendering: pixelated` scoped to `img.pixel`/`.pixel-sprite` (theme `global.css:43`), NOT global, and no `font-smoothing:none`.
5. **Likely zero schema/sync** (pure presentation: PNG assets + 2 source files + JSX swaps + maybe 3 CSS lines). Verify bar: prod Chrome MCP — pixel emoji `<img>` render (naturalWidth>0, `image-rendering:pixelated`), neurons-only emoji either pixel or graceful-native (no tofu), exam/long-form unaffected, SPA 三件套, console clean.

**Spec target**: extend the new `neurons-pixel-typography` capability (it currently has a requirement "Emoji SHALL remain native … out of scope" — this change MODIFIES that to "chrome emoji SHALL render as pixel icons via EmojiIcon with graceful native fallback"). One MODIFIED requirement, not a new capability.

---

## NEXT 2 — `rebalance-neurons-*` (after emoji)

Dogfood-tune the game-loop numbers. Full input already captured in **`openspec/decisions/2026-06-05-neurons-mechanics-rebalance-input.md`** (suspect numbers: `PACING_BASE=14` / `PACING_K=0.10` / `CORRECT_ANSWER_ENERGY=3` / `READING_MINUTE_ENERGY=3` / accel caps 2.5 energy & 2.0 speed) + the 4 deferred spec-hygiene findings (C1 `neuron-family-mastery` "two faucets" stale, C2/C3 minor, C4 moot). **Now MORE relevant**: the 220-catalog (second-lap) doubled the endgame grind AND per-subject reading slows each pool's fill — wants real dogfood telemetry first. Start with `/grill` on the target numbers + acceptance (what "feels right").

---

## Process reminders (unchanged)

- Worktree `track-neurons` (`~/coding-scratch/study-rpg-neurons`); `main` is checked out in `~/coding-scratch/study-rpg` — merge→main happens THERE (`git -C … merge --no-ff`), triggers `deploy-cf-pages.yml` = deploy. Confirm before merge (GATE 2).
- Multi-agent safety: the **main** worktree has a peer's untracked `openspec/changes/add-cloudflare-auth-migration/` — leave it untouched; explicit per-file `git add`; revert `meta.json` builtAt churn (the dev/predev content-copy re-stamps it — happened ×3 this session).
- Font tokens already exist (`--font-pixel-cjk/num/en` + `--font-legible` in `apps/neurons-tw/src/styles.css`); the `@font-face` is app-owned with a Vite-relative url. Emoji change builds on this.
- Neuroscience facts → `/oe`, not memory (not relevant for emoji/rebalance, but the standing rule).
- `track-neurons` is 2 commits "behind" main (the merge commits `b1a268b` + `cdfc1a3`) — next change should start with `git merge main` into `track-neurons` (standard catch-up; content-identical so 0-conflict).
