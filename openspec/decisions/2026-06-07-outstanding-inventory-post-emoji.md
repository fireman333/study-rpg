# Handoff — outstanding-work inventory (2026-06-07, post-emoji)

> Written at owner request: 盤點還沒做的內容, then handoff → `/clear` → `/spec resume` to pick up.
> **Supersedes** `2026-06-07-outstanding-inventory-and-pixel-font-polish.md` (that one predated today's 3 ships — its A2.1 `add-neurons-maze-zoom-and-focus` and its §B `polish-neurons-pixel-font` are now BOTH shipped, and `pixelate-neurons-emoji` shipped after it).
> **State at write**: no active OpenSpec changes; `track-neurons` worktree clean, in sync with `origin/track-neurons` + `origin/main` (0/0); `openspec validate --all --strict` = **84/0**. Prod `med-study-rpg.com/neurons/` healthy.

## What shipped today (2026-06-07) — for context, all DONE
1. `add-neurons-maze-second-lap-variants` (110→220 catalog, D1 0007 applied) — main `54fee4a`
2. `add-neurons-first-pull-path-rep` — main `136324d`
3. `add-neurons-maze-zoom-and-focus` (mobile touch + sticky focus + per-subject reading + quiz energy strip) — main `cdfc1a3`
4. `polish-neurons-pixel-font` (Cubic 11 chrome font; exam/long-form legible) — main `b1a268b`
5. **`pixelate-neurons-emoji`** (chrome emoji → pixel `<img>` via EmojiIcon; exam/long-form native) — main `3782805`

## A0 — Nothing is broken / half-done
No active changes; clean worktree; all CI green. Everything below is **deferred polish**, **a planned-future change**, **peer work**, or **owner-dashboard cleanup** — none is an unfinished obligation from a session.

## A1 — `rebalance-neurons-*` (the owner-locked NEXT — main outstanding feature work)
Dogfood-tune the game-loop numbers; full input in **`openspec/decisions/2026-06-05-neurons-mechanics-rebalance-input.md`**.
- **Suspect numbers**: `PACING_BASE=14` / `PACING_K=0.10` / `CORRECT_ANSWER_ENERGY=3` / `READING_MINUTE_ENERGY=3` / accel caps **2.5 (energy)** & **2.0 (speed)**. Settle `cost(N)=round(24×(1+0.10·N))` ramp is uncapped.
- **Now MORE relevant**: the 220-catalog (second-lap) doubled the endgame grind AND per-subject reading slows each pool's fill — wants real dogfood telemetry first.
- **Spec-hygiene riders** (fold in):
  - **C1 (P3)**: `neuron-family-mastery` "two faucets" SHALL is energy-consolidation-stale (post-promote-maze-to-home there's ONE faucet now, not the old 4-branch split) → needs owner sign-off to rewrite.
  - **C3 (P5)**: `lib/sync/r2/bundles.ts` changelog wording still says per-branch (cosmetic).
  - (C2 mostly resolved by second-lap; C4 moot since first-pull was replaced by path-rep.)
- **Process**: start with `/grill` on the target numbers + acceptance ("what feels right"). Owner wants telemetry-first — may want to actually play past full first-route before locking numbers. **NOT started.**

## A2 — Deferred polish from `pixelate-neurons-emoji` (this session, low priority)
1. **Long-tail neurons-only emoji still native**: 🔢 🚫 😣 🔬 🔥 🐜 (each ≤2 occurrences) ride the graceful native fallback. Backfill = drop a 64×64 PNG into `apps/neurons-tw/public/icons/emoji/<codepoint>.png` + add a row to `apps/neurons-tw/src/lib/emoji-icons.ts` — **zero other code change**. Codepoints: 🔢`1f522` 🚫`1f6ab` 😣`1f623` 🔬`1f52c` 🔥`1f525` 🐜`1f41c`.
2. **Global `body` pixel-rendering deferred (D3)**: did NOT adopt 二階's `body{image-rendering:pixelated;-webkit-font-smoothing:none}` (legible surfaces re-assert antialiased). Per-`<img>` `imageRendering:pixelated` already crisps the emoji; the global rule is about making Cubic-11 *text* crunchier — a separate aesthetic call, risks regressing legibility. Revisit only if the owner wants the text crisper.
3. **String-context emoji left native** (by design D2): toast strings (SynapseFormationToast `push('✨',…)`), label-data consts (DmnDrawModal/EquipmentDexPanel/FamilyPicker group labels), AchievementCard date template, QuizHotkeysAnnouncementBanner sentence (mixed w/ uncovered ⌨️/❓). Pixelizing these needs restructuring strings→JSX — not worth it; they render fine native.

## A3 — Deferred polish from earlier changes (low priority)
1. **HomepageOnboarding paragraphs render pixel font** (from `polish-neurons-pixel-font`, Option-B accepted): the onboarding teaching bullets are pixel, not legible. Making them legible = ~1-line `fontFamily:'var(--font-legible)'` follow-up if the owner finds them tiring.
2. **From `add-neurons-maze-second-lap-variants`**: (a) per-family asymmetric K (currently uniform 10/family → 220; spec allows "natural crossings reached"); (b) bespoke art for location variants (currently family slot-1 sprite + position-keyed `hue-rotate`, by design); (c) 二回目 grind pacing — folds into A1 rebalance.

## A4 — Owner dashboard-only cleanup (I'm barred; tangential 一階-removal tail)
From `remove-medexam-tw-and-promote-neurons` (2026-06-03): **non-blocking** leftovers the owner must do via dashboards (I can't — permanent-delete / dashboard-only):
- Delete R2 `m1` (一階) snapshot blobs in bucket `study-rpg-saves` (`wrangler` has no `r2 object list` → CF dashboard).
- Supabase Auth redirect-URI allowlist tidy-up (NO `config push` — would wipe the OAuth provider; dashboard only).
- (Supabase migrations 0016 DROP-4-tables + 0017 neurons bug_reports CHECK were CONFIRMED already applied.)
These don't block any neurons feature.

## A5 — Future roadmap (not now)
- **M6 — Social light** (⏳): 朋友 leaderboard (read-time / mastery%) + **公開分享角色卡 OG image** (the "deeper share-card" idea — neurons already has `/collection` 🔗 分享角色卡 / `ShareCardModal`; OG-image + richer context-art-on-card is the M6 extension).
- **M7 (stretch)** (⏳): community content/theme PRs + `content-toefl-mini` forkability demo.

## A6 — Peer / cross-session (NOT mine — do not touch)
- **`add-cloudflare-auth-migration`** — peer's untracked proposal folder in the **main worktree** (`~/coding-scratch/study-rpg`). Left untouched throughout today.
- Before touching shared maze/spec files, check session-bus `/inbox` for active peers.

---

## Suggested next-session order (owner to confirm)
1. **`rebalance-neurons-*`** (A1) — the main outstanding feature; `/grill` on numbers first, ideally after some dogfood play on the 220-catalog grind.
2. Opportunistic low-effort polish if desired: A2.1 (6 long-tail emoji PNGs) / A3.1 (onboarding legible 1-liner).
3. M6 share-card-OG only when the owner wants social features.

## Process reminders
- Worktree `track-neurons` (`~/coding-scratch/study-rpg-neurons`); `main` checked out in `~/coding-scratch/study-rpg` — merge→main happens THERE (`git -C … merge --no-ff`), triggers `deploy-cf-pages.yml` = deploy. Confirm before merge (GATE 2).
- `track-neurons` is currently in sync with `origin/main` (today's merges already caught up). A future change should still re-check + `git merge origin/main` at start.
- Multi-agent safety: explicit per-file `git add`; revert `meta.json` builtAt churn (dev/predev content-copy re-stamps it); leave the main-worktree peer folder alone.
- Neuroscience facts → `/oe` (OpenEvidence), not memory.
- Image-gen: Gemini MCP cookie was logged-out today (`account_status=UNAUTHENTICATED`) → codex CLI was the working fallback (`codex exec -m gpt-5.5 --sandbox workspace-write --skip-git-repo-check "… $imagegen" < /dev/null`). If generating sprites/icons next session, expect to use codex unless the owner re-logs into Gemini in Chrome.
