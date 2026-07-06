## Context

`DailyPrescriptionCard.tsx` is the homepage's topmost surface. It already: renders a `dayComplete` state (「今日處方已完成 · 好好收工」), shows `completedDayCount` (「已固化 X 天」), renders `Ng0717BranchBuds` (grown per-subject buds), and carries a low-salience `<Link to="/cram">考前？看高頻考點 →</Link>`. It is presentation-only (all values from `usePrescriptionStatus`).

The calm view (Idea 3) is the "考前收斂" reassurance form. Design decisions were locked via `/grill quick` + a Codex (gpt-5.5) copy consult — see `~/.claude/scratch/grilled-neurons-cram-calm-view-2026-07-06.md`. Locked: placement = expand from the card's 「考前？」 area; timing = only after `dayComplete`; positioning = passive display + ONE non-actional closing line (zero CTA); signals = 2 primary numbers + NG-0717 as small print; exact 繁中 wording locked to the millimetre.

## Goals / Non-Goals

**Goals:**
- A dayComplete-gated calm panel that mirrors the player's own positive footprint and gently permits rest, never implying a gap or an exam prediction.
- Show ONLY the genuinely-new content (high-frequency 考點 coverage count + the locked closing line); do not duplicate the `completedDayCount` / NG buds the card already shows (avoids a second achievement wall).
- Zero schema/sync/meta-key; pure derived.

**Non-Goals:**
- No CTA / on-ramp inside the calm view (would re-introduce task-pressure/deficit).
- No percentage, denominator, remaining-count, gap placeholder, or exam-prediction language (hard guardrail).
- No new persisted state beyond a device-local expand toggle.
- Not shown before `dayComplete` (so no empty-state design is needed — a zero-footprint new player never reaches it).

## Decisions

### D1 — Placement: expand from the card's 「考前？」 region, only when `dayComplete`

When `dayComplete` is true, the existing 「考前？看高頻考點 →」 area gains an expandable calm panel (device-local collapse state, default collapsed, mirroring the card's existing `homeCollapsed` pattern — a `prescription:*` LOCAL-ONLY UI pref, NOT synced). The `<Link to="/cram">` stays reachable. Before `dayComplete`, nothing changes (link behaves exactly as today). Alternatives considered: (a) /cram page-top panel — rejected, anxiety happens on the homepage; (b) standalone nav entry — rejected, too heavy, reads as "another thing to manage".

### D2 — Lean content: only what the card does NOT already show

The card already shows `completedDayCount` (「已固化 X 天」) and the NG-0717 buds above. Re-stating them in the calm view would duplicate exactly the "achievement wall by stacking numbers" Codex warned against. So the calm view shows ONLY the genuinely-new content:
- coverage count (NEW) → 「你已答對過 {M} 個高頻考點的題目。」
- closing line → 「今晚可以停在這裡，讓連結慢慢固化。」

`completedDayCount` and the NG buds stay where they already are on the card (the calm view sits in the same card, so they read as one coherent calm block without duplication). This supersedes the grill's initial "2 primary + NG small print" once we learned the card already surfaces two of those three signals (owner steer: 精瘦版).

### D3 — Coverage count derivation (pure, zero schema)

`coverageConceptCount` = number of distinct cram 考點 (push items across all subjects in `cram.json`) for which ≥1 `sourceQuestionId` has a `questionHistory` row with `lastResult === 'correct'`. This is Idea 1's per-item coverage aggregated to a count. A pure helper `countCoveredConcepts(cramBooks, consolidatedIds)` is unit-tested. The card obtains it via a small hook (cram data + `useQuestionHistory()`), keeping the card itself presentation-only in spirit (the hook does the derive). It is a count of a bounded set (~545 leaves), monotonic in practice under the same near-monotonic caveat as Idea 1 (`lastResult` LWW), documented and accepted.

### D4 — Wording is locked; only a bare integer is interpolated; build-time禁詞 lint

The coverage line and the closing line are fixed literals; the ONLY dynamic insert is a bare integer (`{M}`) — a denominator is structurally impossible. A build-time lint (extending the cram validator, or a sibling calm-copy guard) fails the build if the calm view's static copy contains any banned token: 連續 / 掌握 / 覆蓋 / 覆蓋率 / % / `X/Y` / 還差 / 剩下 / 還沒讀 / 保證 / 必中 / 今年一定考 / 「會派上用場」. Closing line locked: 「今晚可以停在這裡，讓連結慢慢固化。」

### D5 — Zero CTA, passive only

The panel renders text only + NG small print. No button, no `<Link>` inside the calm content itself (the pre-existing 考前 `<Link to="/cram">` remains as the card's separate low-salience exit, outside the calm panel). This is the core anti-anxiety guardrail: a calm view with a CTA is not calm.

## Risks / Trade-offs

- **Redundancy with existing card content** → Resolved by the lean design (D2): the calm view shows only the coverage count + closing line; `completedDayCount` and NG buds are not restated.
- **Coverage count near-monotonic** (`lastResult` flips on a later wrong) → Same accepted trade-off as Idea 1; over a 545-concept set the aggregate count is very stable. Documented.
- **Copy drifting past the honesty line in a future edit** → Mitigated by the build-time禁詞 lint (D4), so a banned word cannot ship silently.
- **Panel adds homepage visual weight** → Mitigated by dayComplete-gating + default-collapsed + small print; it is opt-in and only appears at the calm moment.

## Migration Plan

Pure additive client-side change. No data migration, no schema/version bump, no backend. Deploy = normal CF Pages push. Rollback = revert (no persisted state beyond a device-local UI toggle).

## Open Questions

- Closing-line A/B: owner reserved the right to later swap to the runner-up 「今天的神經連結已經留下來了，今晚可以休息。」 — a one-literal change, non-blocking.
- Whether the NG-0717 small line should later deep-link to /dmn or imprint detail — v1 stays pure display (zero CTA); deferred.
