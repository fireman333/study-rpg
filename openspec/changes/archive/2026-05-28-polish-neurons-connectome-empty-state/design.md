## Context

`ConnectomePage` currently has this structure:

```
<header>
  <h1>Connectome 連結組</h1>
  <p style={italic}>11 個 neuron family 分布於 4 條 NT 分支 · 同一天兩個 family 各答對 5 題即 wire 出 synapse · LTP / LTD 不 rupture</p>
</header>
<ConnectomeTreeSvg />
<section>🧬 Neuron family 詳細(action potential 與槽位進度)</section>
<ConnectomeDebugPanel />  // the actual interaction surface
```

For a first-time user with zero synapses, the SVG renders an empty skeletal tree (11 family nodes + 4 NT branch hubs + 1 root, no edges). The italic line under h1 is the only mechanic explanation and is easy to skim past. The `ConnectomeDebugPanel` sits below the SVG (often below the fold) and uses dev-flavored labels (傾印狀態到 console / 重設存檔（不可復原）) that look intimidating to a new user.

This change inserts a friendly conditional callout between the header and the SVG that:

1. Welcomes the user with a 1-2 sentence game-loop summary
2. Visually arrows down toward the debug panel
3. Auto-disappears once the user records 1+ correct answer (synapse count > 0)

The other two pieces of the "polish-neurons-pre-ship" roadmap entry (reading-timer service + study-category achievement triggers) are coupled to each other and are out of scope. They will ship in their own change.

## Goals / Non-Goals

**Goals:**

