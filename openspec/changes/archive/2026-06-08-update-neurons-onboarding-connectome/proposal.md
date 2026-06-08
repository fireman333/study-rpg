## Why

Several player-facing systems shipped recently in `apps/neurons-tw` — the **connector neuron** (連結神經元, the wire→strong bridge collectibles from `add-neurons-connector-neuron-family`), the **acceleration system** (consumables + permanent equipment), **living companions**, **achievements**, the **question bank** (`/bank`), and the **split expedition / per-book exam modes** — but the in-app `❓` HelpMenu reference drawer still only documents the older mechanics. New and returning players have no in-app reference for the *complete* current loop, and in particular nothing explains the connector neuron, which is the wiring payoff the rest of the connectome work was building toward. This change brings the reference drawer in sync with what is actually live.

## What Changes

- Refresh the neurons-tw HelpMenu (`apps/neurons-tw/src/components/HelpMenu.tsx`) reference sections to cover the full current player loop. New sections: `question-bank` (📚 題庫總覽), `expedition` (⚔️ 出征模式), `wrong-review` (📋 錯題複習), `first-pull-second-lap` (🌟 首答 + 二回目), `connector-neuron` (🔌 連結神經元), `acceleration` (⚡ 加速系統), `companion` (🐛 活體夥伴), `achievements` (🏅 成就); plus clarified `variant-unlock` copy (220-variant collection split now cross-references the dedicated 二回目 section instead of inlining it).
- Correct factual drift surfaced during this refresh so the drawer matches shipped reality: the `achievements` section count (30 → **33**, after the variant category grew to 8), and the pre-existing `dmn-draws` section (card count 20 → **22** with tier split P2 4→5 / P3 6→7, and the behavior-axis trigger line trimmed to **變體解鎖 only** since the synapse-formed / synapse-strengthened DMN draws were removed by the connectome rework).
- **Scope is the HelpMenu reference drawer only.** The first-visit `HomepageOnboarding` 4-step panel is **left unchanged** — it already teaches the core read → quiz → maze → 修復/連線 loop, and the connector neuron is an advanced payoff better placed in the persistent reference than in the first-visit flow.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-mode`: light descriptive refinement to the "global HelpMenu" requirement prose — acknowledge that the drawer documents the **full current shipped loop incl. connector neurons / acceleration / companions / achievements / question bank / expedition modes**, while keeping the requirement **generic** (the section list is intentionally NOT enumerated/locked in-spec, so the drawer can keep tracking shipped mechanics without spec churn).

## Impact

- **Code**: `apps/neurons-tw/src/components/HelpMenu.tsx` (reference copy only — the edits already exist as uncommitted working-tree changes).
- **No** Dexie schema bump, **no** R2 / sync change, **no** Worker / D1 change, **no** new dependency. Pure player-facing reference copy.
- **First-visit onboarding panel** (`HomepageOnboarding.tsx`) and its `neurons-homepage` onboarding requirement are untouched.
