# Handoff — outstanding-work inventory + pixel-font UI-polish change (2026-06-07)

> Written at session end before `/clear`, at owner request. Next session: `/spec resume` surfaces this file.
> State at write: **no active OpenSpec changes**, `track-neurons` worktree clean, `add-neurons-maze-second-lap-variants` fully SHIPPED to prod (main merge `54fee4a`, CF Pages + Worker green) **and its D1 migration `0007` already applied** (Worker bound + D1 CHECK aligned at 220 — ripple fully closed). `openspec validate --all --strict` = 84/0.

## A. Outstanding-work inventory (盤點)

### A0 — Nothing is broken / half-done
No active changes; clean worktree; all CI green; D1 0007 applied. Everything below is **deferred polish**, **planned-future changes**, or **peer work** — none of it is an unfinished obligation from this session.

### A1 — Deferred follow-ups from `add-neurons-maze-second-lap-variants` (low priority)
1. **Per-family asymmetric K** — second-route nodes are currently a uniform **10/family** (`SECOND_NODES_CAP=10` in `build-tilemap-maze.mjs`). The spec allows asymmetric K = "natural crossings reached". Could let families vary (would need the catalog `SECOND_LAP_SLOTS_PER_FAMILY` to become per-family + the cross-check test updated). Owner originally said 「愈多愈好」 → uniform 10 (→220 total) is the current call.
2. **Bespoke art for location variants** — they currently reuse the family's slot-1 base sprite + a position-keyed `hue-rotate` filter (zero new asset, by design). Could get dedicated pixel art later (expensive; the procedural look is "good enough" per the design).
3. **二回目 grind pacing dogfood** — the settle `cost(N)` ramp is uncapped, so second-route (settles 10–19) costs noticeably more than first route. Endgame-only; watch whether it feels too slow once the owner actually plays past full first-route. Folds naturally into the rebalance change (A2.2).

### A2 — Planned-but-not-started neurons changes (from `openspec/decisions/`)
1. **`add-neurons-maze-zoom-and-focus`** (Change B of the 2026-06-05 maze handoff; see `2026-06-05-neurons-next-changes-handoff.md`) — maze **縮放 / 手機觸控** + **按鍵聚焦科目** (build on the EXISTING `apps/neurons-tw/src/lib/maze/maze-focus.ts` — inspect it first) + 答題/閱讀時迷宮顯示機制. Owner: start with `/grill` Deep (scope open). **NOT started.**
2. **`rebalance-neurons-*`** (deferred number rebalance; see `2026-06-05-neurons-mechanics-rebalance-input.md`) — dogfood-tune `PACING_BASE=14` / `PACING_K=0.10` / `CORRECT_ANSWER_ENERGY=3` / `READING_MINUTE_ENERGY=3` / accel caps 2.5 (energy) & 2.0 (speed). **Now MORE relevant**: the 220-catalog doubles the endgame grind. Plus the audit's spec-hygiene findings:
   - **C1** (P3): `neuron-family-mastery` "two faucets" SHALL is energy-consolidation-stale → needs owner sign-off to rewrite (the retired global `neuralEnergyEarned/Spent` currency removability).
   - **C2** (P4): "二週目 least-collected" claim — **mostly resolved by this session's second-lap change** (the `economy.ts reconcileSettles` comment was rewritten to "first route random / 二回目 deterministic position-bound / past both routes → dupe"; no "least-collected" left there). Any remaining spec scenario still claiming least-collected should be reconciled if found.
   - **C3** (P5): `lib/sync/r2/bundles.ts` changelog cosmetics (per-branch wording).
   - **C4**: ⚠️ **NOW MOOT** — "first-pull 四大家族 onboarding visibility" was a question about the 4-branch first-pull, which was **REPLACED by the per-family path-representative** in `add-neurons-first-pull-path-rep` (shipped 2026-06-07, after that audit). The 4-branch first-pull no longer exists.
3. **NEW: `polish-neurons-pixel-font`** — see section B below. Owner said priority 可稍微往後擺 (defer).

### A3 — Peer / cross-session work (NOT mine — do not touch)
- **`add-cloudflare-auth-migration`** — a peer session's untracked proposal folder in the **main worktree** (`~/coding-scratch/study-rpg`). Left untouched throughout.
- Any active maze/other peer session in `track-neurons` — coordinate via session-bus (`/inbox`) before touching shared maze/spec files.

