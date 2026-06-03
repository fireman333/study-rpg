## Context

`ConnectomeHero` (shipped by `revamp-neurons-homepage-experience`) is a purpose-built fixed-layout SVG of colored dots — no text labels. The real `ConnectomeTreeSvg` (664 lines) renders the recognizable product visual (family sprites + `displayName` labels + AP chips + firedToday halos + state-styled synapse edges) but is interactive: it binds `wheel` / `touch*` via `svg.addEventListener` (lines 255-259), drags via React `onPointer*` props (387-390), and shows a zoom toolbar (−/＋/重置 + hint). Its force-sim rAF loop self-settles and `cancelAnimationFrame`s when stable (lines 149-168), then re-energizes only on interaction.

The user reviewed the shipped hero and finds it too abstract / potentially misleading. Decision (confirmed): swap the hero to the real labeled tree; keep the dense detail grid + synapse table on `/connectome` (do NOT full-merge).

## Goals / Non-Goals

**Goals:**
- Homepage hero is the real, labeled connectome — instantly legible as "my collection."
- It does not capture page-scroll or allow accidental pan/zoom/drag on the landing page.
- Clicking it routes to the full interactive `/connectome`.
- `/connectome` behavior is byte-for-byte unchanged.

**Non-Goals:**
- NOT moving the family-detail grid or synapse table onto the homepage.
- NOT making the homepage tree interactive (pan/zoom belongs on `/connectome`).
- NOT deleting the `AmbientFiring` primitive (stays a library export + `/motion-demo` trigger).

## Decisions

### D1 — Add `interactive?: boolean` (default true) to `ConnectomeTreeSvg`, embed with `false` on homepage
Rather than build/maintain a second tree, parametrize the existing one. When `interactive === false`:
- The `useEffect` that calls `svg.addEventListener('wheel' / 'touch*')` returns early (no bindings) — so wheel scrolls the page, not the tree.
- `onPointerDown/Move/Up/Cancel` are passed `undefined` — no drag/pan.
- The zoom toolbar (`zoomBarStyle` block with −/＋/重置 + hint) is not rendered.
- `style.touchAction` becomes `'auto'` and `cursor` becomes `'pointer'` (the wrapper handles the click) instead of `'none'`/`'grab'`.
- **Why a prop over a wrapper with `pointer-events:none`**: `pointer-events:none` would also kill the tree's own future interactivity and is a blunt instrument; an explicit flag keeps `/connectome` untouched (default `true`) and is self-documenting. Default `true` guarantees zero behavior change for the existing call site.

### D2 — `ConnectomeHero` becomes a thin wrapper around the real tree
Rewrite `ConnectomeHero` to render `<ConnectomeTreeSvg pack={pack} interactive={false} />` inside a `<div role="button" tabIndex={0}>` (NOT `<button>` — the tree renders a `<section>`, and `<button>` may not contain flow content) with `onClick` / `onKeyDown(Enter|Space)` → `navigate('/connectome')`, plus the existing caption. The tree self-loads its own snapshot + subscribes to connectome events, so the hero no longer needs its own data/effect code.
- Height is constrained on the wrapper (the svg is `width:100% height:auto`, aspect-ratio driven by the graph `bounds`); tuned during apply via Chrome MCP screenshot so the hero stays a reasonable height (not a full-screen tree). If natural height is too tall, constrain wrapper `max-width` to shrink it proportionally rather than `overflow:hidden` (which would crop the tree — an anti-pattern).

### D3 — Force-sim on the landing page is acceptable
The sim's rAF loop self-settles + cancels when stable and only re-energizes on interaction (which is disabled here), so the homepage cost is a brief one-time layout pass, not a perpetual loop. No `prefers-reduced-motion` regression: the tree's synapse animations are already gated by `useRespectsReducedMotion` per the existing connectome-collection spec; the layout pass is not decorative motion.

## Risks / Trade-offs

- [Embedded tree too tall / cramped on homepage] → tune wrapper width/height in apply via screenshot; prefer width-constraint over crop. Verify legibility < 768px.
- [`interactive` prop accidentally changes `/connectome`] → default `true`; `/connectome` passes nothing → unchanged. Smoke `/connectome` pan/zoom still works after the change.
- [Invalid DOM nesting if wrapped in `<button>`] → use `<div role="button" tabIndex>` with keyboard handler.
- [Sprites missing on homepage] → same sprite source as `/connectome`; if any family sprite is a placeholder it degrades identically (already the case on `/connectome`).
- [rAF "frozen" during Chrome MCP verify] → sim settles; assert final rendered tree (labels present), not a watch-it-animate loop (per rAF-throttle discipline).

## Migration Plan

Pure frontend. No data/route/Worker change. Deploy via the same `pnpm deploy:cf`. Rollback = revert commit + redeploy.

## Open Questions

- Exact homepage hero height / whether to cap the visible NT branches — resolved in apply via dogfood screenshot iteration.