- Zero-synapse users see a clear "this is where you start" CTA above the fold
- Banner content explains the synapse-formation rule in plain language (not just terse mechanics)
- Banner auto-dismisses on first synapse (no manual close button to clutter UI; user's first action naturally removes it)
- No new persistent state — derived purely from `snapshot.synapses.length`
- Mobile-friendly responsive layout (the page already responds to viewport; banner should too)
- Spec requirement locks the contract so future agents don't accidentally remove the empty-state cue during refactor

**Non-Goals:**

- **不** ship a real quiz UI (genuinely larger work; out of scope for "completion polish")
- **不** add a multi-step interactive tutorial / coach marks
- **不** persist a "user dismissed welcome" flag (no localStorage, no Dexie)
- **不** modify the existing italic mechanic line under h1 (it remains as reference)
- **不** redesign or relabel the debug panel itself (still pragmatically labeled; user just needs to know it's there)
- **不**改 the SVG visualization or force-sim behavior
- **不** add analytics / telemetry tracking banner views

## Decisions

### Decision 1: Banner visibility = derived from `snapshot.synapses.length === 0`

**Choice**: Banner renders conditionally based purely on `snapshot.synapses.length === 0`. No localStorage flag, no Dexie row, no `?welcome=hidden` URL param.

**Why**:

- Derived state is simpler — never out of sync with reality
- A user who has 1 synapse already doesn't need the welcome (they've succeeded)
- A user who later resets state (debug panel "重設存檔") will see the welcome again — appropriate, they're effectively first-time again
- Avoids cross-device sync complexity (no need to add a meta key to `SYNCED_META_KEYS`)
- No risk of a stuck-on state from a corrupted flag

**Alternatives considered**:

- localStorage `connectome-welcome-dismissed: true` — rejected; cross-device sync would surface a different state per device, confusing
- Dexie `meta.connectomeWelcomeDismissed` with sync — rejected; over-engineered for one banner; adds a new SYNCED_META_KEY for no observable benefit

### Decision 2: Inline JSX vs extract `ConnectomeEmptyStateCallout` component

**Choice**: Start with inline JSX in `ConnectomePage.tsx`. Extract to `apps/neurons-tw/src/components/ConnectomeEmptyStateCallout.tsx` only if the inline block exceeds ~30 lines of JSX (excluding styles) — measured during apply phase.

**Why**:

- Inline is one less file, easier to review
- Component extraction has a cost (boundary discipline, prop types, file ceremony) only worth paying when reused or the inline grows complex
- This banner is consumed exactly once on one page — no current case for reuse
- Threshold of 30 lines is the practical break-point past which inline becomes harder to read

**Alternatives considered**:

- Always extract — rejected; premature abstraction (coding_principles.md "No Half-finished Implementations")
- Use existing modal infrastructure (e.g., `VariantUnlockModal`) — rejected; modal interrupts; banner is non-blocking visual cue

### Decision 3: Visual direction-pointer = CSS-rendered arrow, not SVG / external icon

**Choice**: The "↓ scroll to debug panel" arrow is rendered as a CSS Unicode arrow character (e.g., `↓` or `▼`) or a simple CSS-borders triangle. Not an imported SVG icon, not a custom `<svg>`.

**Why**:

- Zero bundle cost (Unicode char is free; CSS triangle is ~10 bytes of inline style)
- Existing pages in neurons-tw use Unicode arrows elsewhere (e.g., NT chip labels) — consistent
- No new asset / sprite needed
- Trivially restyle-able

### Decision 4: Banner copy in Traditional Chinese, friendly tone, 50-100 chars total

**Choice**: Banner has:
- One short opener (e.g., 「👋 第一次來？這裡是你的 connectome。」)
- One-sentence mechanic explanation (e.g., 「向下捲動找到操作面板，挑一個家族 → 按『+1 答對』 → 同天 2 個家族各答對 5 題就會長出第一條 synapse。」)
- Optionally a sub-line with the LTP analogy / Hebb quote for flavor

Total ≤ 120 chars Chinese.

**Why**:

- Brevity prevents fatigue; longer banners get skipped
- Tone matches existing page (友善 but informative, not 教學)
- Echoes the engine's existing italic line without duplication

### Decision 5: Identity-locking requirement on `neurons-mode`, not `connectome-collection`

**Choice**: The new spec requirement attaches to `neurons-mode` umbrella, not `connectome-collection`.

**Why**:

- `connectome-collection` defines the engine-level rules of synapse formation; banner is UX presentation that should be locked at the umbrella level (mirrors `generate-neurons-sprites` precedent which also added a UX identity-lock to `neurons-mode`)
- `neurons-mode` is the natural home for "user-facing UX presence" contracts vs `connectome-collection` which is the data/state contract
- Keeps `connectome-collection` spec lean and focused on the synapse formation rules

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Banner becomes annoying to users who close it deliberately | Auto-dismiss on first synapse means user's first interaction removes it — no need for a close button. If user actively wants to revisit, they can `重設存檔` |
| Banner copy gets stale if the debug panel is replaced with a real quiz UI | Spec requirement is phrased about "the interaction surface" not "the debug panel" — future quiz UI ship can update banner copy without breaking the requirement |
| Layout shift on transition from "banner visible" to "banner hidden" might disorient | Banner placement is between header and SVG — transition is at top of page, won't disrupt user already scrolled below |
| Mobile layout overflow | Banner uses same `max-width: 820` constraint as the page wrapper; tested via Chrome MCP RWD probe at 360/414/600/1024 widths in apply phase |
| First-time accessibility (screen reader) | Banner should have `role="region"` + `aria-label="新手指引"` so screen readers announce it on page load |

## Migration Plan

**Deploy path**: standard `pnpm deploy:cf` (CF Pages direct-upload) + GH Actions auto-deploy on push to `main`. No new env vars. No Worker / D1 / Supabase change.

**Rollback**: if banner causes any layout / UX issue, revert `ConnectomePage.tsx` to drop the conditional block. Spec requirement would need follow-up revert change.

**Cross-track impact**: `track-m2` (二階) and `main` (一階) do not consume `apps/neurons-tw/`, so zero cross-track conflict risk.

## Open Questions

None at design time. Apply may surface small copy / a11y details that get resolved inline.
