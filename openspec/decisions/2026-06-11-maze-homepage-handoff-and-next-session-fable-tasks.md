# Handoff — neurons homepage maze (2026-06-11) + NEXT-SESSION Fable tasks

> For `/spec resume`. Everything below is **committed on `track-neurons`** (working tree clean at handoff). **Nothing is merged to `main` or deployed** — all WIP. Deploy waits until the maze work is complete + owner iPhone-verified.

## What shipped to track-neurons this session (commits, newest last)
- `a5fa6b7` — archived **consolidate-neurons-dmn-draw-surface** (DMN draw folded into homepage card, top-nav DMN button removed) + RWD nits. **ARCHIVED** (specs synced).
- `296295c` — maze redesign **§1 static-render + §1.6 pan-bounds + collapsible how-to** (WIP).
- `be41a50` — homepage polish (flat year chips newest-first/no-count, caption below maze, one-row hero title drop "Edition", Hebb quote clamp). ad-hoc, no change.
- `97b8776` — maze redesign **§2 walker-glide + §3 node-reveal + §4 synapse-pulse + walker size/quality** (WIP).
- `0de0a92` — **reposition-neurons-maze-master-detail** (WIP): maze moved INSIDE the「選 family 直接練習」box as master-detail; deep card↔maze integration (per-card axon strip + spotlight + walker reverse-select); settle-triggered neuron-travel reward animation; first-visit-expand; mobile in-flow (the earlier sticky compact band was reverted — it blocked the viewport). OpenSpec补完 + validate clean.

## Two in-progress OpenSpec changes (NOT archived)
1. **`redesign-neurons-maze-static-render`** — §1–§4 done (shipped above). PENDING: §5 focus-fly (partly absorbed by reposition's emphasis/focus → re-evaluate), §6 ambient, §7 finalize, §8 per-cell progress-ranked colour bands.
2. **`reposition-neurons-maze-master-detail`** — master-detail + deep-integration + travel all implemented (tasks §1–§6.4 done; spec deltas neurons-homepage + neurons-brain-maze MODIFIED+ADDED). PENDING: §6.5 owner iPhone verify.

## Owner iPhone verify still pending (do NOT merge/deploy before this)
Mobile maze in-flow does NOT block viewport / trap scroll; per-card axon dots legible + frontier pulse; card→spotlight + scroll-to-maze; walker→reverse-select card; 🔭 全覽 clears spotlight (no 🎯 chip on mobile); settle → neuron travels (trail + arrival bounce); reduced-motion → snap.

## Hard constraints (all maze work)
ONE `MazeGrid` canvas — never a 2nd, never re-parent/remount it (CSS reflow / show-hide / camera-focus only). No steady-state rAF (one-shot transients OK). `prefers-reduced-motion` safe. Pure presentation — zero Dexie/R2/SYNCED_META/economy-value/schema change. Whole-connectome (cross-subject synapses) must stay accessible (🔭 全覽). Perf: iOS Safari OOM was the reason for the §1 rewrite — keep it light.

## Verify context
- Dev server is likely dead next session — restart: `cd ~/coding-scratch/study-rpg-neurons && pnpm dev --host` → iPhone opens `http://<mac-LAN-ip>:5175/` (was 192.168.1.119, same WiFi).
- Chrome MCP `resize_window` does NOT change the page `innerWidth` here (stays ~1440) → mobile (<768) is NOT viewport-testable in Chrome; verify desktop in Chrome, owner verifies mobile on real iPhone.
- Quality gates each pass: `pnpm --filter @study-rpg/neurons-tw exec tsc --noEmit` + `pnpm --filter @study-rpg/neurons-tw test` (563) + Chrome desktop non-regression (exactly one `<canvas>`, no console errors).

## NEXT SESSION — owner directive: spawn MULTIPLE PARALLEL Fable 5 agents
Owner: 「下一個 session 可以 spawn 多個平行的 fable 5 agent 去做以下工作，可以平行的話派愈多愈好，不用擔心 token 問題。」 Use `Agent` with `model: "fable"`, several in ONE message so they run concurrently. Each: WRITE access, same worktree, must respect the hard constraints above, verify (tsc + 563 + Chrome desktop), report; do NOT git commit (main agent reviews + commits). **Caution: agents editing the SAME files in parallel will conflict** — partition by file/concern, or run design-only (read) agents in parallel + sequence the implementation agents that touch `MazeGrid.tsx`/`OverviewPage.tsx`/`FamilyPicker.tsx`/`styles.css`.

Tasks for the Fable agents:
1. **Desktop design-language optimization** (maze-beside-family): (a) how to gracefully transition the **light (cream `#f4ecd8` cards) ↔ dark (navy maze panel) colour schemes** so the maze-in-the-box doesn't read as a jarring「米框包黑框」(full-bleed? a gradient/seam? a frame treatment?); (b) explore **"when the maze opens, collapse the family cards to a SINGLE row so the maze can open much bigger"** (e.g. a one-row rail of compact cards beside/under a large maze) — weigh vs the current 2-col grid.
2. **Mobile disjointedness**: the current「點卡 → 跳到最上面開迷宮」(in-flow maze at top + `scrollIntoView`) still feels 割裂 (jarring jump). Optimize — find a mobile interaction that gives per-subject feedback WITHOUT the jarring scroll-jump and WITHOUT reintroducing the viewport-blocking sticky band that was just reverted. (Constraint: one canvas, mobile must not trap page scroll.)
3. **Fable's earlier recommendations** (from the travel-animation pass): §6 ambient idle "breathe" on the walker sprite (CSS, reduced-motion off); trail density tuning for low-end mobile (`TRAVEL_TRAIL_EVERY_MS` / cap, halve on touch); arrival-ring colour (family-colour vs gold).
4. **redesign-neurons-maze-static-render §5–§8**: §5 focus-fly (re-evaluate — reposition may have absorbed it), §6 ambient firing (CSS keyframes, replace any canvas ambient), §7 finalize/teardown, §8 per-cell progress-ranked colour bands (ranks by the already-synced `maze:<fam>:settles`, zero new state).

After the Fable agents land, main agent: re-verify, present to owner for iPhone verify, then (owner go-ahead) batched **merge track-neurons → main → CF Pages deploy** for the whole maze-redesign + reposition batch.

## Files in play
`apps/neurons-tw/src/routes/OverviewPage.tsx` (composition, mazeSlot, focusFamilyOnMaze, mazeHintByFamily, expand/collapse + device-local pref), `apps/neurons-tw/src/components/FamilyPicker.tsx` (master-detail box, AxonProgressStrip, selected ring, `#family-card-<id>`), `apps/neurons-tw/src/components/maze/MazeGrid.tsx` (the one canvas: positionWalkers/positionPings, glide, pings, spotlight emphasis, walker reverse-tap, travel animation, clampPan, how-to/expedition/legend/topbar/stage classes), `apps/neurons-tw/src/styles.css` (`.neurons-md`, `.maze-stage`, `.neurons-maze-teaser`, `.neurons-axon-strip`, `.maze-ping-*`, mobile media queries), `apps/neurons-tw/src/components/VariantUnlockModal.tsx` + `apps/neurons-tw/src/lib/services/variant-gacha.ts` (`revealQueueIdle` event gating the travel animation).
