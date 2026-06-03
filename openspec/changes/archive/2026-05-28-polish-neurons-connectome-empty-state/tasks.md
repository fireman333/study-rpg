## 1. Read current state (2 min)

- [x] 1.1 Re-read `apps/neurons-tw/src/routes/ConnectomePage.tsx` to confirm header + SVG + section + debug panel layout (already done during proposal, but worth re-confirming before editing)
- [x] 1.2 Confirm `snapshot.synapses` exists on the `ConnectomeSnapshot` returned by `loadConnectome()` (it's the source of truth for visibility logic)

## 2. Add inline callout JSX to ConnectomePage (15 min)

- [x] 2.1 Add conditional block between `<header>` and `<ConnectomeTreeSvg pack={pack} />` that renders only when `snapshot.synapses.length === 0`
- [x] 2.2 Compose callout content per design Decision 4:
  - Opener: 「👋 第一次打開 connectome？」
  - Mechanic: 「向下捲動找到操作面板 → 挑一個 neuron family → 按『+1 答對』。同一天讓兩個 family 各答對 5 題，就能 wire 出你的第一條 synapse。」
  - Optional flavor line: 「Hebbian rule —『neurons that fire together, wire together』。」
- [x] 2.3 Add accessibility attributes: `role="region"` + `aria-label="新手指引"` on the container
- [x] 2.4 Add Unicode arrow `↓` (or CSS triangle) as visual cue near the end of the mechanic sentence, hinting at "scroll down"
- [x] 2.5 Inline styles for the callout: light purple/blue background distinct from page bg, padded ~1rem, rounded corners, max-width matches page (820 px constraint), font-size matching body
- [x] 2.6 If inline JSX exceeds ~30 lines (design Decision 2 threshold), extract to `apps/neurons-tw/src/components/ConnectomeEmptyStateCallout.tsx` instead

## 3. Verify (~10 min)

- [x] 3.1 `pnpm --filter @study-rpg/neurons-tw typecheck` ✅
- [x] 3.2 `pnpm --filter @study-rpg/neurons-tw build` ✅
- [x] 3.3 Dev smoke: `pnpm --filter @study-rpg/neurons-tw dev`; open localhost, navigate to `/connectome`. Verify callout appears above SVG (empty-state default).
- [x] 3.4 Chrome MCP smoke: use existing connected browser; navigate to `/connectome`; take screenshot confirming callout visible.
- [x] 3.5 Simulate user action: from Chrome MCP, click the debug panel's "+5 答對(一鍵 fire)" for two different families (creates first synapse); reload `/connectome`; verify callout has disappeared.
- [x] 3.6 Cleanup: reset state via debug panel "重設存檔（不可復原）"; verify callout reappears (regression check for Scenario 4).
- [x] 3.7 Mobile RWD probe per `~/.claude/imports/chrome_mcp_rwd_probe.md` class-override technique: probe at 360 / 414 / 600 / 1024 px widths; verify callout doesn't horizontal-overflow.
- [x] 3.8 `openspec validate polish-neurons-connectome-empty-state --strict` ✅

## 4. Archive (~5 min)

- [ ] 4.1 `/opsx:archive polish-neurons-connectome-empty-state` — syncs ADDED Requirement into `openspec/specs/neurons-mode/spec.md`
- [ ] 4.2 `openspec validate --all --strict` confirms 61 specs valid post-merge (no spec count change since delta merges into existing)
- [ ] 4.3 Explicit file-by-file `git add` per multi-agent git safety; commit with `spec(archive): merge polish-neurons-connectome-empty-state — first-time empty-state callout`

**Estimated total wall time**: ~30-40 min

## Acceptance criteria

- [x] `ConnectomePage.tsx` conditionally renders the callout when `snapshot.synapses.length === 0`
- [x] Callout includes welcome opener + 1-sentence mechanic + visual arrow cue + accessibility attributes
- [x] Callout disappears automatically when first synapse forms (Chrome MCP verified: synapse=1 → callout hidden)
- [x] Callout reappears after `重設存檔` / clearing synapses (Chrome MCP verified)
- [x] Mobile viewports (360-820 px) don't horizontal-overflow (RWD class-override probe: overflow=0 at 360/414/600/820/1024)
- [x] `pnpm --filter @study-rpg/neurons-tw typecheck` + `build` both pass
- [x] `openspec validate --strict` passes
- [x] No new dependencies, no new persistent state (no localStorage, no Dexie row, no SYNCED_META_KEY)
- [x] No regression: existing italic mechanic line under h1 stays put; debug panel unchanged
