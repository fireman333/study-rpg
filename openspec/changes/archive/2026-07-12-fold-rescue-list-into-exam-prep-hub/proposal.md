## Why

The 考前救急 (exam rescue) plan **list** is now redundant. Since `add-neurons-exam-prep-hub` shipped, the 考前中心 hub (`/cram`) renders a rescue **status strip** at its top that already reflects every active plan (each family's D-countdown + RescueScore + 今日佇列 CTA). Meanwhile the homepage's header「考前救急」entry still opens a *separate* multi-plan overview list (the RescueScene `'list'` phase) — a near 1:1 duplicate of that strip. The owner asked to remove the standalone plan-list destination and fold it into the hub's top block, leaving a single place to see and manage rescue plans.

## What Changes

- The hub rescue **status strip becomes the single homepage-reachable rescue plan-list surface**. When there is at least one active plan and the active count is below the hard cap of 5, the strip renders a low-key「＋ 新增計畫」affordance at its tail; tapping it opens rescue **setup directly** (add-new-plan mode, preselecting a subject that has no active plan). At the 5-plan cap the「＋」is hidden (opening / editing / abandoning existing plans stays available). The empty state keeps its existing「建立考前救急」CTA unchanged.
- The homepage `FamilyPicker` header「考前救急」entry **navigates to the 考前中心 hub (`/cram`)** instead of opening a separate rescue-plans overview overlay. It stays the single top-level homepage rescue entry (still no per-card rescue-start buttons), still un-gated by the weakness threshold; only its behaviour/wording changes (open overlay → navigate to hub).
- The RescueScene `'list'` phase is **downgraded to fallback-only** (retained, commented): it still serves the mid-scene plan-vanish safety net and the in-scene 切科 / back-to-list exit. It is no longer a homepage-reachable *entry destination* — but it is NOT deleted (deleting it would degrade the cross-device abandon UX from「stay in the scene, see other plans」to「kicked out」).
- **Unchanged (load-bearing, do not regress):** per-family card rescue chips still open that family's RescueScene directly (`openRescue(familyId)`); the handout「← 回救急」`?rescue=<familyId>` return-loop still opens that family's scene directly; the homepage still mounts RescueScene for those two paths; the hub's in-place RescueScene mount, shared `useRescuePlans` / `useRescueChips`, and all four unit-correspondence deep-links stay byte-identical.
- **Zero schema / zero sync:** no Dexie `.version()` bump, R2 `SCHEMA_VERSION` stays 28, no `SYNCED_META_KEYS` diff. This is a navigation / information-architecture reorganization plus one narrow UI prop.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-exam-prep-hub`: the rescue status strip requirement gains the「＋ 新增計畫」add affordance (shown only when `0 < activeCount < 5`, opening setup directly) and is asserted as the single homepage-reachable plan-list surface; the RescueScene `'list'` phase is stated as fallback-only. The sibling banner requirement (「The repurposed entry banner SHALL advertise the 考前中心 hub」) is also MODIFIED to drop its now-stale「FamilyPicker header rescue entry … remains unchanged」assertion (that entry now navigates to the hub per `neurons-homepage`), avoiding a spec-level contradiction after archive.
- `neurons-homepage`: the FamilyPicker header「考前救急」entry requirement changes from「opens the rescue-plans overview」to「navigates to the 考前中心 hub」; the per-card chip and `?rescue=` return-loop behaviours are re-affirmed unchanged.

## Impact

- **Code**
  - `apps/neurons-tw/src/components/RescueScene.tsx` — add a narrow `startInSetup?: boolean` prop (boots `phase='setup'` + `setupTouched=true`, preselecting a no-plan family via the existing default); annotate the `'list'` phase as fallback-only. The three load-bearing paths (vanish-fallback, new-plan-lands-on-new-subject default, untouched-setup cross-device-takeover redirect) are untouched for the existing `undefined` / `familyId` entries.
  - `apps/neurons-tw/src/routes/CramPage.tsx` — render the「＋ 新增計畫」strip affordance when `0 < rescuePlans.length < 5`; wire it to open RescueScene with `startInSetup`.
  - `apps/neurons-tw/src/components/FamilyPicker.tsx` + `apps/neurons-tw/src/routes/OverviewPage.tsx` — the header「考前救急」entry calls a new `onOpenExamHub` prop (`() => navigate('/cram')`); the per-card chip keeps `onOpenRescue(familyId)`; RescueScene stays mounted on the homepage for the chip + return-loop.
- **APIs / data**: none. No Dexie bump, R2 `SCHEMA_VERSION` 28 unchanged, no synced-meta-key change, no new deep-link URL format.
- **Docs**: `HelpMenu` copy already points the rescue entry at 首頁 or 題庫→考前中心; verify it still reads correctly (no required edit expected).
