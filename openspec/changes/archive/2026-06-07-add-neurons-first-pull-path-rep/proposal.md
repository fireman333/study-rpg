# Replace the 4-branch first-pull with per-family path-representative neurons

## Why

The maze was flattened from 4 NT branches (DA / 5HT / GABA / Glu) to **11 per-subject families** (`decouple-neurons-subjects-from-nt-branches`, `promote-maze-to-home`). The shipped first-pull (`add-neurons-first-pull`, 2026-06-04) is still the **舊制度**: an explicit 首抽 CTA that grants one starter **per NT branch** (4 neurons) and lights 4 starter nodes. With branches gone, "4 starters, one per branch" no longer maps onto the 11-family maze — most families have no neuron of their own, and the branch grouping the ritual assumes no longer exists.

The **新制度** gives every one of the 11 families its own **path representative** neuron — seeded by a per-family first-pull and shown at that family's maze tract — so a save reads as "11 neurons, one per subject, walking their corridors". It also gives the upcoming maze features (#2 答題 zoom-focus, #5 分科閱讀) a concrete per-family character to focus on.

This change **replaces** the舊制度, it does not add a second one alongside it.

## What Changes

- **Remove the 4-branch 舊制度 first-pull** (net deletion): `lib/services/first-pull.ts` + `first-pull-keys.ts`, `components/FirstPull.tsx` (FirstPullButton + FirstPullModal), the FirstPullButton hosted in `HomepageOnboarding.tsx`, the synced meta keys `firstPullDone` + 4× `maze:<branch>:starterFamily`, and the `litNodesWithStarter` / `readStarterFamily` starter-lit overlay (maze node-lighting reverts to pure settle frontier). The `neurons-first-pull` capability spec is removed.
- **Per-family first-pull (新):** the first time the player completes an answer for a family (correct **or** incorrect), grant one free **guaranteed-P5** variant for that family, minted **silently** through the existing `pullVariant` path, and set it as that family's representative. Recorded once per family, idempotent across devices.
- **Representative drives the maze walker head:** `pickWalkerVariant` is extended to prefer the family's representative (when owned), else the current rarest heuristic. Each family's representative neuron renders at the tract walker position — so the maze shows 11 personal neurons.
- **Before a family's first answer:** the tract head renders a **grayscale silhouette** placeholder (was: generic growth-cone fallback), signalling "this subject's representative is not unlocked yet".
- **Re-select stays where it is:** the existing CollectionPage representative picker is the only re-select surface (no new FamilyPicker entry).
- **Persistence + sync (no Dexie bump):** reuse the existing per-family `representativeVariants` meta-key (already LWW + synced); add one synced `firstPullFamilies` meta key (monotonic union — a family's first-pull is never un-recorded). R2 bundle `SCHEMA_VERSION` 17 → 18 (meta-only, additive, reader-tolerant). **No new Dexie table, no `.version()` bump, no upgrade fixture.**

**Out of scope** (separate later changes): #2 quiz zoom-focus + exploration animation, #4 recruitment reveal, #5 per-subject reading, #6 expedition selection, and the shareable **character card** (`character-card.ts` still derives 4-branch reps — left untouched here; its 11-family redesign is a separate change).

## Impact

- **Affected specs:** new capability `neuron-path-representative` (ADDED); `neurons-first-pull` (REMOVED — the whole 4-branch capability is retired; because OpenSpec's REMOVED-delta cannot empty a spec, the capability spec is deleted directly rather than via a delta file); `neurons-brain-maze` (MODIFIED — walker sprite now representative + grayscale fallback; lit-node derivation drops the starter-lit union; persistence drops the `starterFamily` keys); `neurons-homepage` (MODIFIED — onboarding no longer hosts a 首抽 CTA).
- **Affected code:** `apps/neurons-tw/src/lib/services/` (new `family-representative`/first-pull grant hook in `connectome.ts`; delete `first-pull.ts` + `first-pull-keys.ts`), `lib/maze/useMaze.ts` (walker prefers representative; drop starter overlay) + `lib/maze/graph.ts` (`litNodesWithStarter` → `litNodes`), `components/{FirstPull.tsx (delete), HomepageOnboarding.tsx}`, `lib/sync/{tables.ts (SYNCED_META_KEYS), r2/bundles.ts (SCHEMA_VERSION)}`, `lib/services/representatives.ts` (reused as-is), `connectome.ts` account-reset (drop first-pull re-arm).
- **Player impact:** only the owner is currently testing, so the new rule applies directly — each family's first answer grants its P5; the old 首抽 CTA disappears; old `firstPullDone`/`starterFamily` keys are leave-and-ignore (dropped from the allowlist, harmless). No backfill, no banner.
- **Risk:** low — no Dexie schema change (reuse meta-key per the owner's own design decision); cross-version R2 tolerance reuses the established neurons bundle pattern; representative LWW + first-pull monotonic-union merge are both locked by sync-merge tests.
