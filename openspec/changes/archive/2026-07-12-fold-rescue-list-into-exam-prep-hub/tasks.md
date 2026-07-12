## 1. RescueScene — narrow `startInSetup` entry + `'list'` fallback annotation

- [x] 1.1 Add `startInSetup?: boolean` to `Props` (doc-comment: hub「＋」add-plan entry; the single conscious crossing of the「don't touch RescueScene internals」boundary, replacing the deferred `exitToHost`).
- [x] 1.2 Phase initializer: when `startInSetup && !initialFamilyId`, return `'setup'` (before the `getActivePlans().length > 0 ? 'list' : 'setup'` fallback).
- [x] 1.3 `setupTouched` initializer: init to `true` when `startInSetup && !initialFamilyId` (so the untouched-setup redirect does not bounce it to `'list'`); leave `setupFamily`'s existing「first subject without an active plan」default untouched.
- [x] 1.4 Verify the three load-bearing paths are byte-identical for existing entries (`undefined` / `familyId`): vanish-fallback, new-plan-lands-on-new-subject default, untouched-setup redirect.
- [x] 1.5 Annotate the `'list'` phase block (and the `'list'` type-union member) as **fallback-only** (vanish-safety + in-scene 切科 exit; NOT a homepage entry destination — do not delete in a dead-code audit).

## 2. CramPage (hub) — strip「＋ 新增計畫」add affordance

- [x] 2.1 Add `openRescueSetup()` state helper that opens `RescueScene` with `startInSetup` (no `initialFamilyId`); thread `startInSetup` into the mounted `<RescueScene>` (a `rescueStartInSetup` state flag). **Reset the flag on close (load-bearing, not optional)**: a stale `startInSetup=true` when the strip has fallen back to the empty-state CTA (last plan abandoned cross-device) would skip the untouched-setup B1 protection on the next open. (Family-chip entries are immune via the `!initialFamilyId` guard.)
- [x] 2.2 In the rescue strip's `rescuePlans.length > 0` branch, render a low-key「＋ 新增計畫」affordance at the tail **only when `rescuePlans.length < 5`**; wire it to `openRescueSetup()`. Reuse the existing rescue-strip palette + `<EmojiIcon>`.
- [x] 2.3 Confirm the empty-state (`length === 0`)「建立考前救急」CTA is unchanged, and the per-plan chips + leaf 救急 buttons still call `openRescue(familyId)` unchanged.

## 3. Homepage header entry → navigate('/cram')

- [x] 3.1 `FamilyPicker`: add `onOpenExamHub?: () => void` prop; the header「考前救急」button calls `onOpenExamHub` (keep label「考前救急」). Keep the per-card chip on `onOpenRescue(s.id)`.
- [x] 3.2 `OverviewPage`: pass `onOpenExamHub={() => navigate('/cram')}` to `FamilyPicker`; keep `onOpenRescue={openRescue}`, keep `RescueScene` mounted (per-card chip + `?rescue=` return-loop unchanged).
- [x] 3.3 Confirm the `?rescue=<familyId>` return-loop effect and the per-card `RescueChip` path are untouched.
- [x] 3.4 Surgical stale-comment cleanup in the touched blocks: `FamilyPicker.tsx` header-entry comment (drop the stale「one rescue at a time」line — multi-subject makes it wrong) and `OverviewPage.tsx` `openRescue` comment (the header entry no longer calls `openRescue()`; it now only serves the card chip + `?rescue=` return-loop).

## 4. Verify

- [x] 4.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` green (no new sync/schema tests needed; confirm existing rescue tests still pass).
- [x] 4.2 Browser: homepage header「考前救急」→ client-side navigates to `/cram` (no full reload, no blank).
- [x] 4.3 Browser: with 1–4 active plans, hub strip shows per-plan chips + a「＋ 新增計畫」affordance; tapping「＋」opens rescue setup directly (add-new-plan, preselecting a no-plan subject) — NOT the `'list'` overlay.
- [x] 4.4 (code-verified, not driven to 5 plans) Hub strip「＋」render gate is `rescuePlans.length < 5` (CramPage.tsx:189) over the active-only `useRescuePlans()` list → hidden at exactly 5; per-plan chips (open/edit/abandon) are outside the gate. Browser-driving 5 full blitz flows is disproportionate for a trivial numeric gate.
- [x] 4.5 Browser: per-card rescue chip on the homepage still opens that family's scene directly; the handout「← 回救急」`?rescue=` return-loop still reopens that family's scene.
- [x] 4.6 Browser: direct URL `/cram` + F5 render the hub (not 404 / redirect); zero-plan hub shows the「建立考前救急」CTA.
- [x] 4.7 Confirm zero sync/schema drift: no Dexie `.version()` added, R2 `SCHEMA_VERSION` still 28, no `SYNCED_META_KEYS` diff.
