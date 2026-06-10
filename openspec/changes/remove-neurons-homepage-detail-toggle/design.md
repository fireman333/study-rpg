## Context

`apps/neurons-tw/src/components/ConnectomeStatCard.tsx` renders a `showDetail` `useState` + a 「▾ 詳細 / ▴ 收合」 toggle button. When expanded, `detailRow` shows 本週 X/7 (always), 最強 pair (only when `strongestPair != null`), and ⚡ 今日連線額外能量 (only when `todayConductionEnergy > 0`). For the common early-player case both conditionals are empty, so the disclosure reveals only one line (本週 X/7) — a click for no payoff.

## Goals / Non-Goals

**Goals:**
- Remove the disclosure friction; surface the small set of secondary signals without a toggle.
- Keep every signal (nothing dropped) and keep the card compact.

**Non-Goals:**
- No change to the card's CTA, causal-chain body, collection chips, or any engine value.
- No schema / sync / routing change.

## Decisions

- **本週 X/7 → always-visible core signal.** It is a meaningful weekly-engagement signal and the only unconditional item that was behind the toggle, so promoting it removes the toggle's reason to exist.
- **最強 pair / ⚡ 今日連線額外能量 → inline-when-present.** Keep their existing `&&` conditional render; just relocate them out of the toggled `detailRow` so they appear inline when they have a value and take no space otherwise. This avoids an empty/near-empty always-open detail row for new players.
- **Drop the toggle entirely** (remove `showDetail` state + the button + the now-unused `detailToggleStyle`). With nothing left to progressively disclose, the disclosure pattern is pure cruft.
- Placement of 本週 X/7 among the core signals is a presentation detail (e.g. alongside the 今日出征 / 連續 stage or as a small always-shown line); the spec only requires it be always-visible, leaving exact layout to apply-time + the owner's eye.

## Risks / Trade-offs

- **Slightly busier card when 最強 pair / ⚡ both have values** (two extra inline items for an engaged player) — acceptable; they are small and only appear once the player has cross-subject links, and the owner reviews the result.
- Pure presentation change; no data/rollback implications.
