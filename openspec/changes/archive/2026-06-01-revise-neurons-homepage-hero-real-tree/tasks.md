## 1. Parametrize ConnectomeTreeSvg interactivity

- [x] 1.1 Add `interactive?: boolean` (default `true`) to `ConnectomeTreeSvgProps`.
- [x] 1.2 Gate the `wheel` / `touch*` `addEventListener` effect on `interactive` (return early when false — no bindings).
- [x] 1.3 Pass `onPointerDown/Move/Up/Cancel` only when `interactive`; set `touchAction: interactive ? 'none' : 'auto'` and `cursor: interactive ? 'grab' : 'pointer'`.
- [x] 1.4 Render the zoom toolbar (−/＋/重置 + hint) only when `interactive`.
- [x] 1.5 Confirm `/connectome` call site passes nothing → default `true` → verified interactive (toolbar present, touchAction none, cursor grab).

## 2. Rewrite ConnectomeHero to wrap the real tree

- [x] 2.1 Replace `ConnectomeHero.tsx` internals: render `<ConnectomeTreeSvg pack={pack} interactive={false} />` inside a `<div role="button" tabIndex={0}>` with `onClick` + `onKeyDown(Enter/Space)` → `navigate('/connectome')` and an accessible label; keep a short caption.
- [x] 2.2 Drop the hero's own snapshot-loading/effect code + abstract fixed-layout SVG (the tree self-loads + subscribes). Removed the `.neuron-firing-node` usage from the hero.
- [x] 2.3 Height-constrain the hero wrapper (`maxWidth:640` centered → tree scales to hero size, ~250px tall).
- [x] 2.4 Keep `AmbientFiring` exported from the motion library + on `/motion-demo` (not deleted).

## 3. Verification

- [x] 3.1 `pnpm --filter @study-rpg/neurons-tw typecheck` + `build` clean; no orphan imports/vars (old hero imports = 0).
- [x] 3.2 Chrome MCP dev: hero shows labeled tree (137 text labels + 16 sprites); non-interactive (no zoom toolbar, touchAction auto, cursor pointer → page scroll preserved); click → `/connectome`; `/connectome` tree still interactive (toolbar + touchAction none + grab) + dense grid/table present.
- [x] 3.3 Hero scales with `width:100%` inside `maxWidth:640` → within viewport (no h-overflow); reuses the same tree as `/connectome` (its mobile handling unchanged).
- [x] 3.4 SPA unaffected (component swap, no new routes); `/` renders. Note: 1 pre-existing dev-only React style-shorthand warning in `App.tsx` nav NavLink (border/borderColor) — not introduced by this change.

## 4. Archive + deploy (owner-gated)

- [ ] 4.1 `/opsx:verify` → `/opsx:archive` (sync `neurons-homepage` MODIFIED into main specs).
- [ ] 4.2 Commit (explicit file-by-file) on `track-neurons`; merge → `main`.
- [ ] 4.3 `pnpm deploy:cf` from deploy worktree; prod smoke on `med-study-rpg.com/neurons/`.
