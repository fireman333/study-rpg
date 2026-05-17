# Tasks

## 1. Measure current state

- [ ] 1.1 With dev server up and paused banner visible (sync.gateState === 'paused'), use Chrome MCP `javascript_tool` to read `getBoundingClientRect()` on both `.auth-button` and `.sync-paused-banner__btn` — record the exact center-y delta
- [ ] 1.2 Capture viewport ≥ 1024px (desktop), 768–1023px (tablet), < 768px (mobile) — confirm misalignment exists at all sizes, or note mobile reflow already stacks them

## 2. Apply CSS fix (Option A — adjust .auth-button top)

- [ ] 2.1 In `apps/medexam2-hospital-tw/src/styles.css`, find `.auth-button` rule (~line 1579)
- [ ] 2.2 Change `top: 12px` to a value computed from banner's `padding-top` (8px) + half the height delta — likely `top: 8px` works since banner btn vertical center ≈ 20px and chip natural height ≈ 26px ⇒ chip top 8px puts chip center at 8+13=21px (within 2px tolerance)
- [ ] 2.3 Verify via Chrome MCP that center-y delta is ≤ 2px at desktop viewport

## 3. Verify

- [ ] 3.1 `pnpm -r typecheck` (sanity; CSS-only change should not affect TS)
- [ ] 3.2 Chrome MCP visual confirm at 3 viewports: 1280, 1024, 768 — banner + chip share row alignment
- [ ] 3.3 Confirm standalone AuthButton (no banner) still looks fine — `top: 8px` should not look "stuck to top" awkwardly
- [ ] 3.4 No console errors

## 4. Archive

- [ ] 4.1 Update `openspec/specs/cloud-sync/spec.md` to absorb the new requirement (via `/opsx:archive` sync gate)
- [ ] 4.2 Commit: `feat(二階-sync polish): align paused-banner btn with AuthButton chip`
- [ ] 4.3 Don't push in this session — let user batch with other commits later