### A4 — Housekeeping (optional)
- `track-neurons` is now 2 commits "behind" main (main's merge commits `54fee4a` + `136324d`). Next neurons change should start with `git merge main` into `track-neurons` (standard dual-worktree catch-up) — not required until then.

---

## B. NEW change sketch — `polish-neurons-pixel-font` (DEFERRED — owner: 優先程度往後擺)

**Owner's ask (verbatim intent):** 仿照二階國考把字體改成像素風格的字體 (pixel font like 二階), **但所有答題系統的題目、選項、詳解必須仍是清楚顯示的字體** (quiz question / options / explanation MUST stay a legible font, NOT pixel), emoji 也要轉成像素風格 (emoji → pixel-style).

### Why this needs care (the core scoping constraint)
- 二階 (`apps/medexam2-hospital-tw`, now in the standalone `study-rpg-2nd` repo) uses **`font-family: 'Cubic 11'`** — a Traditional-Chinese pixel font.
- **Project NFR already warns**: 「CJK 像素字 fallback 到 Noto Sans TC（長題幹 pixel 字累人）」 — long CJK medical stems in a pixel font are exhausting to read. So the owner's "but quiz text stays legible" is the SAME concern, made explicit. **This change is fundamentally a font-scoping change, not a global swap.**

### Proposed scope (the pixel/legible split — refine in `/grill`)
- **PIXEL font** (the "RPG chrome"): app title / nav bar / section headers / buttons / chips / counters / flavor text (variant persona names, captions, family labels, achievement names, leaderboard chrome, DMN/maze UI labels).
- **LEGIBLE font (Noto Sans TC, current default)** — explicit allow-list, NEVER pixel:
  - **QuizModal**: question stem, the 4 options, explanation (詳解), the disclaimer/AI badge text.
  - **題庫 `/bank` (`QuestionBankPage.tsx`)**: all question/option/explanation cells.
  - Any long-form medical prose (bug-report body, help-menu paragraphs are borderline — decide in grill).
- **Emoji → pixel-style**: Cubic 11 does NOT cover emoji. Options to evaluate in grill: (a) a pixel-emoji font/sheet (e.g. twemoji rasterized small + `image-rendering: pixelated`), (b) replace key emojis with pixel-art `<img>` sprites (the app already has a pixel sprite pipeline — `theme-pixel-neurons`), (c) a pixel emoji webfont. Note many UI emojis are inline in JSX strings (🧬 🧠 ⚡ 🐞 ⭐ 🔬 etc.) — a global approach (emoji font) is far less work than per-emoji sprite swaps.

### Known technical pitfalls (from `study-rpg/CLAUDE.md` "Known sharp edges")
- **The webfont must live in `apps/neurons-tw/public/fonts/` + an app-level `@font-face`** — a theme package (`theme-pixel-neurons`) CANNOT ship the webfont to an npm consumer (npm won't publish the font file). Copy `Cubic 11` (or chosen pixel font) into the neurons app's `public/fonts/`. Check the font's license for redistribution.
- `font-display: swap` (project NFR) so it doesn't block first paint.
- Verify on prod with the SPA 三件套 + a Chrome MCP visual pass (pixel chrome renders; quiz/bank/explanation text confirmed NON-pixel; emoji renders pixel not broken-tofu).

### Recommended pipeline
`/grill` (scope: exact pixel-vs-legible surface list + emoji approach + which font) → `/opsx:propose polish-neurons-pixel-font` → apply → verify (Chrome MCP must confirm quiz/explanation legibility + emoji) → archive → merge → deploy. **Likely zero schema/sync** (pure presentation: CSS + font asset + maybe an emoji helper). Priority: after A2.1 (maze zoom/focus) or whenever the owner wants — explicitly deferred.

---

## C. Suggested next-session order (owner to confirm)
1. (if desired) `add-neurons-maze-zoom-and-focus` — the long-planned Change B.
2. `polish-neurons-pixel-font` — this one (deferred but well-scoped above).
3. `rebalance-neurons-*` — once there's dogfood telemetry on the 220-catalog grind.
