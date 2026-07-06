## Why

The 考前猜題 (`/cram`) 速看重點 section ships a block heading 「🎯 必中考古」 across 5 subject fragments (醫學一 解剖學 / 生理學; 醫學二 藥理學 / 免疫學 / 寄生蟲學). 「必中」(guaranteed-hit) is on the explicit ban list in the `neurons-cram-tab` honesty requirement (MUST NOT use 保證/必中/100%/今年一定考 wording) and directly contradicts the view's own persistent disclaimer 「頻率高 ≠ 今年一定考」. This is pre-existing content shipped in `add-neurons-cram-tab` (commit 9c395143), NOT introduced by `refine-neurons-cram-tab-ux`.

It shipped because honesty enforcement had a scope gap: `build-cram.ts` + `verify-cram.ts` deliberately scoped the guarantee-wording lint to 押題 item fields only, treating 速看 section headings as out of scope (a 「design D7」 carve-out that called 必中考古 "standard 國考 slang"). But the honesty requirement's prose bans guarantee/prediction language across **the feature**, not only 押題 items — so the 必中考古 heading violated the requirement as already written. This is exam-eve honesty-critical (owner ships to peer med students).

## What Changes

- Rename the 速看 block heading 「🎯 必中考古」 → 「🎯 高頻考古」 in all 5 content-source fragments. 「高頻」 is frequency-based and matches the disclaimer 「頻率高 ≠ 今年一定考」; the block's own `<cite>` evidence (反覆考 / 考兩次 / 104–114 反覆) makes 高頻 factually accurate. The 考古 (past-exam) framing is preserved.
- Rebuild the cram content pack (`build:neurons-content`) and re-copy to the app public dir; the built `cram.json` (dist + `apps/neurons-tw/public/…`, both gitignored) no longer contains 必中.
- Close the enforcement gap: extend `verify-cram.ts`'s honesty grep to lint every 速看 block **heading** for the forbidden guarantee phrases (block bodies stay unlinted so legitimate medical stats like a sensitivity of 100% are not false-positived). Update the stale D7-carve-out comments in `build-cram.ts` + `verify-cram.ts`.
- **Not touched:** `CramPage.tsx` (rendering logic) — this is content + build only.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `neurons-cram-tab`: the **押題 items SHALL be honest** requirement is clarified so its guarantee/prediction-language ban explicitly covers every surfaced 考前猜題 string — including 速看 section headings — not only 押題 item fields, and the build-time validator enforces it on 速看 headings. Requirement title/identity is preserved; prose is augmented and one scenario is added.

## Impact

- **Content:** 5 fragments in `packages/content-neurons-tw/src/cram/fragments/` (必中考古 → 高頻考古).
- **Build / validator:** `packages/content-neurons-tw/scripts/build-cram.ts` (comment) + `scripts/verify-cram.ts` (comment + new 速看-heading honesty lint).
- **Build artifacts (gitignored):** `dist/cram.json` + `apps/neurons-tw/public/content/neurons-tw/cram.json` regenerated → 0× 必中, 5× 高頻考古.
- **Spec:** `openspec/specs/neurons-cram-tab/spec.md` — honesty requirement prose + one scenario.
- **Behavior:** user-visible heading wording only. No schema / Dexie / R2 / sync change. No `CramPage.tsx` change.
- **Verification:** `verify:cram` PASS (incl. the new guard; a negative test confirms it fails on reintroduced 必中); `grep -c 必中 …/cram.json` = 0; `pnpm -r typecheck` clean; vitest 826/826 pass.
