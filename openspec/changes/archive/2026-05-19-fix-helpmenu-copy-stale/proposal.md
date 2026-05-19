## Why

Live audit (Chrome MCP on `https://fireman333.github.io/study-rpg/hospital/`, commit `89e8d83`) found two **stale strings** in `HelpMenu.tsx` that directly contradict shipped game behavior:

1. **§tier-upgrade body** ([HelpMenu.tsx:89](apps/medexam2-hospital-tw/src/components/HelpMenu.tsx:89)) still says 「48k 聲望 / 192k / 2M」 but actual `TIER_UPGRADE_THRESHOLDS` are **30k / 80k / 150k** (recalibrated by archived change `add-quiz-economy-redesign` 2026-05-19). Numbers are off by up to 13× — a player following the help text to plan progression will badly mis-estimate.
2. **§retire body** ([HelpMenu.tsx:71](apps/medexam2-hospital-tw/src/components/HelpMenu.tsx:71)) tells players to click 「退休」 button, but the button label was renamed to **`AAD`** by archived change `rename-retire-to-aad` 2026-05-19 (tooltip carries the 自願離院/退休 fallback).

Both ship to prod (`48k` / `退休` substrings present in live bundle). This is a Bug Triage L2 batch-copy fix per [project.md Bug Triage Workflow](openspec/project.md). Zero behaviour change, no schema migration — but high impact on dogfood credibility.

## What Changes

- **HelpMenu §tier-upgrade body** SHALL render tier thresholds dynamically from `TIER_UPGRADE_THRESHOLDS` constant (imported from `@study-rpg/content-medexam2-tw`) instead of hard-coded numbers. This prevents future drift the next time thresholds tune.
- **HelpMenu §retire body** SHALL refer to the button as `AAD` (with parenthetical 自願離院 全稱 once on first mention for new-player clarity). Section `id`/`title` keep saying 退休 — those are internal identifiers / accordion heading the user reads BEFORE clicking, consistent with [rename-retire-to-aad](openspec/changes/archive/2026-05-19-rename-retire-to-aad/proposal.md)'s deliberate choice to keep internal names stable.
- **Add a derived spec sub-clause** under `hospital-tutorial` Req "Always-available help menu" stating that HelpMenu copy referencing numeric constants SHALL source from the constants module to prevent silent drift.

## Capabilities

### New Capabilities

無 — 純 UI string fix, no new behaviour.

### Modified Capabilities

- `hospital-tutorial`: existing Req "Always-available help menu SHALL list all mechanic explanations" gains a sub-clause requiring tier-threshold copy to source from `TIER_UPGRADE_THRESHOLDS` and §retire copy to use the AAD label.

## Impact

- **Code files modified**:
  - `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` — add `TIER_UPGRADE_THRESHOLDS` import; template-literal the §tier-upgrade body; rewrite §retire body string
- **Spec files modified**:
  - `openspec/specs/hospital-tutorial/spec.md` — append AAD-label + dynamic-threshold sub-clauses + 2 new Scenarios (delta-merged via archive)
- **Zero schema change**: no Dexie migration, no cloud-sync table change, no new dependency
- **Zero behaviour change**: tier thresholds and retire mechanics already function correctly; only the explanatory text changes
- **Verification surface**: typecheck + Chrome MCP smoke on live (HelpMenu open → expand §tier-upgrade verifies 30k / 80k / 150k → expand §retire verifies AAD label)
- **No breaking risk**: one-app surface (medexam2-hospital-tw); 一階 medexam-tw 不受影響
