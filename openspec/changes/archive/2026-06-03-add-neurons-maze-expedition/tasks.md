> Spec-after-prototype: the implementation was built and dogfood-approved as a spike, and most of it is already committed on `track-neurons` under the sibling change `expand-neurons-brain-maze-all-branches`. Tasks below are marked complete to reflect that; this change formalizes the capability spec and carries the remaining refinement diff through verify → archive → merge.

## 1. Assets

- [x] 1.1 Generate cute pastel neural-tissue ground image (codex gpt-image-2) → `apps/neurons-tw/src/assets/maze/expedition-bg.png` (64-color PNG, ~187K)
- [x] 1.2 Generate far brain-sulci sky image (Gemini) → `apps/neurons-tw/src/assets/maze/expedition-sky.png` (64-color PNG, ~97K)

## 2. Component (`MazeExpedition.tsx`)

- [x] 2.1 Create self-contained `MazeExpedition` with injected `<style>` keyframes (no sibling files, no new npm deps)
- [x] 2.2 Three parallax layers (sky ~34s / tissue ground ~17s with top mask-fade / particles ~6.5s), each looping seamlessly via `background-position` shifted by one tile width
- [x] 2.3 `useExpeditionSquad` live-query of `db.neuronVariants`; sort by rarity (P0 first) then `rolledAt`; take up to 5
- [x] 2.4 Render marchers as clean transparent sprites via `SPRITE_MAP[spriteKey]` (NOT `VariantSprite`), with drop-shadow + white halo + staggered bob; growth-cone fallback when collection empty
- [x] 2.5 `prefers-reduced-motion` media query freezes all layer + bob animations

## 3. Show/hide + persistence

- [x] 3.1 On-band "−" minimize button (`onHide` prop) with title clarifying the journey continues
- [x] 3.2 `MazeBetaPage`: persisted `expeditionOn` state via `localStorage['neurons:maze:expeditionShown']` (try/catch guarded) + `setExpedition` helper
- [x] 3.3 Header chip "🚀 顯示遠征動畫 / 🚀 隱藏遠征動畫" + conditional render `<MazeExpedition onHide={() => setExpedition(false)} />`

## 4. Verification (pipeline)

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw typecheck` passes
- [x] 4.2 Chrome-MCP functional smoke: band renders, 3 layers animate at distinct speeds, squad shows collected variants, ✕/− hides, persistence across reload, header label toggles, console clean
- [x] 4.3 Final `/verify` quality gate (dead-code audit + simplify) before archive
